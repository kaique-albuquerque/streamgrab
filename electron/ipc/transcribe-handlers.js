/**
 * Handlers IPC de transcrição — módulo src/transcribe.
 *
 * Canais:
 *  - transcribe:check          → disponibilidade (engine + binário)
 *  - transcribe:start          → enfileira transcrição no job manager
 *  - transcribe:cancel         → cancela job (running → abort; queued → remove)
 *  - transcribe:retry          → re-enfileira job cancelado/erro
 *  - transcribe:remove         → remove job terminal da lista (done/error/cancelled)
 *  - transcribe:job-list       → jobs da sessão (com persistência em userData)
 *  - transcribe:models         → status de todos os modelos do catálogo
 *  - transcribe:model-status   → status de um modelo GGML em userData
 *  - transcribe:model-download → baixa um modelo (com progresso/retomada)
 *  - transcribe:model-cancel   → cancela download em andamento
 *  - transcribe:model-delete   → exclui os arquivos de um modelo baixado
 *
 * Eventos broadcast para o renderer:
 *  - transcribe:progress       → { jobId, stage, percent, ... }
 *  - transcribe:log            → { jobId, line }
 *  - transcribe:done           → { jobId, files, engine, ... }
 *  - transcribe:error          → { jobId, cancelled, error, ... }
 *  - transcribe:job-updated    → snapshot do job (added/started/retry)
 *  - transcribe:model-progress → { model, percent, downloaded, total, ... }
 */

import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { friendlyReport } from '../../src/core/errors.js';
import { checkDiskSpace } from '../../src/core/disk.js';
import { validateTranscribePayload, validateTranscribeJobPayload, validateModelPayload } from '../security.js';
import { addRevealRoot, getServices } from './state.js';

const TRANSCRIBE_MODULE = '../../src/transcribe/index.js';
const MODEL_MANAGER_MODULE = '../../src/transcribe/model-manager.js';
const JOB_MANAGER_MODULE = '../../src/transcribe/job-manager.js';

/** Job manager da sessão (singleton, criado sob demanda). */
let jobManager = null;

/** Download de modelo em andamento (um por vez) e o modelo em questão. */
let modelDownloadPromise = null;
let modelDownloadAbort = null;
let modelDownloadId = null;

function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}

/** Diretório gravável dos modelos: userData/whisper/models (env tem prioridade). */
function resolveModelsDir(app) {
  return process.env.WHISPER_MODEL_DIR || path.join(app.getPath('userData'), 'whisper', 'models');
}

/**
 * Registra no model-manager onde o app grava os modelos.
 *
 * Sem isso o motor procuraria o modelo apenas ao lado do binário do
 * whisper.cpp e um modelo baixado pela interface nunca seria encontrado.
 */
async function bindModelsDir(app) {
  const { setModelsDirResolver } = await import(MODEL_MANAGER_MODULE);
  setModelsDirResolver(() => resolveModelsDir(app));
}

/** Diretório de modelos do motor (whisper.cpp), usado como fallback de leitura. */
async function engineModelsDir() {
  const { checkWhisperCpp } = await import(TRANSCRIBE_MODULE);
  return checkWhisperCpp().modelsDir;
}

/** Algum job ativo (em execução ou na fila) está usando este modelo? */
async function isModelInUseByActiveJob(model) {
  const { JOB_STATUS } = await import(JOB_MANAGER_MODULE);
  const { DEFAULT_MODEL } = await import(MODEL_MANAGER_MODULE);
  return Boolean(
    jobManager
      ?.list()
      .some(
        (job) =>
          [JOB_STATUS.RUNNING, JOB_STATUS.QUEUED].includes(job.status) &&
          (job.model || DEFAULT_MODEL) === model,
      ),
  );
}

/** Mensagem de bloqueio quando o modelo está fora do diretório do app ('' se pode excluir). */
function externalInstallMessage(model, modelDir, modelsDir) {
  if (!modelDir || path.resolve(modelDir) === path.resolve(modelsDir)) return '';
  return `O modelo "${model}" está instalado fora do diretório do aplicativo (${modelDir}).`;
}

function invalidPayloadResponse(message, suggestedAction) {
  return { ok: false, error: { message, suggestedAction } };
}

/**
 * Valida o payload de um handler `transcribe:model-*`.
 *
 * @returns {{ payload: { model: string } } | { response: object }}
 */
