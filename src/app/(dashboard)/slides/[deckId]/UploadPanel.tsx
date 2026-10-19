'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, CircleAlert, FileText, ImageIcon, Paperclip, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormSuccess } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { queryKeys } from '@/lib/query/keys';
import { toast } from '@/lib/toast';

import {
  importDocument,
  removeDeckAsset,
  type DeckAssetSummary,
  type ImportResult,
} from '../upload/actions';

/**
 * Bringing a file into this deck.
 *
 * WHY THE ACCEPT LIST AND THE SIZE CAP ARRIVE AS PROPS. They are defined once,
 * next to the code that enforces them, and the server page reads them from
 * there. Importing them from that module directly would drag the PDF and Word
 * parsers into the client bundle to display two strings, and the client would
 * then be the place where those strings could drift from the checks that
 * actually matter.
 *
 * WHY THE SIZE IS CHECKED HERE AS WELL AS ON THE SERVER. The server check is
 * the one that counts, and it cannot be skipped. This one exists so a teacher
 * who picks a 200 MB scan is told the limit while they still have the file in
 * their hand, instead of after a long silence and a refused upload.
 */

const FIELD_ID = 'deck-asset-file';

function readableSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1 ? `${Math.round(megabytes)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export interface UploadPanelProps {
  deckId: string;
  /** The `accept` attribute, straight from the extractor. */
  accept: string;
  maxBytes: number;
  /** What is accepted, in words, for the line under the picker. */
  acceptedLabel: string;
  /**
   * Called with the new asset id once an image has been stored.
   *
   * WHY A CALLBACK AND NOT A SHARED STORE. Placing the image on a slide is the
   * editor's decision, made against the slide that is open right now. This panel
   * has no idea which slide that is, and reaching into the editor to find out
   * would couple an upload control to the shape of the editing surface it is
   * mounted inside.
   */
  onImageReady?: (assetId: string) => void;
}

export function UploadPanel({
  deckId,
  accept,
  maxBytes,
  acceptedLabel,
  onImageReady,
}: UploadPanelProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const assetKey = queryKeys.deckAssets(deckId);

  /*
   * WHAT IS ALREADY IN THIS DECK.
   *
   * The panel could add a file and nothing could take one back out, because
   * `removeDeckAsset` existed on the server with no control to hang on. Listing
   * them here is what makes that action reachable, and it is the same list the
   * image picker draws from, so one cache entry serves both.
   *
   * The action returns a summary rather than the stored record: `extractedText`
   * is a whole document and has no business crossing to the browser to render a
   * filename.
   */
  const { data: assets = [] } = useQuery({
    queryKey: assetKey,
    queryFn: async () => {
      const { listDeckAssets: load } = await import('../upload/actions');
      return load(deckId);
    },
    staleTime: 30_000,
  });

  const remove = useMutation({
    mutationFn: async (assetId: string) => {
      const outcome = await removeDeckAsset({ deckId, assetId });
      // A refusal resolves rather than throws, so it is re-thrown here. That is
      // what routes it to `onError` and leaves the row on screen, instead of
      // dropping a file the server did not actually remove.
      if (!outcome.ok) throw new Error(outcome.message);
      return outcome;
    },
    onMutate: (assetId) => {
      setRemovingId(assetId);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'That file could not be removed.'),
    onSuccess: (outcome) => {
      toast.success(outcome.message);
      void queryClient.invalidateQueries({ queryKey: assetKey });
    },
    onSettled: () => setRemovingId(null),
  });

  const upload = useMutation({
    mutationFn: async (chosen: File) => {
      // FormData rather than a typed argument because the bytes are what is
      // crossing the boundary. Sending a File as an action argument re-encodes
      // it through the payload for no reason.
      const form = new FormData();
      form.set('deckId', deckId);
      form.set('file', chosen);
      return importDocument(form);
    },
    onSuccess: (outcome) => {
      setResult(outcome);
      if (!outcome.ok) return;

      // Cleared so the same file can be picked again straight away. Choosing the
      // same file twice in a row does not fire a change event otherwise, and
      // the teacher is left pressing Import with nothing to send.
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      // The new file belongs in the list below without a reload.
      void queryClient.invalidateQueries({ queryKey: assetKey });

      if (outcome.kind === 'image' && outcome.assetId) onImageReady?.(outcome.assetId);
    },
    onError: () => {
      setResult({
        ok: false,
        message: 'That file could not be uploaded. Check your connection and try again.',
        kind: null,
        assetId: null,
        wordCount: null,
        truncated: false,
      });
    },
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || upload.isPending) return;

    if (file.size > maxBytes) {
      setResult({
        ok: false,
        message: `"${file.name}" is ${readableSize(file.size)}. The limit is ${readableSize(maxBytes)}, so split the document or bring in the part you need.`,
        kind: null,
        assetId: null,
        wordCount: null,
        truncated: false,
      });
      return;
    }

    upload.mutate(file);
  };

  const busy = upload.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bring in a file</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-body text-ink-muted">
          A PDF, Word file or plain text is read for you and its words are ready to turn into
          slides. An image is kept as it is, so you can place it on a slide.
        </p>

        <form onSubmit={submit} aria-busy={busy} className="flex flex-col gap-4">
          <FormField
            id={FIELD_ID}
            label="Choose a file"
            hint={`Accepted: ${acceptedLabel}. Up to ${readableSize(maxBytes)}.`}
          >
            {(props) => (
              <Input
                {...props}
                ref={inputRef}
                type="file"
                accept={accept}
                disabled={busy}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setResult(null);
                }}
              />
            )}
          </FormField>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!file || busy}>
              <ArrowUp size={17} aria-hidden="true" />
              {busy ? 'Importing' : 'Import'}
            </Button>

            {/*
              A polite live region rather than a spinner. The wait is a few
              seconds and can be longer for a long PDF, and announcing it stops
              the button looking broken on a connection that is merely slow.
            */}
            <span role="status" aria-live="polite" className="text-meta text-ink-muted">
              {busy
                ? `Reading ${file?.name ?? 'the file'}. A long PDF can take a moment.`
                : file
                  ? `${file.name}, ${readableSize(file.size)}`
                  : 'Nothing chosen yet.'}
            </span>
          </div>
        </form>

        {/*
          Every refusal lands here, including the ones that matter most. A scan
          arrives as a refusal saying it is a scan, never as a success with
          nothing in it, because an import that reads zero words is the outcome
          a teacher is least able to work out what to do about.
        */}
        {result?.ok ? (
          <FormSuccess>
            <Paperclip size={16} aria-hidden="true" className="mt-0.5" />
            <span>{result.message}</span>
          </FormSuccess>
        ) : null}

        {result && !result.ok ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-[12px] border border-danger bg-danger-subtle p-3.5 text-meta font-medium text-danger"
          >
            <CircleAlert
              size={15}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />
            <span>{result.message}</span>
          </p>
        ) : null}

        {/*
          WHAT IS ALREADY IN THIS DECK. Added because the server could remove a
          file and no teacher could ask it to. A row per file, each with its own
          Remove, and the button names the file rather than saying "Remove" three
          times, because a screen reader user otherwise cannot tell which of the
          three buttons they are on.
        */}
        <section aria-labelledby="deck-assets-heading" className="flex flex-col gap-2">
          <h3 id="deck-assets-heading" className="text-h4 text-ink">
            Files in this deck
          </h3>

          {assets.length === 0 ? (
            <p className="text-meta text-ink-muted">
              Nothing here yet. Anything you bring in will be listed so you can take it out again.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {assets.map((asset: DeckAssetSummary) => {
                const removing = removingId === asset.id;
                return (
                  <li key={asset.id} className="flex items-center gap-3 py-2">
                    {asset.kind === 'image' ? (
                      <ImageIcon size={16} aria-hidden="true" className="shrink-0 text-ink-muted" />
                    ) : (
                      <FileText size={16} aria-hidden="true" className="shrink-0 text-ink-muted" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-body text-ink" title={asset.filename}>
                      {asset.filename}
                    </span>
                    <span className="shrink-0 text-meta text-ink-muted">
                      {readableSize(asset.byteSize)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={removing || remove.isPending}
                      onClick={() => remove.mutate(asset.id)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      {removing ? 'Removing' : 'Remove'}
                      <span className="sr-only">{` ${asset.filename}`}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}