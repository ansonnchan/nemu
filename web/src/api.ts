// Same-origin API calls use the browser cookie; permanent device credentials never enter this client.
import type { Day } from './types';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(503, 'The journal service isn’t connected yet.');
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(response.status, data.error ?? 'Your journal couldn’t be loaded.');
  return data as T;
}
export const loadDay = (date: string, zone: string, signal?: AbortSignal) =>
  request<Day>(`/day?date=${encodeURIComponent(date)}&timezone=${encodeURIComponent(zone)}`, {
    signal,
  });
// Use local date parts; slicing an ISO timestamp would switch days at UTC midnight.
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function duration(seconds: number) {
  if (seconds === 0) return '0m';
  if (seconds < 60) return '<1m';
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
