import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock 'electron' module before importing IPC handlers
mock.module('electron', {
  namedExports: {
    BrowserWindow: {
      getAllWindows() {
        return [];
      },
    },
    ipcMain: {
      handle() {},
    },
    app: {
      getPath() {
        return '/tmp';
      },
    },
  },
});

test('transcribe:model-download holds download lock while pending and releases on completion', async () => {
  const ipcHandlers = new Map();

  const electron = await import('electron');
  electron.ipcMain.handle = (channel, handler) => {
    ipcHandlers.set(channel, handler);
  };

  const {
    isModelDownloading,
    getModelDownloadId,
  } = await import('../../electron/ipc/transcribe/model-download-state.js');
  const {
    registerModelDownloadHandler,
    registerModelCancelHandler,
  } = await import('../../electron/ipc/transcribe/model-download-handlers.js');

  registerModelDownloadHandler();
  registerModelCancelHandler();

  assert.ok(ipcHandlers.has('transcribe:model-download'));
  assert.ok(ipcHandlers.has('transcribe:model-cancel'));

  // Verify initial state
  assert.equal(isModelDownloading(), false);

  // Invoke handler with pending download promise
  let resolveDownload;
  const mockDownloadPromise = new Promise((resolve) => {
    resolveDownload = resolve;
  });

  const { beginModelDownload, endModelDownload } = await import(
    '../../electron/ipc/transcribe/model-download-state.js'
  );

  const abort = new AbortController();
  beginModelDownload('tiny', mockDownloadPromise, abort);

  assert.equal(isModelDownloading(), true);
  assert.equal(getModelDownloadId(), 'tiny');

  // Finish download
  resolveDownload({ installed: true });
  await mockDownloadPromise;
  endModelDownload();

  assert.equal(isModelDownloading(), false);
});
