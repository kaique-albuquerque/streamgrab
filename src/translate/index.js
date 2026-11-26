/**
 * API pública da tradução local de legendas.
 *
 * Pipeline: parse SRT → blocos → `llama-server` local com JSON schema →
 * segundo passe de encurtamento → SRT reconstruído com timestamps originais.
 *
 * Uso:
 *   const result = await translateSubtitle({ srtPath: '/v/video.srt' });
 *   console.log(result.outputPath); // /v/video.pt.srt
 */

import fs from 'node:fs';
import { checkLlamaCpp, startServer } from './llama-cpp.js';
import { chatJson } from './llama-cpp/chat.js';
import { parseSrt } from './srt/parse.js';
import { translateSrt } from './pipeline.js';
import { writeTranslatedSrt } from './write.js';
import { waitForTranslateModel } from './wait-model.js';
import {
  DEFAULT_TRANSLATE_MODEL,
  getTranslateModelStatus,
  isKnownTranslateModel,
} from './model-manager.js';

export { createTranslateJobManager, defaultTranslateRunner } from './job-manager.js';
export { checkLlamaCpp, startServer, SERVER_START_TIMEOUT_MS } from './llama-cpp.js';
export { parseSrt, buildSrt } from './srt.js';
export { translateSrt } from './pipeline.js';
export {
  DEFAULT_TRANSLATE_MODEL,
  TRANSLATE_MODEL_CATALOG,
  getTranslateModelEntry,
  getTranslateModelStatus,
  getTranslateModelsDir,
  isKnownTranslateModel,
  listTranslateModels,
  downloadTranslateModel,
  setTranslateModelsDirResolver,
} from './model-manager.js';

/** Alvo de leitura padrão (caracteres por segundo). */
export const DEFAULT_CHARS_PER_SECOND = 17;

/**
 * Traduz um `.srt` para português, 100% local.
 *
 * @param {object} options
 * @param {string} options.srtPath - Arquivo `.srt` de entrada
 * @param {string} [options.targetLang='pt'] - Idioma de destino
 * @param {string} [options.model='qwen3-4b'] - Modelo GGUF
 * @param {number} [options.charsPerSecond=17] - Alvo de leitura
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.onProgress]
 * @param {Function} [options.onLog]
 * @param {object} [options.deps] - Injeção de dependências (testes)
 * @returns {Promise<{ outputPath: string, segments: number, overTarget: number[], durationMs: number }>}
 */
export async function translateSubtitle({
  srtPath,
  targetLang = 'pt',
  model = DEFAULT_TRANSLATE_MODEL,
  charsPerSecond = DEFAULT_CHARS_PER_SECOND,
  signal,
  onProgress,
  onLog,
  deps = {},
} = {}) {
  const startedAt = Date.now();

  if (typeof srtPath !== 'string' || !srtPath.toLowerCase().endsWith('.srt')) {
    throw new Error('Arquivo de legenda inválido: esperado um .srt.');
  }
  if (!fs.existsSync(srtPath)) {
    throw new Error(`Arquivo não encontrado: ${srtPath}`);
  }
  if (!isKnownTranslateModel(model)) {
    throw new Error(`Modelo de tradução desconhecido: ${model}.`);
  }

  const start = deps.startServer || startServer;
  const chat = deps.chat || chatJson;
  const check = deps.checkLlamaCpp || checkLlamaCpp;
  const statusOf = deps.getTranslateModelStatus || getTranslateModelStatus;
  const wait = deps.waitForModel || waitForTranslateModel;

  // Espera o download terminar em vez de falhar: o job pode ser enfileirado
  // enquanto o modelo (2,4 GB) ainda baixa.
  const modelReady = await wait({
    model,
    isInstalled: () => statusOf(model).installed,
    signal,
    onWaiting: ({ waitedMs }) => {
      onProgress?.({ stage: 'waiting-model', percent: 0, waitedMs });
    },
  });
  if (!modelReady.installed) {
    throw new Error(modelReady.message);
  }

  const modelStatus = statusOf(model);
  if (!modelStatus.installed) {
    throw new Error(
      `O modelo "${modelStatus.label || model}" ainda não foi baixado. ` +
        'Abra a aba Transcrever e baixe o modelo antes de traduzir.',
    );
  }

  const { available, binPath } = check();
  if (!available) {
    throw new Error(
      'llama.cpp nao encontrado. Execute: npm run llama:install',
    );
  }

  const doc = parseSrt(fs.readFileSync(srtPath, 'utf8'));
  onLog?.(`[translate] ${doc.cues.length} segmentos, modelo ${model}`);

  const server = await start({ binPath, modelPath: modelStatus.path, signal, onLog });
  try {
    const chatBound = ({ system, user, schema }) =>
      chat({ baseUrl: server.baseUrl, apiKey: server.apiKey, system, user, schema, signal });

    const { cues, overTarget } = await translateSrt({
      cues: doc.cues,
      doc,
      chat: chatBound,
      charsPerSecond,
      onProgress,
      onLog,
    });

    const finalDoc = { ...doc, cues };
    const { outputPath } = writeTranslatedSrt({ srtPath, doc: finalDoc, targetLang });

    return {
      outputPath,
      segments: cues.length,
      overTarget,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await server.stop();
  }
}