// Mock API responses only in tests to check the important dashboard states and navigation.
import { render, screen, fireEvent } from '@testing-library/react';
import { test, expect, vi } from 'vitest';
import { App } from './App';
import type { Day } from './types';
const empty: Day = {
  date: '2026-03-09',
  timezone: 'UTC',
  lastSynced: null,
  activeSeconds: 0,
  idleSeconds: 0,
  longestSession: { seconds: 0, appName: null },
  appSwitches: 0,
  apps: [],
  timeline: [],
};
function respond(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
    }),
  );
}
test('unpaired state offers a real pairing workflow', async () => {
  respond({ error: 'Pair your device' }, 401);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Pair your Mac/ }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Choose “Pair this browser”')).toBeInTheDocument();
});
test('paired empty state contains no fabricated activity', async () => {
  respond(empty);
  const { container } = render(<App />);
  expect(await screen.findByText('nemu is listening quietly.')).toBeInTheDocument();
  expect(screen.getAllByText('0m')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  expect(
    Array.from(container.querySelectorAll('img'), (image) => image.getAttribute('src')),
  ).toEqual(
    expect.arrayContaining([
      '/assets/nemu-hero-anime-reference.png',
      '/assets/nemu-reflection-anime-reference.png',
      '/assets/nemu-sidebar-anime-reference.png',
    ]),
  );
});
test('populated day renders uploaded metrics and idle deliberately', async () => {
  respond({
    ...empty,
    lastSynced: '2026-03-09T12:00:00Z',
    activeSeconds: 3600,
    idleSeconds: 600,
    longestSession: { seconds: 3600, appName: 'TextEdit' },
    apps: [{ name: 'TextEdit', bundleId: 'com.apple.TextEdit', seconds: 3600, percentage: 100 }],
    timeline: [
      {
        id: '1',
        sessionId: '1',
        kind: 'idle',
        appName: '',
        bundleId: '',
        startedAt: '2026-03-09T11:00:00Z',
        endedAt: '2026-03-09T11:10:00Z',
        seconds: 600,
        endReason: 'resume',
      },
    ],
  });
  render(<App />);
  expect(await screen.findByText('TextEdit')).toBeInTheDocument();
  expect(screen.getByText('Away from your Mac')).toBeInTheDocument();
  expect(screen.getAllByText('1h 0m').length).toBeGreaterThan(0);
});
test('network failure has an actionable retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
  expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
});
test('navigation contains only Today and Settings and keeps today selected on return', async () => {
  respond(empty);
  render(<App />);
  await screen.findByText('nemu is listening quietly.');
  expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Choose a day')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByText('Only the essentials.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Today' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('today');
  expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
});
