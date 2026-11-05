// Fila — visibilidade de jobs terminados (regressão: a aba Fila ficava vazia).
//
// `queue.all()` alimenta a UI. Ele precisa incluir concluídos/falhos, senão
// o usuário não vê o resultado do lote nem consegue repetir um download que
// falhou. `queue.list()` continua apenas com os não-terminais e o
// `snapshot()` (persistência) não deve guardar terminados.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDownloadQueue } from '../../src/core/queue/index.js';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

class FakeEngine {
  constructor() {
    this._jobs = new Map();
    this._listeners = new Map();
    this._id = 0;
  }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const arr = this._listeners.get(event) || [];
    const i = arr.indexOf(handler);
    if (i !== -1) arr.splice(i, 1);
  }

  enqueue(url, { title = '', meta = {} } = {}) {
    const job = { id: `job-${++this._id}`, url, title, meta: { ...meta }, state: 'queued', error: null };
    this._jobs.set(job.id, job);
    return this.getJob(job.id);
  }

  getJob(id) {
    const j = this._jobs.get(String(id));
    return j ? { ...j, meta: { ...j.meta } } : null;
  }

  getQueue() { return [...this._jobs.values()].filter((j) => !TERMINAL.has(j.state)); }
  getAllJobs() { return [...this._jobs.values()]; }
  getHistory() { return [...this._jobs.values()].filter((j) => TERMINAL.has(j.state)); }

  async run(id) {
    const job = this._jobs.get(String(id));
    if (!job) return null;
    job.state = 'downloading';
    job.state = 'completed';
    for (const h of this._listeners.get('complete') || []) h({ jobId: job.id });
    return job;
  }

  pause(id) { const j = this._jobs.get(String(id)); if (j) j.state = 'paused'; }
  resume(id) { const j = this._jobs.get(String(id)); if (j) j.state = 'queued'; }
  cancel(id) { const j = this._jobs.get(String(id)); if (j) j.state = 'cancelled'; }
  remove(id) { this._jobs.delete(String(id)); }
}

async function waitFor(fn, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    if (fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

test('fila: all() inclui job concluído (aba Fila não fica vazia)', async () => {
  const engine = new FakeEngine();
  const queue = createDownloadQueue({ engine, maxConcurrent: 1 });

  queue.enqueue('https://cdn.example/a.mp4', { title: 'A' });
  await waitFor(() => engine.getHistory().length === 1);

  assert.equal(queue.list().length, 0, 'list() mantém apenas não-terminais');
  const all = queue.all();
  assert.equal(all.length, 1);
  assert.equal(all[0].state, 'completed');
  assert.equal(all[0].title, 'A');
});

test('fila: jobs falhos aparecem em all() para permitir retry', async () => {
  const engine = new FakeEngine();
  engine.run = async (id) => {
    const job = engine._jobs.get(String(id));
    job.state = 'failed';
    job.error = { code: 'HTTP_403' };
    for (const h of engine._listeners.get('error') || []) h({ jobId: job.id });
  };
  const queue = createDownloadQueue({ engine, autoStart: true });

  queue.enqueue('https://cdn.example/protegido.mp4', { title: 'P' });
  await waitFor(() => engine.getHistory().length === 1);

  const failed = queue.all().filter((j) => j.state === 'failed');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].error.code, 'HTTP_403');
});

test('fila: snapshot de persistência não guarda jobs terminados', async () => {
  const engine = new FakeEngine();
  const queue = createDownloadQueue({ engine, maxConcurrent: 1 });
  queue.enqueue('https://cdn.example/a.mp4', { title: 'A' });
  await waitFor(() => engine.getHistory().length === 1);

  assert.equal(queue.all().length, 1);
  assert.equal(queue.snapshot().length, 0);
});

test('fila: exibe no máximo 100 terminados, mantendo os mais recentes', () => {
  const engine = new FakeEngine();
  const queue = createDownloadQueue({ engine, autoStart: false });
  for (let i = 0; i < 105; i++) {
    const job = queue.enqueue(`https://cdn.example/v${i}.mp4`, { title: `V${i}` });
    engine._jobs.get(job.id).state = 'completed';
  }
  const all = queue.all();
  assert.equal(all.length, 100);
  assert.equal(all[0].title, 'V5', 'os 5 mais antigos saem da listagem');
  assert.equal(all.at(-1).title, 'V104');
});
