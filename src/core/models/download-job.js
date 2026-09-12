// ---------------------------------------------------------------------------
// DownloadJob model — lifecycle, transitions, and serialization.
// ---------------------------------------------------------------------------

import { nowIso } from './helpers.js';
import { isValidJobState, isValidCheckpointTaskState, canTransition } from './job-states.js';
import { createFormat } from './format.js';
import { createSegmentCheckpoint } from './checkpoint.js';

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

let jobSequence = 0;

/**
 * Gera um ID de job unico, resistente a colisao apos crash recovery.
 * Formato: job-<timestamp>-<random> — nunca colide com IDs restaurados
 * de storage (que usam o formato legado "job-<n>").
 */
function generateJobId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `job-${ts}-${rand}`;
}

function serializeError(err) {
  if (err === null || typeof err !== 'object') return String(err);
  return {
    message: String(err.message || String(err)),
    code: err.code || '',
    needsAuth: Boolean(err.needsAuth),
    status: err.status || 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Cria um DownloadJob com estado inicial `queued`.
 *
 * @param {object} [opts]
 * @param {string} [opts.id]
 * @param {string} opts.url
 * @param {string} [opts.title]
 * @param {object} [opts.meta]
 */
export function createDownloadJob({ id, url, title = '', meta = {} } = {}) {
  if (!url || typeof url !== 'string') {
    throw new TypeError('createDownloadJob: url e obrigatoria');
  }
  if (meta === null || typeof meta !== 'object') {
    throw new TypeError('createDownloadJob: meta deve ser um objeto');
  }
  jobSequence += 1;
  const now = nowIso();
  return {
    id: String(id || generateJobId()),
    url,
    title: String(title || ''),
    state: 'queued',
    error: null,
    meta: {
      ...meta,
      taskState: isValidCheckpointTaskState(meta.taskState) ? meta.taskState : 'pending',
      taskStateUpdatedAt: String(meta.taskStateUpdatedAt || now),
      checkpoint: meta.checkpoint ? createSegmentCheckpoint(meta.checkpoint) : undefined,
    },
    createdAt: now,
    updatedAt: now,
    history: [{ from: null, to: 'queued', at: now }],
  };
}

/**
 * Transiciona o job para `nextState`, validando contra JOB_TRANSITIONS.
 * Lanca Error com code 'INVALID_JOB_TRANSITION' se a transicao for invalida.
 */
export function transitionJob(job, nextState, { error = null } = {}) {
  if (!isValidJobState(nextState)) {
    const err = new Error(`Estado invalido: "${nextState}"`);
    err.code = 'INVALID_JOB_STATE';
    throw err;
  }
  if (!canTransition(job.state, nextState)) {
    const err = new Error(`Transicao invalida: ${job.state} -> ${nextState}`);
    err.code = 'INVALID_JOB_TRANSITION';
    throw err;
  }
  const now = nowIso();
  job.state = nextState;
  job.updatedAt = now;
  job.error = error ? serializeError(error) : null;
  job.history.push({ from: job.history.at(-1).to, to: nextState, at: now });
  return job;
}

/** Serializa o job sem campos circulares (metodos, referencias). */
export function serializeJob(job) {
  return {
    id: job.id,
    url: job.url,
    title: job.title,
    state: job.state,
    error: job.error,
    meta: { ...job.meta },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    history: job.history.map((entry) => ({ ...entry })),
  };
}

export function toJson(job) {
  return serializeJob(job);
}

// ---------------------------------------------------------------------------
// Helpers de conveniencia (shape "antigo" -> modelo)
// ---------------------------------------------------------------------------

/**
 * Converte uma variant HLS/master (shape: uri, resolution, width, height,
 * bandwidth, codecs) em um Format normalizado.
 */
export function formatFromVariant(variant = {}) {
  return createFormat({
    formatId: '',
    url: String(variant.uri || ''),
    container: '',
    codecs: String(variant.codecs || ''),
    qualityLabel: String(variant.resolution || ''),
    bitrate: Number(variant.bandwidth || 0) || 0,
    width: Number(variant.width) || 0,
    height: Number(variant.height) || 0,
    hasVideo: true,
    hasAudio: true,
  });
}
