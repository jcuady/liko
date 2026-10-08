'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArchiveIcon,
  CardsIcon,
  PencilSimpleIcon,
  PlusIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import type { DeckRecord } from '@/lib/api/types';

import { archiveDeckAction, createDeckAction, updateDeckAction } from './actions';

/**
 * Deck list with create, rename and archive.
 *
 * WHY EVERY WRITE REFRESHES THE ROUTER. The list is rendered from server props
 * rather than observed through a query, so invalidating alone would leave the
 * screen showing what was there a moment ago. Same reasoning as
 * `ClassesManager`.
 */

type DeckSummary = DeckRecord & { slideCount: number };

function when(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DecksList({ decks }: { decks: DeckSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [editing, setEditing] = React.useState<DeckSummary | null>(null);

  const refresh = async () => {
    await router.refresh();
  };

  const create = useMutation({
    mutationFn: () => createDeckAction({ title, description }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setOpen(false);
      setTitle('');
      setDescription('');
      // Straight into the deck. An empty list with a successful "created" toast
      // is the most common way a new feature feels broken.
      router.push(`/slides/${result.deckId}`);
    },
  });

  const rename = useMutation({
    mutationFn: () => updateDeckAction({ deckId: editing?.id ?? '', title, description }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setEditing(null);
      toast.success(result.message);
      await refresh();
    },
  });

  const archive = useMutation({
    mutationFn: (deckId: string) => archiveDeckAction({ deckId }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await refresh();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setTitle('');
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <PlusIcon size={18} weight="bold" aria-hidden="true" />
              New deck
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New deck</DialogTitle>
              <DialogDescription>
                It opens with a title slide you can replace straight away.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <FormField id="deck-title" label="Title" required>
                {(props) => (
                  <Input
                    {...props}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Reaction rates"
                  />
                )}
              </FormField>
              <FormField
                id="deck-description"
                label="Description"
                hint="Optional. Only you see this."
              >
                {(props) => (
                  <Textarea
                    {...props}
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                )}
              </FormField>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? 'Creating' : 'Create deck'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {decks.length === 0 ? (
        <EmptyState
          icon={CardsIcon}
          title="No decks yet"
          description="A deck holds the slides for one lesson. Create one and the slides are editable straight away."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {decks.map((deck) => (
            <li key={deck.id}>
              <Card className="flex h-full flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                  <div>
                    <h2 className="text-h4">
                      <Link
                        href={`/slides/${deck.id}`}
                        className="rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {deck.title}
                      </Link>
                    </h2>
                    {deck.description ? (
                      <p className="mt-1.5 text-meta text-ink-muted">{deck.description}</p>
                    ) : null}
                  </div>

                  <p className="mt-auto flex items-center gap-2 text-meta text-ink-muted">
                    <Badge tone="neutral">
                      {deck.slideCount} {deck.slideCount === 1 ? 'slide' : 'slides'}
                    </Badge>
                    <span>edited {when(deck.updatedAt)}</span>
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/slides/${deck.id}`}>
                        <PencilSimpleIcon size={15} weight="bold" aria-hidden="true" />
                        Open
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={archive.isPending}
                      onClick={() => archive.mutate(deck.id)}
                    >
                      <ArchiveIcon size={15} weight="bold" aria-hidden="true" />
                      Archive
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(deck);
                        setTitle(deck.title);
                        setDescription(deck.description);
                      }}
                    >
                      Rename
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename deck</DialogTitle>
            <DialogDescription>Slides and notes are unaffected.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <FormField id="rename-title" label="Title" required>
              {(props) => (
                <Input {...props} value={title} onChange={(event) => setTitle(event.target.value)} />
              )}
            </FormField>
            <FormField id="rename-description" label="Description">
              {(props) => (
                <Textarea
                  {...props}
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              )}
            </FormField>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={rename.isPending} onClick={() => rename.mutate()}>
              {rename.isPending ? 'Saving' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}