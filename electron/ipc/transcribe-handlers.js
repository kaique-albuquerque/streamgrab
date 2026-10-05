/**
 * Handlers IPC de transcrição — módulo src/transcribe.
 *
 * Canais:
 *  - transcribe:check          → disponibilidade (engine + binário + modelo)
 *  - transcribe:start          → enfileira transcrição no job manager
 *  - transcribe:cancel         → cancela job (running → abort; queued → remove)
 *  - transcribe:retry          → re-enfileira job cancelado/erro
 *  - transcribe:remove         → remove job terminal da lista (done/error/cancelled)
 *  - transcribe:job-list       → jobs da sessão (com persistência em userData)
 *  - transcribe:model-status   → status do modelo GGML em userData
 *  - transcribe:model-download → baixa o modelo (com progresso/retomada)
 *  - transcribe:model-cancel   → cancela download em andamento
 *
 * Eventos broadcast para o renderer:
 *  - transcribe:progress       → { jobId, stage, percent, ... }
 *  - transcribe:log            → { jobId, line }
 *  - transcribe:done           → { jobId, files, engine, ... }
 *  - transcribe:error          → { jobId, cancelled, error, ... }
 *  - transcribe:job-updated    → snapshot do job (added/started/retry)
 *  - transcribe:model-progress → { percent, downloaded, total, ... }
 */

import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { friendlyReport } from '../../src/core/errors.js';
import { validateTranscribePayload, validateTranscribeJobPayload } from '../security.js';
import { addRevealRoot } from './state.js';

const TRANSCRIBE_MODULE = '../../src/transcribe/index.js';
const MODEL_MANAGER_MODULE = '../../src/transcribe/model-manager.js';
const JOB_MANAGER_MODULE = '../../src/transcribe/job-manager.js';

/** Job manager da sessão (singleton, criado sob demanda). */
let jobManager = null;

/** Download do modelo em andamento (evita downloads duplicados). */
let modelDownloadPromise = null;
let modelDownloadAbort = null;

function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}

/** Diretório gravável dos modelos: userData/whisper/models (env tem prioridade). */
function resolveModelsDir(app) {
  return process.env.WHISPER_MODEL_DIR || path.join(app.getPath('userData'), 'whisper', 'models');
}

