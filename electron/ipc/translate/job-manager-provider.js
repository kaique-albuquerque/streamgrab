/**
 * Job manager da sessão de tradução (singleton) e ponte de eventos.
 */

import path from 'node:path';
import {
  TRANSLATE_JOB_MANAGER_MODULE,
  TRANSLATE_MODULE,
  bindTranslateModelsDir,
  broadcast,
} from './shared.js';

/** Job manager da sessão (singleton, criado sob demanda). */
let jobManager = null;

/** Traduz eventos do job manager em canais de broadcast do renderer. */
function managerEventBridge(event, payload) {
  switch (event) {
    case 'progress':
      broadcast('translate:progress', payload);
      break;
    case 'log':
      broadcast('translate:log', payload);
      break;
    case 'done':
      broadcast('translate:done', payload);
      break;
    case 'cancelled':
      broadcast('translate:error', { ...payload, cancelled: true, suggestedAction: 'Tradução cancelada.' });
      break;
    case 'removed':
      broadcast('translate:removed', payload);
      break;
    case 'error':
      broadcast('translate:error', {
        ...payload,
        cancelled: false,
        suggestedAction: 'Verifique o arquivo e tente novamente.',
      });
      break;
    default:
      broadcast('translate:job-updated', payload);
  }
}

/** Cria (uma única vez) o job manager com persistência em userData. */
export async function ensureJobManager() {
  if (jobManager) return jobManager;

  const { app } = await import('electron');
  await bindTranslateModelsDir(app);
  const { createTranslateJobManager, createJsonJobStorage } = await import(TRANSLATE_JOB_MANAGER_MODULE);
  const { defaultTranslateRunner } = await import(TRANSLATE_MODULE);

  jobManager = createTranslateJobManager({
    maxConcurrent: 1,
    storage: createJsonJobStorage({
      file: path.join(app.getPath('userData'), 'translate-jobs.json'),
    }),
    runner: defaultTranslateRunner,
    onEvent: managerEventBridge,
  });
  jobManager.load();
  return jobManager;
}

/** Instância atual (pode ser null antes do primeiro handler). */
export function getJobManager() {
  return jobManager;
}