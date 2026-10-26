/** Registro de jobs do DownloadEngine: fila, historico e consulta. */

import { createDownloadJob, serializeJob, isTerminalJobState } from '../../models/index.js';

/** Gera um id de job unico (`job-<ts36>-<rand>`). */
export function nextJobId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `job-${ts}-${rand}`;
}

export function getJob(engine, id) {
  const job = engine._jobs.get(String(id));
  return job ? serializeJob(job) : null;
}

export function getQueue(engine) {
  return [...engine._jobs.values()]
    .filter((j) => !isTerminalJobState(j.state)).map(serializeJob);
}

export function getHistory(engine) {
  return [...engine._jobs.values()]
    .filter((j) => isTerminalJobState(j.state)).map(serializeJob);
}

export function removeJob(engine, id) {
  const job = engine._jobs.get(String(id));
  if (!job) {
    const err = new Error(`Job nao encontrado: ${id}`);
    err.code = 'JOB_NOT_FOUND';
    throw err;
  }
  if (!isTerminalJobState(job.state)) {
    const err = new Error(`Job ${id} ainda nao terminou (${job.state}).`);
    err.code = 'JOB_ACTIVE';
    throw err;
  }
  engine._jobs.delete(job.id);
  return true;
}

export function enqueueJob(engine, url, { id, title = '', meta = {} } = {}) {
  const job = createDownloadJob({ id: id || nextJobId(), url, title, meta });
  engine._jobs.set(job.id, job);
  return serializeJob(job);
}
