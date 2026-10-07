/**
 * Wrapper do whisper.cpp para transcricao de audio.
 *
 * Detecta o binario do whisper.cpp (vendor/whisper ou WHISPER_CPP_PATH)
 * e executa a transcricao via subprocesso.
 *
 * Uso:
 *   const result = await transcribeWithCpp({ audioPath, language: 'pt', model: 'small' });
 *   console.log(result.text); // Texto transcrito
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { binName, packagedBinaryPath } from '../core/binaries.js';
import { DEFAULT_MODEL, getModelEntry, listModelIds, modelSearchDirs } from './model-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// whisper.cpp v1.9.4+ usa whisper-cli em vez de main
const BIN_NAME = binName('whisper-cli');
const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'whisper');
const VENDOR_BIN = path.join(VENDOR_DIR, BIN_NAME);
const VENDOR_MODELS = path.join(VENDOR_DIR, 'models');
const VENDOR_MARKER = path.join(VENDOR_DIR, '.installed');

/**
 * Verifica se o whisper.cpp esta disponivel.
 *
 * @returns {{ available: boolean, binPath: string, modelsDir: string }}
 */
export function checkWhisperCpp() {
  const envBin = process.env.WHISPER_CPP_PATH;
  if (envBin && fs.existsSync(envBin)) {
    const envModels = process.env.WHISPER_MODEL_DIR || path.join(path.dirname(envBin), 'models');
    return { available: true, binPath: envBin, modelsDir: envModels };
  }

  const packagedBin = packagedBinaryPath(BIN_NAME);
  if (packagedBin && fs.existsSync(packagedBin)) {
    const packagedModels = path.join(path.dirname(packagedBin), '..', 'whisper', 'models');
    const modelsDir = process.env.WHISPER_MODEL_DIR || path.normalize(packagedModels);
    return { available: true, binPath: packagedBin, modelsDir };
  }

  if (isVendorWhisperInstalled()) {
    const vendorModels = process.env.WHISPER_MODEL_DIR || VENDOR_MODELS;
    return { available: true, binPath: VENDOR_BIN, modelsDir: vendorModels };
  }

  for (const command of ['whisper-cli', 'whisper', 'main']) {
    const binPath = findCommand(command);
    if (binPath) {
      return { available: true, binPath, modelsDir: path.join(path.dirname(binPath), 'models') };
    }
  }

  return { available: false, binPath: '', modelsDir: '' };
}

/**
 * Instalação vendorizada (vendor/whisper) está pronta para uso?
 *
 * Depende apenas do BINÁRIO: o modelo é escolhido (e baixado) depois, pelo
 * usuário. Acoplar a disponibilidade do motor à presença de um modelo
 * específico fazia o app reportar "engine indisponível" mesmo com o
 * whisper.cpp instalado — e a transcrição ficava presa sem explicação.
 */
function isVendorWhisperInstalled() {
  if (!fs.existsSync(VENDOR_BIN) || !fs.existsSync(VENDOR_MARKER)) {
    return false;
  }

  const marker = readVendorMarker();
  if (!marker) {
    return false;
  }

  return marker.platform === process.platform && marker.arch === os.arch() && marker.bin === BIN_NAME;
}

function readVendorMarker() {
  try {
    const raw = fs.readFileSync(VENDOR_MARKER, 'utf8');
    const marker = JSON.parse(raw);
    if (!marker || typeof marker !== 'object') return null;
    return marker;
  } catch {
    return null;
  }
}

function findCommand(command) {
  const which = process.platform === 'win32' ? 'where' : 'which';
  const executable = binName(command);

  try {
    const result = spawnSync(which, [executable], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split(/\r?\n/)[0].trim();
    }
  } catch {
    // Ignorar
  }

  return '';
}

function detectWhisperFlags(binPath) {
  const help = getWhisperHelp(binPath);
  const outputFile = pickFlag(help, ['-of', '--output-file']);
  const outputTxt = pickFlag(help, ['--output-txt', '-otxt']);
  const outputSrt = pickFlag(help, ['--output-srt', '-osrt']);
  const printProgress = pickFlag(help, ['--print-progress', '-pp'], { required: false });

  if (!outputFile || !outputTxt || !outputSrt) {
    throw new Error(
      'whisper.cpp instalado nao expoe flags de saida compativeis.\n' +
      'Atualize o whisper.cpp com: npm run whisper:install'
    );
  }

  return {
    outputFile,
    outputTxt,
    outputSrt,
    printProgress,
  };
}

