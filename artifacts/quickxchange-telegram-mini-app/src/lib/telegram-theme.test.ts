import assert from 'node:assert/strict';
import test from 'node:test';
import { subscribeTelegramTheme } from './telegram-theme';

test('Telegram appearance changes update Light and Dark without reopening the app', () => {
  let listener: (() => void) | undefined;
  let dark = false;
  const host = {
    colorScheme: 'dark' as 'light' | 'dark',
    onEvent: (event: string, callback: () => void) => {
      assert.equal(event, 'themeChanged');
      listener = callback;
    },
    offEvent: (event: string, callback: () => void) => {
      assert.equal(event, 'themeChanged');
      assert.equal(callback, listener);
      listener = undefined;
    },
  };
  const cleanup = subscribeTelegramTheme(host, {
    classList: { toggle: (name, enabled) => {
      assert.equal(name, 'dark');
      dark = enabled;
    } },
  });
  assert.equal(dark, true);
  host.colorScheme = 'light';
  listener?.();
  assert.equal(dark, false);
  host.colorScheme = 'dark';
  listener?.();
  assert.equal(dark, true);
  cleanup();
  assert.equal(listener, undefined);
});