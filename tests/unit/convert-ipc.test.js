/**
 * Testes do registro dos canais IPC de conversão.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('electron', {
  namedExports: {
    BrowserWindow: { getAllWindows: () => [] },
    ipcMain: { handle() {} },
    app: { getPath: () => '/tmp' },
  },
});

test('registra os canais de conversão', async () => {
  const ipcHandlers = new Map();

  const electron = await import('electron');
  electron.ipcMain.handle = (channel, handler) => {
    ipcHandlers.set(channel, handler);
  };

  const { registerConvertStartHandler, registerConvertCancelHandler } = await import(
    '../../electron/ipc/convert-handlers.js'
  );
  registerConvertStartHandler();
  registerConvertCancelHandler();

  assert.ok(ipcHandlers.has('convert:start'), 'canal convert:start ausente');
  assert.ok(ipcHandlers.has('convert:cancel'), 'canal convert:cancel ausente');
});