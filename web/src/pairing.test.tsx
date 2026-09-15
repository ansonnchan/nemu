import { render, screen, fireEvent } from '@testing-library/react';
import { test, expect, vi } from 'vitest';
test('expired pairing remains visible and offers a new link workflow', async () => {
  window.location.hash = 'pair=' + 'a'.repeat(64);
  const fetch = vi
    .fn()
    .mockResolvedValue({
      ok: false,
      status: 410,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Expired' }),
    });
  vi.stubGlobal('fetch', fetch);
  const { App } = await import('./App');
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('This pairing link has expired');
  expect(window.location.hash).toBe('');
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Pair again/ }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
