/**
 * Teste do fluxo translateCharsPerSecond: settings → job → runner.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

mock.module('electron', {
  namedExports: {
    BrowserWindow: { getAllWindows: () => [] },
    ipcMain: { handle() {} },
    app: { getPath: () => '/tmp' },
  },
});

test('translate:start propaga translateCharsPerSecond do settings ao job', async () => {
  const ipcHandlers = new Map();

  const electron = await import('electron');
  electron.ipcMain.handle = (channel, handler) => {
    ipcHandlers.set(channel, handler);
  };

  // Mock do model-manager: o handler e security-payloads-queue o importam.
  mock.module('../../src/translate/model-manager.js', {
    namedExports: {
      getTranslateModelStatus: () => ({ installed: true, label: 'Qwen3-4B', path: '/fake/model.gguf' }),
      isKnownTranslateModel: (m) => m === 'qwen3-4b' || m === 'qwen2.5-7b',
      DEFAULT_TRANSLATE_MODEL: 'qwen3-4b',
      TRANSLATE_MODEL_CATALOG: {},
      getTranslateModelEntry: () => null,
      listTranslateModels: () => [],
      getTranslateModelsDir: () => '',
      setTranslateModelsDirResolver: () => {},
      downloadTranslateModel: async () => ({}),
      deleteTranslateModel: () => ({}),
    },
  });

  // Mock do job-manager: o provider o importa para criar o manager.
  const enqueued = [];
  const fakeManager = {
    enqueue: (params) => {
      enqueued.push(params);
      return { jobId: 'tl_test', status: 'queued' };
    },
    cancel: () => true,
    retry: () => true,
    remove: () => true,
    list: () => [],
    load: () => [],
    dispose: () => {},
  };
  mock.module('../../src/translate/job-manager.js', {
    namedExports: {
      createTranslateJobManager: () => fakeManager,
      createJsonJobStorage: () => ({ load: () => [], save: () => {} }),
      JOB_STATUS: { QUEUED: 'queued', RUNNING: 'running', DONE: 'done', ERROR: 'error', CANCELLED: 'cancelled' },
      defaultTranslateRunner: async () => ({ files: [], engine: 'llama-cpp' }),
    },
  });

  // Serviços fake: settings com preferência de leitura customizada.
  const { setServices, addRevealRoot } = await import('../../electron/ipc/state.js');
  setServices({
    settings: {
      get: (key) => (key === 'translateCharsPerSecond' ? 23 : undefined),
    },
  });
  addRevealRoot('/tmp');

  const { registerStartHandler } = await import('../../electron/ipc/translate/job-handlers.js');
  registerStartHandler();

  const srtPath = '/tmp/v.srt';
  fs.writeFileSync(srtPath, '1\n00:00:00,000 --> 00:00:01,000\nHi\n', 'utf8');

  const handler = ipcHandlers.get('translate:start');
  const res = await handler({}, { srtPath, model: 'qwen3-4b', targetLang: 'pt' });

  assert.equal(res.ok, true);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].charsPerSecond, 23);

  setServices(null);
});
