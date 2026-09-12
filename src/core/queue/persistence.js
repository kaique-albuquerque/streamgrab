/**
 * DownloadQueue — persistence and crash recovery helpers.
 */

import { createJsonStore } from '../storage.js';
import { isNonTerminal } from './constants.js';

/**
 * Snapshot da fila (jobs nao terminais) para persistir.
 * Nao inclui estado de execucao: ao restaurar, tudo vira `queued`.
 */
export function createSnapshot(orderedJobs) {
  return orderedJobs()
    .filter(isNonTerminal)
    .map((j) => ({ id: j.id, url: j.url, title: j.title, meta: j.meta }));
}

/**
 * Restaura um snapshot: jobs em andamento sao revalidados como queued.
 */
export function restoreSnapshot(engine, snapshot, order) {
  if (!Array.isArray(snapshot)) return;
  for (const item of snapshot) {
    if (!item || !item.url) continue;
    const job = engine.enqueue(item.url, {
      id: item.id,
      title: item.title || '',
      meta: { ...(item.meta || {}), recovered: true },
    });
    order.push(job.id);
  }
}

/**
 * Persiste o snapshot via storage (se fornecido).
 */
export function persistSnapshot(storage, snapshot) {
  if (!storage) return null;
  storage.save({ jobs: snapshot });
  return storage.get();
}

/**
 * Restaura do storage persistido (se houver).
 */
export function loadFromStorage(storage) {
  if (!storage) return [];
  const data = storage.get();
  return Array.isArray(data?.jobs) ? data.jobs : [];
}

/**
 * Cria o storage padrao para persistencia da fila.
 */
export function createDefaultQueueStorage({ file }) {
  return createJsonStore({ file, version: 1, defaults: { jobs: [] } });
}
