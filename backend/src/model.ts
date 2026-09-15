import { z } from 'zod';
import { DateTime } from 'luxon';
export const id = z.string().regex(/^[a-f0-9]{32}$/);
const utc = z
  .string()
  .datetime({ offset: false })
  .transform((v) => new Date(v).toISOString());
export const intervalSchema = z
  .object({
    id,
    session_id: id,
    kind: z.enum(['app', 'idle']),
    app_name: z.string().max(200),
    bundle_id: z.string().max(255),
    started_at: utc,
    ended_at: utc,
    end_reason: z.enum([
      'app_switch',
      'idle',
      'resume',
      'sleep',
      'shutdown',
      'restart',
      'pause',
      'checkpoint',
    ]),
  })
  .strict()
  .superRefine((v, ctx) => {
    const d = Date.parse(v.ended_at) - Date.parse(v.started_at);
    if (d <= 0 || d > 86400000)
      ctx.addIssue({ code: 'custom', message: 'Invalid interval duration' });
    if (v.kind === 'idle' ? v.app_name !== '' || v.bundle_id !== '' : !v.app_name || !v.bundle_id)
      ctx.addIssue({ code: 'custom', message: 'Invalid app identity' });
  });
export const batchSchema = z
  .object({
    schema_version: z.literal(1),
    batch_id: id,
    device_id: id,
    intervals: z.array(intervalSchema).min(1).max(90),
  })
  .strict();
export type Interval = z.infer<typeof intervalSchema>;
export type Batch = z.infer<typeof batchSchema>;
export function validateBatch(input: unknown, now: Date): Batch {
  const b = batchSchema.parse(input);
  const seen = new Set<string>();
  let end = 0;
  for (const v of b.intervals) {
    const start = Date.parse(v.started_at),
      stop = Date.parse(v.ended_at);
    if (start < 0 || stop > now.getTime() + 60000 || start < end || seen.has(v.id))
      throw new Error('Invalid batch chronology or retention');
    seen.add(v.id);
    end = stop;
  }
  return b;
}
export function dayBounds(date: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || zone.length > 100) throw new Error('Invalid day');
  const start = DateTime.fromISO(date, { zone }).startOf('day');
  if (!start.isValid || start.toISODate() !== date) throw new Error('Invalid day or timezone');
  return { start: start.toMillis(), end: start.plus({ days: 1 }).toMillis() };
}
export function summarize(
  intervals: Interval[],
  date: string,
  zone: string,
  lastSynced: string | null,
) {
  const bounds = dayBounds(date, zone);
  const apps = new Map<string, { name: string; bundleId: string; seconds: number }>();
  const sessions = new Map<string, { seconds: number; appName: string }>();
  let activeSeconds = 0,
    idleSeconds = 0,
    switches = 0;
  const timeline: {
    id: string;
    sessionId: string;
    kind: string;
    appName: string;
    bundleId: string;
    startedAt: string;
    endedAt: string;
    seconds: number;
    endReason: string;
  }[] = [];
  for (const v of intervals) {
    const rawEnd = Date.parse(v.ended_at);
    if (
      v.kind === 'app' &&
      v.end_reason === 'app_switch' &&
      rawEnd >= bounds.start &&
      rawEnd < bounds.end
    )
      switches++;
    const start = Math.max(bounds.start, Date.parse(v.started_at)),
      end = Math.min(bounds.end, rawEnd);
    if (end <= start) continue;
    const seconds = (end - start) / 1000;
    if (v.kind === 'idle') idleSeconds += seconds;
    else {
      activeSeconds += seconds;
      const app = apps.get(v.bundle_id) ?? { name: v.app_name, bundleId: v.bundle_id, seconds: 0 };
      app.seconds += seconds;
      apps.set(v.bundle_id, app);
      const session = sessions.get(v.session_id) ?? { seconds: 0, appName: v.app_name };
      session.seconds += seconds;
      sessions.set(v.session_id, session);
    }
    const prev = timeline.at(-1);
    if (prev && prev.sessionId === v.session_id && prev.endedAt === new Date(start).toISOString()) {
      prev.endedAt = new Date(end).toISOString();
      prev.seconds += seconds;
      prev.endReason = v.end_reason;
    } else
      timeline.push({
        id: v.id,
        sessionId: v.session_id,
        kind: v.kind,
        appName: v.app_name,
        bundleId: v.bundle_id,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(end).toISOString(),
        seconds,
        endReason: v.end_reason,
      });
  }
  const longest = [...sessions.values()].sort((a, b) => b.seconds - a.seconds)[0] ?? {
    seconds: 0,
    appName: null,
  };
  return {
    date,
    timezone: zone,
    lastSynced,
    activeSeconds,
    idleSeconds,
    longestSession: longest,
    appSwitches: switches,
    apps: [...apps.values()]
      .sort((a, b) => b.seconds - a.seconds)
      .map((a) => ({ ...a, percentage: activeSeconds ? (a.seconds / activeSeconds) * 100 : 0 })),
    timeline,
  };
}
