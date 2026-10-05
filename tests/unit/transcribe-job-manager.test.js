/**
 * Testes do job manager de transcrição (src/transcribe/job-manager.js).
 * Runner injetável — sem binários de whisper.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createTranscriptionJobManager,
  createJsonJobStorage,
  JOB_STATUS,
} from '../../src/transcribe/job-manager.js';

/** Espera até a condição ser verdadeira ou estoura o timeout. */
async function waitFor(cond, { timeoutMs = 2000, stepMs = 10 } = {}) {
  const started = Date.now();
  while (!(await cond())) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor: timeout');
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

function makeRunner(behavior) {
  const calls = [];
  const runner = async (params) => {
    calls.push(params);
    return behavior(params, calls.length);
  };
  return { runner, calls };
}

test('executa job com sucesso e emite eventos added/started/done', async () => {
  const events = [];
  const { runner, calls } = makeRunner(async () => ({ files: [{ path: 'a.txt' }], engine: 'test' }));
  const manager = createTranscriptionJobManager({ runner, onEvent: (e, p) => events.push([e, p]) });

  const job = manager.enqueue({ videoPath: '/v/a.mp4', language: 'pt' });
  assert.equal(job.status, JOB_STATUS.QUEUED);

  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.DONE);

  const names = events.map(([e]) => e);
  assert.ok(names.includes('added'));
  assert.ok(names.includes('started'));
  assert.ok(names.includes('done'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].videoPath, '/v/a.mp4');

  const done = manager.list()[0];
  assert.equal(done.percent, 100);
  assert.deepEqual(done.files, [{ path: 'a.txt' }]);
  manager.dispose();
});

test('limite de concorrência: jobs rodam um por vez', async () => {
  let active = 0;
  let maxActive = 0;
  const { runner } = makeRunner(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 30));
    active--;
    return { files: [] };
  });
  const manager = createTranscriptionJobManager({ runner, maxConcurrent: 1 });

  manager.enqueue({ videoPath: '/v/1.mp4' });
  manager.enqueue({ videoPath: '/v/2.mp4' });
  manager.enqueue({ videoPath: '/v/3.mp4' });

  await waitFor(() => manager.list().every((j) => j.status === JOB_STATUS.DONE));
  assert.equal(maxActive, 1);
  manager.dispose();
});

test('setMaxConcurrent permite mais jobs simultâneos em tempo real', async () => {
  let active = 0;
  let maxActive = 0;
  const { runner } = makeRunner(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 30));
    active--;
    return { files: [] };
  });
  const manager = createTranscriptionJobManager({ runner, maxConcurrent: 1 });

  manager.enqueue({ videoPath: '/v/1.mp4' });
  manager.enqueue({ videoPath: '/v/2.mp4' });
  await new Promise((r) => setTimeout(r, 5));
  manager.setMaxConcurrent(2);

  await waitFor(() => manager.list().every((j) => j.status === JOB_STATUS.DONE));
  assert.ok(maxActive >= 2, `esperava >=2 simultâneos, viu ${maxActive}`);
  manager.dispose();
});

test('retry automático: falha transiente é repetida até dar certo', async () => {
  const events = [];
  let attempts = 0;
  const { runner } = makeRunner(async () => {
    attempts++;
    if (attempts < 2) throw new Error('falha transiente');
    return { files: [] };
  });
  const manager = createTranscriptionJobManager({ runner, maxRetries: 2, retryDelayMs: 20, onEvent: (e, p) => events.push([e, p]) });

  manager.enqueue({ videoPath: '/v/a.mp4' });
  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.DONE);

  assert.equal(attempts, 2);
  assert.ok(events.map(([e]) => e).includes('retry-scheduled'));
  manager.dispose();
});

test('retry esgotado: job termina com error', async () => {
  const { runner } = makeRunner(async () => {
    throw new Error('sempre falha');
  });
  const manager = createTranscriptionJobManager({ runner, maxRetries: 1, retryDelayMs: 10 });

  manager.enqueue({ videoPath: '/v/a.mp4' });
  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.ERROR);

  const job = manager.list()[0];
  assert.equal(job.attempts, 2); // 1 inicial + 1 retry
  assert.match(job.error, /sempre falha/);
  manager.dispose();
});

test('cancelamento de job running propaga AbortSignal ao runner', async () => {
  let sawAbort = false;
  const { runner } = makeRunner(async (params) => {
    return new Promise((resolve, reject) => {
      params.signal.addEventListener('abort', () => {
        sawAbort = true;
        reject(new Error('aborted'));
      });
    });
  });
  const manager = createTranscriptionJobManager({ runner });

  const job = manager.enqueue({ videoPath: '/v/a.mp4' });
  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.RUNNING);

  assert.equal(manager.cancel(job.jobId), true);
  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.CANCELLED);
  assert.equal(sawAbort, true);
  manager.dispose();
});

