'use client';
import { useEffect, useState } from 'react';
import type { productionCapability } from '@vululu/contracts';
export type StudioState = {
  cursor: number;
  production?: NonNullable<ReturnType<typeof productionCapability>> | null;
  project: { campaign: { name: string } | null; context: { name: string; offers: { name: string }[] } };
  revisions: { version: number; approvedAt: string | null }[];
  operations: {
    id: string;
    tool: string;
    state: string;
    revision: number;
    costState: string;
    maxCents: number;
    reportedCents: number | null;
  }[];
  renders: { id: string; revision: number; state: string; reason: string | null; createdAt: string }[];
  media: { id: string; sceneKey: string; model: string; revision: number; state: string }[];
  events: { cursor: number; kind: string; state: string; createdAt: string }[];
  providers: { kind: string; model: string; availability: string }[];
};
export type Connection = 'connecting' | 'live' | 'polling' | 'offline' | 'denied';
// Events are invalidations, not patches. Only a successfully read snapshot advances the applied cursor.
export function useStudioFeed(id: string, refresh: () => Promise<void>, deny: (status: number) => void) {
  const [state, setState] = useState<StudioState | null>(null),
    [connection, setConnection] = useState<Connection>('connecting');
  useEffect(() => {
    const base = `/api/projects/${encodeURIComponent(id)}/studio`,
      ctrl = new AbortController();
    let stopped = false,
      es: EventSource | null = null,
      applied = -1,
      inFlight = false,
      again = false,
      nextStream = 0,
      failures = 0,
      syncFailures = 0,
      nextPollAt = 0,
      mode: Connection = 'connecting';
    const MAX_SYNC_FAILURES = 8;
    let wake: ReturnType<typeof setTimeout> | undefined;
    const status = (m: Connection) => {
      mode = m;
      if (!stopped) setConnection(m);
    };
    const close = () => {
      es?.close();
      es = null;
    };
    const denied = (n: number) => {
      close();
      setState(null);
      status('denied');
      stopped = true;
      deny(n);
    };
    function queue() {
      if (stopped || wake) return;
      wake = setTimeout(() => {
        wake = undefined;
        void sync();
      }, 100);
    }
    function broken() {
      close();
      status(navigator.onLine ? 'polling' : 'offline');
      nextStream = Date.now() + Math.min(30000, 3000 * 2 ** Math.min(failures++, 4));
      queue();
    }
    function connect() {
      if (stopped || es || typeof EventSource === 'undefined' || Date.now() < nextStream) return;
      const src = new EventSource(base + '/stream?after=' + Math.max(0, applied));
      es = src;
      src.onopen = () => {
        if (es === src) {
          failures = 0;
          status('live');
        }
      };
      src.addEventListener('change', (e: MessageEvent) => {
        const seq = Number(e.lastEventId);
        if (es === src && Number.isSafeInteger(seq) && seq > applied) queue();
      });
      src.addEventListener('reset', () => {
        if (es === src) {
          close();
          applied = -1;
          queue();
        }
      });
      src.addEventListener('denied', (e: MessageEvent) => {
        if (es === src) denied(Number(e.data));
      });
      src.onerror = () => {
        if (es === src) broken();
      };
    }
    async function sync() {
      if (stopped) return;
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      try {
        const res = await fetch(base + '/state', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: ctrl.signal,
        });
        if (stopped) return;
        if ([401, 403, 404].includes(res.status)) {
          denied(res.status);
          return;
        }
        if (res.status === 429) {
          const retryHeader = Number(res.headers.get('Retry-After'));
          const retryMs =
            Number.isFinite(retryHeader) && retryHeader > 0 ? Math.min(30000, retryHeader * 1000) : 8000;
          syncFailures += 1;
          nextPollAt = Date.now() + retryMs;
          status(syncFailures >= MAX_SYNC_FAILURES ? 'offline' : 'polling');
          return;
        }
        if (!res.ok) throw Error();
        const snap = (await res.json()) as StudioState;
        if (stopped) return;
        syncFailures = 0;
        nextPollAt = 0;
        if (applied !== snap.cursor || mode !== 'live') {
          await refresh();
          if (stopped) return;
        }
        setState(snap);
        applied = snap.cursor;
        if (!es) {
          status('polling');
          connect();
        }
      } catch {
        if (!stopped) {
          close();
          syncFailures += 1;
          nextPollAt = Date.now() + Math.min(30000, 4000 * 2 ** Math.min(syncFailures - 1, 3));
          status(!navigator.onLine || syncFailures >= MAX_SYNC_FAILURES ? 'offline' : 'polling');
        }
      } finally {
        inFlight = false;
        if (again && syncFailures < MAX_SYNC_FAILURES) {
          again = false;
          queue();
        } else {
          again = false;
        }
      }
    }
    function offline() {
      close();
      status('offline');
    }
    function online() {
      if (stopped) return;
      nextStream = 0;
      syncFailures = 0;
      nextPollAt = 0;
      if (applied >= 0) connect();
      queue();
    }
    void sync();
    const poll = setInterval(() => {
      if (!stopped && mode !== 'live' && syncFailures < MAX_SYNC_FAILURES && Date.now() >= nextPollAt) {
        void sync();
      }
    }, 4000);
    const reconcile = setInterval(() => {
      if (!stopped && mode === 'live' && syncFailures < MAX_SYNC_FAILURES) void sync();
    }, 30000);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      stopped = true;
      close();
      ctrl.abort();
      clearTimeout(wake);
      clearInterval(poll);
      clearInterval(reconcile);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [id, refresh, deny]);
  return { state, connection };
}
