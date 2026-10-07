'use client';

import * as React from 'react';

import { Switch } from '@/components/ui/switch';
import { useIsHydrated } from '@/lib/hooks/use-media-query';
import {
  disablePush,
  enablePush,
  readPushState,
  type PushOutcome,
  type PushState,
} from '@/lib/push/client';

/**
 * The push switch.
 *
 * Reads the current state on mount and never asks for permission there. Every
 * prompt is a consequence of the teacher pressing the switch, which is the only
 * place a browser will accept one anyway.
 *
 * The three things that would otherwise be invisible are stated in the note
 * under the switch rather than discovered later:
 *
 *   iOS without the app installed  Push cannot work, so the switch is disabled
 *                                   and the copy says to add LIKO to the Home
 *                                   Screen. A toggle there would fail silently.
 *   Permission denied              The browser will not prompt again, so the
 *                                   switch is disabled and the copy points at
 *                                   site settings.
 *   No Push API at all             Nothing to enable, so the switch is disabled
 *                                   and the copy names the browsers that work.
 */

type Note = { tone: 'info' | 'success' | 'warning' | 'danger'; text: string };

const READY_STATE: PushState = {
  availability: 'ready',
  permission: 'default',
  subscribed: false,
  ios: false,
  standalone: false,
};

const TONE_CLASS: Record<Note['tone'], string> = {
  info: 'text-ink-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const OUTCOME_UNSUPPORTED =
  'This browser cannot deliver notifications. Use Chrome, Edge, or Firefox on desktop, or install LIKO on iPhone and iPad.';

const OUTCOME_NOTE: Record<PushOutcome['status'], Note> = {
  enabled: { tone: 'success', text: 'On. This device receives the at-risk digest.' },
  disabled: { tone: 'info', text: 'Off. This device no longer receives notifications.' },
  denied: {
    tone: 'warning',
    text: 'Permission was declined. Allow notifications for LIKO in your browser settings, then turn the switch back on.',
  },
  'needs-install': {
    tone: 'info',
    text: 'Add LIKO to your Home Screen to enable notifications.',
  },
  unsupported: { tone: 'info', text: OUTCOME_UNSUPPORTED },
  unconfigured: {
    tone: 'warning',
    text: 'Push is not configured on this deployment yet, so nothing can be subscribed.',
  },
  error: {
    tone: 'danger',
    text: 'That did not work. Check your connection and try again.',
  },
};

function noteFor(state: PushState): Note {
  if (state.availability === 'needs-install') {
    return {
      tone: 'info',
      text: 'Add LIKO to your Home Screen to enable notifications. On iPhone and iPad, push works only in the installed app, never in a browser tab.',
    };
  }

  if (state.availability === 'unsupported') {
    return { tone: 'info', text: OUTCOME_UNSUPPORTED };
  }

  if (state.permission === 'unsupported') {
    return { tone: 'info', text: OUTCOME_UNSUPPORTED };
  }

  if (state.permission === 'denied') {
    return {
      tone: 'warning',
      text: 'Notifications are blocked for LIKO. Allow notifications for this site in your browser settings, then turn the switch back on.',
    };
  }

  if (state.subscribed && state.permission === 'granted') {
    return { tone: 'success', text: 'On. This device receives the at-risk digest.' };
  }

  if (state.permission === 'granted') {
    return {
      tone: 'info',
      text: 'Permission was granted earlier, but this device is not subscribed. Turn the switch on to subscribe it.',
    };
  }

  return {
    tone: 'info',
    text: 'Off. Turning this on asks your browser for permission, and nothing is sent until you agree.',
  };
}

export function PushToggle() {
  const hydrated = useIsHydrated();
  const [state, setState] = React.useState<PushState>(READY_STATE);
  const [loaded, setLoaded] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [note, setNote] = React.useState<Note | null>(null);

  React.useEffect(() => {
    let active = true;

    void readPushState().then((next) => {
      if (!active) return;
      setState(next);
      setLoaded(true);
    });

    return () => {
      active = false;
    };
  }, []);

  const onChange = async (next: boolean) => {
    setPending(true);

    const outcome = next ? await enablePush() : await disablePush();

    setNote(OUTCOME_NOTE[outcome.status]);
    setState(await readPushState());
    setPending(false);
  };

  // Until the state is read, or while a request is in flight, the switch must not
  // pretend to know the answer. A switch that flips optimistically and then
  // silently reverts is worse than one that waits. A denied permission is also
  // terminal from inside the page: the browser will not prompt a second time.
  const disabled =
    !hydrated ||
    !loaded ||
    pending ||
    state.availability !== 'ready' ||
    state.permission === 'denied';

  const active = loaded && state.subscribed && state.permission === 'granted';
  const current = note ?? (hydrated && loaded ? noteFor(state) : null);

  return (
    <div className="flex min-w-[14rem] flex-col items-start gap-2 sm:items-end">
      <div className="flex items-center gap-3">
        <label
          htmlFor="push-notifications"
          className="text-[0.875rem] text-ink-muted sm:sr-only"
        >
          Push notifications
        </label>
        <Switch
          id="push-notifications"
          checked={active}
          disabled={disabled}
          onCheckedChange={(next) => void onChange(next)}
          aria-describedby="push-notifications-note"
          aria-busy={pending}
        />
      </div>

      <p
        id="push-notifications-note"
        aria-live="polite"
        className={`max-w-[30rem] text-[0.8125rem] leading-relaxed sm:text-right ${
          current ? TONE_CLASS[current.tone] : 'text-ink-subtle'
        }`}
      >
        {current ? current.text : 'Checking this device.'}
      </p>
    </div>
  );
}