function getWhisperHelp(binPath) {
  try {
    const result = spawnSync(binPath, ['--help'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    return `${result.stdout || ''}\n${result.stderr || ''}`;
  } catch {
    return '';
  }
}

function pickFlag(help, flags, { required = true } = {}) {
  for (const flag of flags) {
    if (help.includes(flag)) {
      return flag;
    }
  }

  return required ? flags[0] : '';
}

/**
 * Obtem o caminho completo do modelo GGML.
 *
 * @param {string} model - Id do modelo no catálogo ('tiny', 'base', 'small', ...)
 * @param {string[]} dirs - Diretórios candidatos, em ordem de preferência
 * @returns {string} Caminho do modelo
 * @throws {Error} Se o modelo nao for conhecido ou nao estiver instalado
 */
function resolveModelPath(model, dirs) {
  const info = getModelEntry(model);
  if (!info) {
    throw new Error(`Modelo desconhecido: ${model}. Opcoes: ${listModelIds().join(', ')}`);
  }

  // WHISPER_MODEL_PATH é um override explícito do usuário (um arquivo único):
  // vale para qualquer modelo e tem prioridade sobre o catálogo.
  const envModel = process.env.WHISPER_MODEL_PATH;
  if (envModel) {
    if (isNonEmptyFile(envModel)) {
      return envModel;
    }

    throw new Error(
      `Modelo definido em WHISPER_MODEL_PATH nao encontrado ou vazio: ${envModel}\n` +
      'Remova a variavel ou aponte para um arquivo .bin valido.'
    );
  }

  const candidates = [...new Set(dirs.filter(Boolean))].map((dir) => path.join(dir, info.fileName));

  for (const candidate of candidates) {
    if (isModelFileReady(candidate, info)) {
      return candidate;
    }
  }

  const partial = candidates.find((candidate) => fs.existsSync(candidate));
  if (partial) {
    throw new Error(
      `Modelo ${model} encontrado, mas parece incompleto: ${partial}\n` +
      'Baixe novamente em Transcrever > Modelos Whisper.'
    );
  }

  throw new Error(
    `Modelo ${model} nao instalado (${info.fileName}).\n` +
    `Abra Transcrever > Modelos Whisper e baixe o modelo "${info.label}".`
  );
}

function isNonEmptyFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function isModelFileReady(modelPath, info) {
  if (!modelPath || !fs.existsSync(modelPath)) {
    return false;
  }

  const minSize = info?.minSize || 0;
  if (minSize <= 0) {
    return true;
  }

  try {
    const stat = fs.statSync(modelPath);
    return stat.isFile() && stat.size > minSize;
  } catch {
    return false;
  }
}

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

    const outputName = path.basename(audioPath, path.extname(audioPath));
    const txtFile = path.join(tmpDir, `${outputName}.txt`);
    const srtFile = path.join(tmpDir, `${outputName}.srt`);

    let actualTxt = fs.existsSync(txtFile) ? txtFile : '';
    let actualSrt = fs.existsSync(srtFile) ? srtFile : '';

    if (!actualTxt || !actualSrt) {
      const files = fs.readdirSync(tmpDir);
      const txtFound = files.find((f) => f.endsWith('.txt'));
      const srtFound = files.find((f) => f.endsWith('.srt'));
      if (txtFound) actualTxt = path.join(tmpDir, txtFound);
      if (srtFound) actualSrt = path.join(tmpDir, srtFound);
    }

    if (!actualTxt && !actualSrt) {
      throw new Error(
        `whisper.cpp nao gerou arquivos de saida (code ${result.code}):\n${result.stderr.slice(-500)}`
      );
    }

    const text = actualTxt ? fs.readFileSync(actualTxt, 'utf8').trim() : '';
    const segments = actualSrt ? parseSrt(fs.readFileSync(actualSrt, 'utf8')) : [];

    const durationMs = Date.now() - startedAt;
    onLog?.(`[whisper-cpp] Transcricao concluida em ${formatElapsed(durationMs)}`);

    return { text, segments, durationMs };
  } finally {
    clearTimeout(timeout);
    cleanupDir(tmpDir);
  }
}

