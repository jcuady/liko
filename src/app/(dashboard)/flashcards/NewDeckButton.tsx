'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { createDeck } from './actions';

/**
 * Creates a deck, and optionally publishes it into a class.
 *
 * WHY SHARING IS A PICKER AND NOT A TOGGLE. The server refuses to share a deck
 * into a class the caller does not own, so offering the control where it would
 * fail would be offering a button that lies. `classes` arrives already narrowed
 * to the caller's own classes, which means every option here is one the write
 * will actually accept. An account with no classes gets no picker rather than a
 * disabled one that has to be explained.
 */
export function NewDeckButton({ classes }: { classes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [classId, setClassId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = title.trim().length > 0;

  const onSubmit = () => {
    if (!valid) {
      setError('Give the deck a title.');
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await createDeck({
        title,
        subject,
        description,
        // Empty string means "do not share". `null` is a class with no id, and
        // the two are not interchangeable, so the mapping is explicit.
        classId: classId === '' ? null : classId,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setTitle('');
      setSubject('');
      setDescription('');
      setClassId('');
      if (result.deckId) router.push(`/flashcards/${result.deckId}`);
      else router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus size={16} aria-hidden="true" />
          New deck
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New deck</DialogTitle>
          <DialogDescription>
            A deck is a set of question and answer cards. You can keep it to
            yourself or share it with a class you teach.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="deck-title">Title</Label>
            <Input
              id="deck-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Chemistry: key terms"
              aria-invalid={Boolean(error)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="deck-subject">Subject</Label>
            <Input
              id="deck-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Chemistry"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="deck-description">Description</Label>
            <Input
              id="deck-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this deck covers"
            />
          </div>

          {classes.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="deck-class">Share with</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger id="deck-class">
                  <SelectValue placeholder="Just me" />
                </SelectTrigger>
                <SelectContent>
                  {/* The private option lives inside the group rather than
                      beside it: "just me" and each class are the same choice,
                      and a bare item next to a labelled group is two different
                      kinds of thing stacked in one list. */}
                  <SelectGroup>
                    <SelectItem value="">Just me</SelectItem>
                    {classes.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-meta text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={!valid || pending}>
            {pending ? 'Creating…' : 'Create deck'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}