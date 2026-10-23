/**
 * Job manager da sessão (singleton) e ponte de eventos para o renderer.
 */

import path from 'node:path';
import { JOB_MANAGER_MODULE, TRANSCRIBE_MODULE, bindModelsDir, broadcast } from './shared.js';

/** Job manager da sessão (singleton, criado sob demanda). */
let jobManager = null;

/** Traduz eventos do job manager em canais de broadcast do renderer. */
function managerEventBridge(event, payload) {
  switch (event) {
    case 'progress':
      broadcast('transcribe:progress', payload);
      break;
    case 'log':
      broadcast('transcribe:log', payload);
      break;
    case 'done':
      broadcast('transcribe:done', payload);
      break;
    case 'cancelled':
      broadcast('transcribe:error', {
        ...payload,
        cancelled: true,
        suggestedAction: 'Transcrição cancelada.',
      });
      break;
    case 'removed':
      broadcast('transcribe:removed', payload);
      break;
    case 'error':
      broadcast('transcribe:error', {
        ...payload,
        cancelled: false,
        suggestedAction: 'Verifique o arquivo selecionado e tente novamente.',
      });
      break;
    default:
      // added, started, retry-scheduled
      broadcast('transcribe:job-updated', payload);
  }
}

/** Cria (uma única vez) o job manager com persistência em userData. */
export async function ensureJobManager() {
  if (jobManager) return jobManager;

  const { app } = await import('electron');
  // Antes de qualquer job (inclusive os retomados de `load()`), o motor precisa
  // saber onde os modelos baixados pelo app ficam.
  await bindModelsDir(app);
  const { createTranscriptionJobManager, createJsonJobStorage } = await import(JOB_MANAGER_MODULE);
  const { transcribeVideo } = await import(TRANSCRIBE_MODULE);

  jobManager = createTranscriptionJobManager({
    maxConcurrent: 1,
    storage: createJsonJobStorage({
      file: path.join(app.getPath('userData'), 'transcribe-jobs.json'),
    }),
    runner: transcribeVideo,
    onEvent: managerEventBridge,
  });
  jobManager.load();
  return jobManager;
}

/** Instância atual (pode ser null antes do primeiro handler). */
export function getJobManager() {
  return jobManager;
}