test('cancelamento de job queued remove da fila sem executar', async () => {
  const { runner, calls } = makeRunner(async () => {
    await new Promise((r) => setTimeout(r, 50));
    return { files: [] };
  });
  const manager = createTranscriptionJobManager({ runner, maxConcurrent: 1 });

  manager.enqueue({ videoPath: '/v/1.mp4' });
  const second = manager.enqueue({ videoPath: '/v/2.mp4' });

  assert.equal(manager.cancel(second.jobId), true);
  await waitFor(() => manager.list().find((j) => j.jobId === second.jobId)?.status === JOB_STATUS.CANCELLED);
  await waitFor(() => manager.list().find((j) => j.videoPath === '/v/1.mp4')?.status === JOB_STATUS.DONE);
  assert.equal(calls.length, 1, 'job cancelado não deve executar');
  manager.dispose();
});

test('retry manual re-enfileira job com error', async () => {
  let attempts = 0;
  const { runner } = makeRunner(async () => {
    attempts++;
    if (attempts === 1) throw new Error('primeira falha');
    return { files: [] };
  });
  const manager = createTranscriptionJobManager({ runner, maxRetries: 0, retryDelayMs: 10 });

  const job = manager.enqueue({ videoPath: '/v/a.mp4' });
  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.ERROR);

  assert.equal(manager.retry(job.jobId), true);
  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.DONE);
  assert.equal(attempts, 2);
  manager.dispose();
});

test('persistência: crash recovery reenfileira jobs running', () => {
  // Storage fake já com um job 'running' de uma sessão anterior (crash).
  const persisted = [
    {
      jobId: 'tr_old_1',
      videoPath: '/v/velho.mp4',
      language: 'pt',
      formats: ['txt'],
      title: '',
      status: 'running',
      attempts: 1,
      stage: 'transcribing',
      percent: 40,
      error: null,
      files: [],
      engine: '',
      createdAt: 1,
      startedAt: 1,
      finishedAt: null,
      nextRetryAt: null,
    },
    {
      jobId: 'tr_old_2',
      videoPath: '/v/pronto.mp4',
      language: 'pt',
      formats: ['txt'],
      title: '',
      status: 'done',
      attempts: 1,
      stage: 'done',
      percent: 100,
      error: null,
      files: [],
      engine: '',
      createdAt: 1,
      startedAt: 1,
      finishedAt: 2,
      nextRetryAt: null,
    },
  ];
  const storage = { load: () => persisted, save: () => {} };
  const { runner, calls } = makeRunner(async () => ({ files: [] }));
  const manager = createTranscriptionJobManager({ runner, storage });

  const restored = manager.load();
  assert.equal(restored.length, 2);

  const crashed = manager.list().find((j) => j.jobId === 'tr_old_1');
  // Crash recovery: running → queued e reprocessado
  return waitFor(() => {
    const j = manager.list().find((x) => x.jobId === 'tr_old_1');
    return j.status === JOB_STATUS.DONE;
  }).then(() => {
    assert.equal(calls[0].videoPath, '/v/velho.mp4');
    const done = manager.list().find((x) => x.jobId === 'tr_old_2');
    assert.equal(done.status, JOB_STATUS.DONE, 'job já concluído não reexecuta');
    assert.equal(crashed.status === JOB_STATUS.RUNNING || crashed.status === JOB_STATUS.QUEUED || crashed.status === JOB_STATUS.DONE, true);
    manager.dispose();
  });
});

test('remove: remove job terminal da lista e da persistência', async () => {
  let persisted = [];
  const storage = { load: () => persisted, save: (jobs) => { persisted = jobs; } };
  const { runner } = makeRunner(async () => ({ files: [] }));
  const manager = createTranscriptionJobManager({ runner, storage });

  const job = manager.enqueue({ videoPath: '/v/a.mp4' });
  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.DONE);
  manager.dispose();

  // nova sessão: recarrega do storage e remove o job concluído
  const events = [];
  const manager2 = createTranscriptionJobManager({ runner, storage, onEvent: (e, p) => events.push([e, p]) });
  const restored = manager2.load();
  assert.equal(restored.length, 1, 'job done deve ser restaurado');

  assert.equal(manager2.remove(job.jobId), true);
  assert.equal(manager2.list().length, 0);
  assert.ok(events.some(([e]) => e === 'removed'));
  // persistência final não contém o job removido
  assert.ok(!persisted.some((j) => j.jobId === job.jobId));
  manager2.dispose();
});

test('remove: recusa job em execução e jobId inexistente', async () => {
  let release;
  const { runner } = makeRunner(() => new Promise((r) => { release = r; }));
  const manager = createTranscriptionJobManager({ runner });

  const job = manager.enqueue({ videoPath: '/v/a.mp4' });
  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.RUNNING);

  assert.equal(manager.remove(job.jobId), false, 'não deve remover job running');
  assert.equal(manager.remove('tr_nao_existe'), false);

  release({ files: [] });
  await waitFor(() => manager.list()[0]?.status === JOB_STATUS.DONE);
  assert.equal(manager.remove(job.jobId), true);
  manager.dispose();
});

test('createJsonJobStorage: roundtrip save/load em arquivo real', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-jobs-'));
  try {
    const file = path.join(tmp, 'jobs.json');
    const storage = createJsonJobStorage({ file });
    assert.deepEqual(storage.load(), []);

    const jobs = [{ jobId: 'tr_x', status: 'done' }];
    storage.save(jobs);
    assert.deepEqual(storage.load(), jobs);

    // Arquivo corrompido não derruba o load
    fs.writeFileSync(file, '{invalid');
    assert.deepEqual(storage.load(), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
