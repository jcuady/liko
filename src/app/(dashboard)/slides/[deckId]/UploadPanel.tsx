'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowUp, CircleAlert, Paperclip } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormSuccess } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

import { importDocument, type ImportResult } from '../upload/actions';

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
  const inputRef = React.useRef<HTMLInputElement>(null);

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
      </CardContent>
    </Card>
  );
}