/**
 * Orquestração da transcrição via whisper.cpp.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_MODEL, modelSearchDirs } from '../model-manager.js';
import { checkWhisperCpp } from './detect.js';
import { detectWhisperFlags } from './cli-flags.js';
import { resolveModelPath } from './model-path.js';
import { resolveOutputFiles, readTranscription } from './output-files.js';
import { cleanupDir, formatElapsed } from './fs-utils.js';
import { spawnWhisper } from './spawn.js';

/**
 * Transcreve audio usando whisper.cpp.
 *
 * @param {object} params
 * @param {string} params.audioPath - Caminho do arquivo de audio (WAV 16kHz mono)
 * @param {string} [params.language='pt'] - Codigo do idioma (pt, en, es, etc.)
 * @param {string} [params.model='small'] - Id do modelo no catalogo (model-manager.js)
 * @param {number} [params.threads=4] - Numero de threads CPU
 * @param {AbortSignal} [params.signal] - Sinal de cancelamento
 * @param {Function} [params.onProgress] - Callback de progresso
 * @param {Function} [params.onLog] - Callback de log
 * @returns {Promise<{ text: string, segments: Array, durationMs: number }>}
 */
export async function transcribeWithCpp({
  audioPath,
  language = 'pt',
  model = DEFAULT_MODEL,
  threads = 4,
  signal,
  onProgress,
  onLog,
}) {
  const startedAt = Date.now();

  const { available, binPath, modelsDir } = checkWhisperCpp();
  if (!available) {
    throw new Error(
      'whisper.cpp nao encontrado.\n' +
      'Execute: npm run whisper:install\n' +
      'Ou instale manualmente e defina WHISPER_CPP_PATH'
    );
  }

  const modelPath = resolveModelPath(model, modelSearchDirs(modelsDir));
  onLog?.(`[whisper-cpp] Modelo: ${model} (${path.basename(modelPath)})`);
  onLog?.(`[whisper-cpp] Binario: ${binPath}`);

  const cliFlags = detectWhisperFlags(binPath);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-out-'));

  const outputBase = path.join(tmpDir, path.basename(audioPath, path.extname(audioPath)));
  const args = [
    '-m', modelPath,
    '-f', audioPath,
    '-l', language,
    '-t', String(threads),
    cliFlags.outputFile, outputBase,
    cliFlags.outputTxt,
    cliFlags.outputSrt,
  ];

  if (cliFlags.printProgress) {
    args.push(cliFlags.printProgress);
  }

  onLog?.(`[whisper-cpp] Iniciando transcricao...`);
  onLog?.(`[whisper-cpp] Args: whisper ${args.join(' ')}`);

  const { promise, stop } = spawnWhisper(binPath, args, {
    signal,
    onProgress,
    onLog,
  });

  const timeout = setTimeout(() => {
    onLog?.('[whisper-cpp] Timeout de seguranca atingido, cancelando...');
    stop();
  }, 4 * 60 * 60 * 1000);

  try {
    const result = await promise;
    const { actualTxt, actualSrt } = resolveOutputFiles(tmpDir, audioPath);

    if (!actualTxt && !actualSrt) {
      throw new Error(
        `whisper.cpp nao gerou arquivos de saida (code ${result.code}):\n${result.stderr.slice(-500)}`
      );
    }

    const { text, segments } = readTranscription({ actualTxt, actualSrt });

    const durationMs = Date.now() - startedAt;
    onLog?.(`[whisper-cpp] Transcricao concluida em ${formatElapsed(durationMs)}`);

    return { text, segments, durationMs };
  } finally {
    clearTimeout(timeout);
    cleanupDir(tmpDir);
  }
}