function invalidPayloadResponse(message, suggestedAction) {
  return { ok: false, error: { message, suggestedAction } };
}

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
async function ensureJobManager() {
  if (jobManager) return jobManager;

  const { app } = await import('electron');
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

export function registerTranscribeHandlers() {
  // ---------------------------------------------------------------- check
  ipcMain.handle('transcribe:check', async () => {
    try {
      const { checkTranscriptionAvailable, checkWhisperCpp, checkTransformers } = await import(TRANSCRIBE_MODULE);
      const availability = await checkTranscriptionAvailable();
      const cpp = checkWhisperCpp();
      const transformers = await checkTransformers();
      return {
        ok: availability.available,
        engine: availability.engine,
        reason: availability.reason || '',
        whisperCpp: {
          available: cpp.available,
          binPath: cpp.binPath,
          modelsDir: cpp.modelsDir,
        },
        transformers: { available: Boolean(transformers) },
      };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao verificar disponibilidade da transcrição.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });

  // ----------------------------------------------------------------- start
  ipcMain.handle('transcribe:start', async (_event, rawPayload) => {
    const payload = validateTranscribePayload(rawPayload);
    if (!payload) {
      return invalidPayloadResponse(
        'Payload de transcrição inválido.',
        'Verifique o arquivo selecionado e os parâmetros e tente novamente.',
      );
    }

    if (!fs.existsSync(payload.videoPath)) {
      return invalidPayloadResponse(
        `Arquivo não encontrado: ${payload.videoPath}`,
        'O arquivo pode ter sido movido ou removido. Selecione-o novamente.',
      );
    }

    // Permite "mostrar na pasta" para os arquivos gerados ao lado do vídeo.
    addRevealRoot(path.dirname(payload.videoPath));

    try {
      const manager = await ensureJobManager();
      const job = manager.enqueue(payload);
      return { ok: true, jobId: job.jobId, job };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao enfileirar transcrição.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });

  // ---------------------------------------------------------------- cancel
  ipcMain.handle('transcribe:cancel', async (_event, rawPayload) => {
    const payload = validateTranscribeJobPayload(rawPayload);
    if (!payload) {
      return invalidPayloadResponse('Job de transcrição inválido.', 'Recarregue a aba e tente novamente.');
    }
    const manager = await ensureJobManager();
    const cancelled = manager.cancel(payload.jobId);
    if (!cancelled) {
      return invalidPayloadResponse(
        'Job de transcrição não encontrado ou já finalizado.',
        'Atualize a lista de jobs e tente novamente.',
      );
    }
    return { ok: true };
  });

  // ----------------------------------------------------------------- retry
  ipcMain.handle('transcribe:retry', async (_event, rawPayload) => {
    const payload = validateTranscribeJobPayload(rawPayload);
    if (!payload) {
      return invalidPayloadResponse('Job de transcrição inválido.', 'Recarregue a aba e tente novamente.');
    }
    const manager = await ensureJobManager();
    const requeued = manager.retry(payload.jobId);
    if (!requeued) {
      return invalidPayloadResponse(
        'Job não pode ser repetido (apenas jobs com erro ou cancelados).',
        'Atualize a lista de jobs e tente novamente.',
      );
    }
    return { ok: true };
  });

  // ---------------------------------------------------------------- remove
  ipcMain.handle('transcribe:remove', async (_event, rawPayload) => {
    const payload = validateTranscribeJobPayload(rawPayload);
    if (!payload) {
      return invalidPayloadResponse('Job de transcrição inválido.', 'Recarregue a aba e tente novamente.');
    }
    const manager = await ensureJobManager();
    const removed = manager.remove(payload.jobId);
    if (!removed) {
      return invalidPayloadResponse(
        'Job não pode ser removido (transcrição em execução?).',
        'Aguarde terminar ou cancele o job antes de removê-lo.',
      );
    }
    return { ok: true };
  });

  // -------------------------------------------------------------- job-list
  ipcMain.handle('transcribe:job-list', async () => {
    try {
      const manager = await ensureJobManager();
      return { ok: true, jobs: manager.list() };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao listar transcrições.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });

  registerModelHandlers();
}

/** Handlers do modelo GGML (download em runtime para userData). */
function registerModelHandlers() {
  // --------------------------------------------------------- model-status
  ipcMain.handle('transcribe:model-status', async () => {
    try {
      const { app } = await import('electron');
      const { getModelStatus, DEFAULT_MODEL } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);
      const status = getModelStatus(modelsDir, DEFAULT_MODEL);
      return { ok: true, modelsDir, ...status };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao verificar o modelo de transcrição.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });

  // ------------------------------------------------------- model-download
  ipcMain.handle('transcribe:model-download', async () => {
    if (modelDownloadPromise) {
      return invalidPayloadResponse(
        'Download do modelo já em andamento.',
        'Acompanhe o progresso na tela de transcrição.',
      );
    }

    try {
      const { app } = await import('electron');
      const { downloadModel, DEFAULT_MODEL } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);

      modelDownloadAbort = new AbortController();
      modelDownloadPromise = downloadModel({
        modelsDir,
        model: DEFAULT_MODEL,
        signal: modelDownloadAbort.signal,
        onProgress: (progress) => broadcast('transcribe:model-progress', progress),
      });

      const status = await modelDownloadPromise;
      return { ok: true, modelsDir, ...status };
    } catch (err) {
      const cancelled = err?.cancelled === true || modelDownloadAbort?.signal?.aborted;
      const report = friendlyReport(err);
      return {
        ok: false,
        cancelled,
        error: {
          message: report.message,
          suggestedAction: cancelled
            ? 'Download cancelado. Você pode retomá-lo quando quiser.'
            : report.suggestedAction || 'Verifique sua conexão e tente novamente — o progresso é retomado.',
        },
      };
    } finally {
      modelDownloadPromise = null;
      modelDownloadAbort = null;
    }
  });

  // -------------------------------------------------------- model-cancel
  ipcMain.handle('transcribe:model-cancel', async () => {
    if (!modelDownloadPromise) {
      return invalidPayloadResponse('Nenhum download de modelo em andamento.', 'Atualize o status do modelo.');
    }
    modelDownloadAbort?.abort();
    return { ok: true };
  });
}