function spawnWhisper(binPath, args, { signal, onProgress, onLog }) {
  let child;
  try {
    child = spawn(binPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    return {
      promise: Promise.resolve({ ok: false, code: -1, error: err, stderr: '', interrupted: false }),
      stop: () => {},
    };
  }

  let stderr = '';
  let stdout = '';
  let interrupted = false;
  let lastProgress = 0;

  child.stdout?.on('data', (d) => {
    const chunk = d.toString();
    stdout += chunk;
    lastProgress = handleWhisperOutput(chunk, lastProgress, onProgress);
  });

  child.stderr?.on('data', (d) => {
    const chunk = d.toString();
    stderr = (stderr + chunk).slice(-60000);

    lastProgress = handleTimeProgress(chunk, lastProgress, onProgress);
    lastProgress = handleWhisperOutput(chunk, lastProgress, onProgress);

    if (chunk.includes('whisper_init_from_file')) {
      onLog?.(`[whisper-cpp] ${chunk.trim()}`);
    }
  });

  const stop = () => {
    interrupted = true;
    try {
      if (child.stdin && child.stdin.writable) child.stdin.write('q');
    } catch {
      // Ignorar
    }
    const killer = setTimeout(() => {
      try {
        if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
      } catch {
        // Ignorar
      }
    }, 6000);
    killer.unref();
  };

  const onAbort = () => stop();
  let removeAbort = null;
  if (signal) {
    if (signal.aborted) {
      stop();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbort = () => signal.removeEventListener('abort', onAbort);
    }
  }

  const done = (result) => {
    removeAbort?.();
    return result;
  };

  const promise = new Promise((resolve) => {
    child.on('error', (err) => resolve(done({ ok: false, code: -1, error: err, stderr, interrupted })));
    child.on('close', (code) => {
      resolve(done({ ok: !interrupted && (code === 0 || code === 1), code, stderr, stdout, interrupted }));
    });
  });

  return { promise, stop, child };
}

function handleTimeProgress(chunk, lastProgress, onProgress) {
  const progressMatch = chunk.match(/progress:\s*(\d{2}:\d{2}:\d{2})\s*\/\s*(\d{2}:\d{2}:\d{2})/);
  if (!progressMatch) return lastProgress;

  const elapsed = parseTimeToSeconds(progressMatch[1]);
  const total = parseTimeToSeconds(progressMatch[2]);
  const percent = total > 0 ? Math.round((elapsed / total) * 100) : 0;

  if (percent <= lastProgress) return lastProgress;

  onProgress?.({
    elapsed,
    total,
    percent,
    elapsedStr: progressMatch[1],
    totalStr: progressMatch[2],
  });
  return percent;
}

function handleWhisperOutput(chunk, lastProgress, onProgress) {
  let nextProgress = lastProgress;
  const percentMatches = chunk.matchAll(/(?:progress\s*=\s*)?(\d{1,3})\s*%/gi);

  for (const match of percentMatches) {
    const percent = Math.max(0, Math.min(100, Number.parseInt(match[1], 10)));
    if (percent > nextProgress || (percent === 100 && nextProgress < 100)) {
      nextProgress = percent;
      onProgress?.({ percent });
    }
  }

  return nextProgress;
}

/**
 * Parseia um arquivo SRT em array de segmentos.
 *
 * @param {string} srtContent - Conteudo do arquivo SRT
 * @returns {Array<{ index: number, start: string, end: string, startMs: number, endMs: number, text: string }>}
 */
function parseSrt(srtContent) {
  const segments = [];
  const blocks = srtContent.split(/\n\s*\n/).filter(Boolean);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timeMatch) continue;

    const text = lines.slice(2).join(' ').trim();
    if (!text) continue;

    segments.push({
      index,
      start: timeMatch[1].replace(',', '.'),
      end: timeMatch[2].replace(',', '.'),
      startMs: parseTimeToMs(timeMatch[1]),
      endMs: parseTimeToMs(timeMatch[2]),
      text,
    });
  }

  return segments;
}

function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseInt(parts[0], 10) || 0;
}

function parseTimeToMs(timeStr) {
  const clean = timeStr.replace(',', '.');
  const [time, ms] = clean.split('.');
  const seconds = parseTimeToSeconds(time);
  return seconds * 1000 + (parseInt(ms, 10) || 0);
}

function cleanupDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // Ignorar erros de limpeza
  }
}

function formatElapsed(ms) {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000) return `${Math.round(ms / 1_000)}s`;
  return `${ms}ms`;
}

export default transcribeWithCpp;
