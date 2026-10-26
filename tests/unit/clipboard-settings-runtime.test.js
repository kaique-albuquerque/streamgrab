// Regressao: o toggle "observar area de transferencia" precisa ligar/desligar
// o watcher em runtime, sem exigir reiniciar o app.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyRuntimeSettings } from '../../electron/ipc/settings-runtime.js';

function fakeWatcher() {
  const calls = [];
  return {
    calls,
    setEnabled(value) {
      calls.push(value);
    },
  };
}

test('applyRuntimeSettings desliga o watcher quando clipboardWatch = false', () => {
  const watcher = fakeWatcher();
  applyRuntimeSettings({ clipboardWatch: false }, { clipboardWatcher: watcher });
  assert.deepEqual(watcher.calls, [false]);
});

test('applyRuntimeSettings religa o watcher quando clipboardWatch = true', () => {
  const watcher = fakeWatcher();
  applyRuntimeSettings({ clipboardWatch: true }, { clipboardWatcher: watcher });
  assert.deepEqual(watcher.calls, [true]);
});

test('applyRuntimeSettings ignora payloads sem clipboardWatch', () => {
  const watcher = fakeWatcher();
  applyRuntimeSettings({ turbo: true }, { clipboardWatcher: watcher });
  applyRuntimeSettings(undefined, { clipboardWatcher: watcher });
  assert.deepEqual(watcher.calls, []);
});

test('applyRuntimeSettings nao quebra sem watcher disponivel', () => {
  assert.doesNotThrow(() => applyRuntimeSettings({ clipboardWatch: false }, {}));
  assert.doesNotThrow(() => applyRuntimeSettings({ clipboardWatch: false }));
});