function readModelPayload(rawPayload) {
  const payload = validateModelPayload(rawPayload);
  if (!payload) {
    return {
      response: invalidPayloadResponse(
        'Modelo de transcrição inválido.',
        'Recarregue a aba de transcrição e tente novamente.',
      ),
    };
  }
  return { payload };
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

export function registerTranscribeHandlers() {
  // ---------------------------------------------------------------- check
  ipcMain.handle('transcribe:check', async () => {
    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
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

    // O modelo escolhido precisa estar baixado: melhor recusar aqui do que
    // extrair o áudio inteiro para depois falhar.
    const { app } = await import('electron');
    await bindModelsDir(app);
    const { getModelStatusFor } = await import(MODEL_MANAGER_MODULE);
    const modelStatus = getModelStatusFor(payload.model, await engineModelsDir());
    if (!modelStatus.installed) {
      return invalidPayloadResponse(
        `O modelo "${modelStatus.label || payload.model}" ainda não foi baixado.`,
        'Abra a lista de modelos na aba Transcrição e baixe o modelo escolhido antes de iniciar.',
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

/** Handlers dos modelos GGML (catálogo, download e exclusão em runtime). */
function registerModelHandlers() {
  // ----------------------------------------------------------- models (all)
  ipcMain.handle('transcribe:models', async () => {
    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
      const { listModelsFor, DEFAULT_MODEL } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);
      const selectedModel = getServices()?.settings?.get('transcribeModel') || DEFAULT_MODEL;
      return {
        ok: true,
        modelsDir,
        defaultModel: DEFAULT_MODEL,
        selectedModel,
        downloading: modelDownloadId,
        models: listModelsFor(await engineModelsDir()),
      };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao listar os modelos de transcrição.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });

  // --------------------------------------------------------- model-status
  ipcMain.handle('transcribe:model-status', async (_event, rawPayload) => {
    const { payload, response } = readModelPayload(rawPayload);
    if (!payload) return response;

    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
      const { getModelStatusFor } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);
      const status = getModelStatusFor(payload.model, await engineModelsDir());
      return { ok: true, modelsDir, downloading: modelDownloadId, ...status };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao verificar o modelo de transcrição.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });

  // ------------------------------------------------------- model-download
  ipcMain.handle('transcribe:model-download', async (_event, rawPayload) => {
    const { payload, response } = readModelPayload(rawPayload);
    if (!payload) return response;

    if (modelDownloadPromise) {
      return invalidPayloadResponse(
        `Download do modelo "${modelDownloadId}" já em andamento.`,
        'Aguarde o término ou cancele o download atual.',
      );
    }

    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
      const { downloadModel, getModelStatus, getModelStatusFor, MODEL_CATALOG } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);
      const info = MODEL_CATALOG[payload.model];

      // Já existe uma instalação do whisper.cpp com este modelo? Não baixa 465 MB de novo.
      const anywhere = getModelStatusFor(payload.model, await engineModelsDir());
      if (anywhere.installed && anywhere.externalDir) {
        return { ok: true, modelsDir, alreadyInstalled: true, ...anywhere };
      }

      // Modelos grandes: só bloqueia se realmente não houver espaço.
      const current = getModelStatus(modelsDir, payload.model);
      if (!current.installed) {
        const missingBytes = Math.max(0, (info?.expectedSize || 0) - current.partialSize);
        await checkDiskSpace({ dir: modelsDir, requiredBytes: missingBytes });
      }

      modelDownloadId = payload.model;
      modelDownloadAbort = new AbortController();
      modelDownloadPromise = downloadModel({
        modelsDir,
        model: payload.model,
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
        model: payload.model,
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
      modelDownloadId = null;
    }
  });

  // -------------------------------------------------------- model-cancel
  ipcMain.handle('transcribe:model-cancel', async () => {
    if (!modelDownloadPromise) {
      return invalidPayloadResponse('Nenhum download de modelo em andamento.', 'Atualize o status dos modelos.');
    }
    modelDownloadAbort?.abort();
    return { ok: true };
  });

  // -------------------------------------------------------- model-delete
  ipcMain.handle('transcribe:model-delete', async (_event, rawPayload) => {
    const { payload, response } = readModelPayload(rawPayload);
    if (!payload) return response;

    if (modelDownloadId === payload.model) {
      return invalidPayloadResponse(
        `Há um download em andamento para "${payload.model}".`,
        'Cancele o download antes de excluir o modelo.',
      );
    }

    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
      const { deleteModel, getModelStatusFor, DEFAULT_MODEL } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);
      const engineDir = await engineModelsDir();

      // Modelo só existe numa instalação do whisper.cpp: não é nosso para excluir.
      const status = getModelStatusFor(payload.model, engineDir);
      const external = externalInstallMessage(payload.model, status.dir, modelsDir);
      if (status.installed && external) {
        return invalidPayloadResponse(external, 'Exclua-o manualmente por essa pasta, se desejar.');
      }

      // Nunca excluir um modelo sendo usado por um job ativo.
      if (await isModelInUseByActiveJob(payload.model)) {
        return invalidPayloadResponse(
          `O modelo "${payload.model}" está em uso por uma transcrição em andamento.`,
          'Aguarde terminar ou cancele a transcrição antes de excluir o modelo.',
        );
      }

      deleteModel(modelsDir, payload.model);

      // O modelo excluído era o padrão salvo? Volta ao padrão do aplicativo.
      const settings = getServices()?.settings;
      const previous = settings?.get('transcribeModel');
      const selectionReset = previous === payload.model;
      if (selectionReset) settings.set('transcribeModel', DEFAULT_MODEL);

      return {
        ok: true,
        model: payload.model,
        modelsDir,
        selectionReset,
        selectedModel: selectionReset ? DEFAULT_MODEL : previous,
        status: getModelStatusFor(payload.model, engineDir),
      };
    } catch (err) {
      const report = friendlyReport(err);
      return invalidPayloadResponse(
        report.message || 'Falha ao excluir o modelo.',
        report.suggestedAction || 'Feche o aplicativo e tente novamente.',
      );
    }
  });
}
