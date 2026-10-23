/**
 * Persistência (JSON em arquivo) e snapshot dos jobs.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Storage JSON em arquivo (atomic write: temp + rename).
 *
 * @param {{ file: string }} params
 */
export function createJsonJobStorage({ file }) {
  return {
    load() {
      try {
        if (!fs.existsSync(file)) return [];
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(raw) ? raw : [];
      } catch {
        return [];
      }
    },
    save(jobs) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf8');
        fs.renameSync(tmp, file);
      } catch {
        /* persistência nunca derruba o fluxo */
      }
    },
  };
}

/** Snapshot serializável de um job (sem refs de runtime). */
export function snapshot(job) {
  return {
    jobId: job.jobId,
    videoPath: job.videoPath,
    language: job.language,
    formats: job.formats,
    title: job.title,
    model: job.model,
    status: job.status,
    attempts: job.attempts,
    stage: job.stage,
    percent: job.percent,
    error: job.error,
    files: job.files,
    engine: job.engine,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    nextRetryAt: job.nextRetryAt,
  };
}
