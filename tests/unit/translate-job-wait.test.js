/**
 * Teste de integração: job enfileirado durante o download do modelo espera.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTranslateJobManager } from '../../src/translate/job-manager.js';

test('job espera o modelo ficar instalado antes de traduzir', async () => {
  const events = [];
  let installed = false;
  let runnerCalls = 0;

  const manager = createTranslateJobManager({
    maxRetries: 0,
    runner: async ({ srtPath, signal, onProgress }) => {
      runnerCalls++;
      // O runner real checaria o modelo; aqui simulamos a espera.
      const { waitForTranslateModel } = await import('../../src/translate/wait-model.js');
      const r = await waitForTranslateModel({
        model: 'qwen3-4b',
        isInstalled: () => installed,
        waitMs: 5,
        maxWaitMs: 500,
        signal,
        onWaiting: () => onProgress?.({ stage: 'waiting-model', percent: 0 }),
      });
      if (!r.installed) throw new Error(r.message);
      return { files: [{ path: srtPath.replace('.srt', '.pt.srt') }], engine: 'llama-cpp' };
    },
    onEvent: (e, p) => events.push([e, p]),
  });

  const job = manager.enqueue({ srtPath: '/tmp/a.srt', model: 'qwen3-4b' });
  assert.equal(job.status, 'queued');

  // Modelo fica disponivel depois de 50ms.
  setTimeout(() => { installed = true; }, 50);

  const done = await new Promise((resolve) => {
    const check = () => {
      const j = manager.list().find((x) => x.jobId === job.jobId);
      if (j?.status === 'done') resolve(j);
      else if (j?.status === 'error') resolve(j);
      else setTimeout(check, 10);
    };
    check();
  });

  assert.equal(done.status, 'done');
  assert.equal(runnerCalls, 1);
  assert.ok(events.some(([e]) => e === 'progress'), 'deve emitir progresso da espera');
});