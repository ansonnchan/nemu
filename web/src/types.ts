// Dashboard response and loading states; an unpaired browser is distinct from a paired, empty day.
export type Day = {
  date: string;
  timezone: string;
  lastSynced: string | null;
  activeSeconds: number;
  idleSeconds: number;
  longestSession: { seconds: number; appName: string | null };
  appSwitches: number;
  apps: { name: string; bundleId: string; seconds: number; percentage: number }[];
  timeline: {
    id: string;
    sessionId: string;
    kind: string;
    appName: string;
    bundleId: string;
    startedAt: string;
    endedAt: string;
    seconds: number;
    endReason: string;
  }[];
  archived?: boolean;
};
export type LoadState =
  | { kind: 'loading' }
  | { kind: 'unpaired' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; day: Day };
