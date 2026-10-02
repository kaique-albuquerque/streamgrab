/**
 * Wrapper do whisper.cpp para transcrição de áudio.
 *
 * Detecta o binário do whisper.cpp (vendor/whisper ou WHISPER_CPP_PATH)
 * e executa a transcrição via subprocesso.
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
import { binName } from '../core/binaries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// whisper.cpp v1.9.4+ usa whisper-cli em vez de main
const BIN_NAME = binName('whisper-cli');
const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'whisper');
const VENDOR_BIN = path.join(VENDOR_DIR, BIN_NAME);
const VENDOR_MODELS = path.join(VENDOR_DIR, 'models');

// Apenas modelo small — único suportado
const MODEL_MAP = {
  small: 'ggml-small.bin',
};

/**
 * Verifica se o whisper.cpp está disponível.
 *
 * @returns {{ available: boolean, binPath: string, modelsDir: string }}
 */
export function checkWhisperCpp() {
  // 1. Variável de ambiente
  const envBin = process.env.WHISPER_CPP_PATH;
  if (envBin && fs.existsSync(envBin)) {
    const envModels = process.env.WHISPER_MODEL_DIR || path.join(path.dirname(envBin), 'models');
    return { available: true, binPath: envBin, modelsDir: envModels };
  }

  // 2. Binário local (vendor/whisper/)
  if (fs.existsSync(VENDOR_BIN)) {
    return { available: true, binPath: VENDOR_BIN, modelsDir: VENDOR_MODELS };
  }

  // 3. PATH do sistema
  const which = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = spawnSync(which, ['whisper'], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0 && result.stdout.trim()) {
      const binPath = result.stdout.trim().split('\n')[0].trim();
      return { available: true, binPath, modelsDir: path.join(path.dirname(binPath), 'models') };
    }
  } catch {
    // Ignorar
  }

  return { available: false, binPath: '', modelsDir: '' };
}

/**
 * Obtém o caminho completo do modelo GGML.
 *
 * @param {string} model — Nome do modelo ('tiny', 'base', 'small', 'medium')
 * @param {string} modelsDir — Diretório dos modelos
 * @returns {string} Caminho do modelo
 * @throws {Error} Se o modelo não for encontrado
 */
function resolveModelPath(model, modelsDir) {
  const fileName = MODEL_MAP[model];
  if (!fileName) {
    throw new Error(`Modelo desconhecido: ${model}. Opções: ${Object.keys(MODEL_MAP).join(', ')}`);
  }

  // 1. Variável de ambiente WHISPER_MODEL_PATH
  const envModel = process.env.WHISPER_MODEL_PATH;
  if (envModel && fs.existsSync(envModel)) {
    return envModel;
  }

  // 2. Diretório de modelos
  const vendorPath = path.join(modelsDir, fileName);
  if (fs.existsSync(vendorPath)) {
    return vendorPath;
  }

  throw new Error(
    `Modelo ${model} não encontrado em: ${vendorPath}\n` +
    `Execute: npm run whisper:install`
  );
}

/**
 * Transcreve áudio usando whisper.cpp.
 *
 * @param {object} params
 * @param {string} params.audioPath — Caminho do arquivo de áudio (WAV 16kHz mono)
 * @param {string} [params.language='pt'] — Código do idioma (pt, en, es, etc.)
 * @param {string} [params.model='small'] — Modelo (tiny, base, small, medium)
 * @param {number} [params.threads=4] — Número de threads CPU
 * @param {AbortSignal} [params.signal] — Sinal de cancelamento
 * @param {Function} [params.onProgress] — Callback de progresso
 * @param {Function} [params.onLog] — Callback de log
 * @returns {Promise<{ text: string, segments: Array, durationMs: number }>}
 */
export async function transcribeWithCpp({
  audioPath,
  language = 'pt',
  model = 'small',
  threads = 4,
  signal,
  onProgress,
  onLog,
}) {
  const startedAt = Date.now();

  // Verificar disponibilidade
  const { available, binPath, modelsDir } = checkWhisperCpp();
  if (!available) {
    throw new Error(
      'whisper.cpp não encontrado.\n' +
      'Execute: npm run whisper:install\n' +
      'Ou instale manualmente e defina WHISPER_CPP_PATH'
    );
  }

  // Resolver modelo
  const modelPath = resolveModelPath(model, modelsDir);
  onLog?.(`[whisper-cpp] Modelo: ${model} (${path.basename(modelPath)})`);
  onLog?.(`[whisper-cpp] Binário: ${binPath}`);

  // Criar diretório temporário para saída
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-out-'));

  // Montar argumentos. Algumas builds do whisper-cli não suportam --output-dir;
  // -of/--output-file define o caminho base e é compatível com essa instalação.
  const outputBase = path.join(tmpDir, path.basename(audioPath, path.extname(audioPath)));
  const args = [
    '-m', modelPath,
    '-f', audioPath,
    '-l', language,
    '-t', String(threads),
    '-of', outputBase,
    '--output-txt',
    '--output-srt',
    '--print-progress',
  ];

  onLog?.(`[whisper-cpp] Iniciando transcrição...`);
  onLog?.(`[whisper-cpp] Args: whisper ${args.join(' ')}`);

  // Executar whisper.cpp
  const { promise, stop } = spawnWhisper(binPath, args, {
    signal,
    onProgress,
    onLog,
  });

  // Timeout de segurança: 4x a duração estimada (ou máximo 4 horas)
  const timeout = setTimeout(() => {
    onLog?.('[whisper-cpp] Timeout de segurança atingido, cancelando...');
    stop();
  }, 4 * 60 * 60 * 1000);

  try {
    const result = await promise;

    // whisper-cli pode retornar exit code 1 mesmo com sucesso
    // Verificar se os arquivos de saída foram criados
    const txtFile = path.join(tmpDir, `${path.basename(audioPath, path.extname(audioPath))}.txt`);
    const srtFile = path.join(tmpDir, `${path.basename(audioPath, path.extname(audioPath))}.srt`);

    // Também procurar por qualquer .txt/.srt no diretório
    let actualTxt = fs.existsSync(txtFile) ? txtFile : '';
    let actualSrt = fs.existsSync(srtFile) ? srtFile : '';

    if (!actualTxt || !actualSrt) {
      const files = fs.readdirSync(tmpDir);
      const txtFound = files.find(f => f.endsWith('.txt'));
      const srtFound = files.find(f => f.endsWith('.srt'));
      if (txtFound) actualTxt = path.join(tmpDir, txtFound);
      if (srtFound) actualSrt = path.join(tmpDir, srtFound);
    }

    if (!actualTxt && !actualSrt) {
      throw new Error(
        `whisper.cpp não gerou arquivos de saída (code ${result.code}):\n${result.stderr.slice(-500)}`
      );
    }

    // Ler saída
    let text = actualTxt ? fs.readFileSync(actualTxt, 'utf8').trim() : '';
    let segments = actualSrt ? parseSrt(fs.readFileSync(actualSrt, 'utf8')) : [];

    const durationMs = Date.now() - startedAt;
    onLog?.(`[whisper-cpp] Transcrição concluída em ${formatElapsed(durationMs)}`);

    return { text, segments, durationMs };
  } finally {
    clearTimeout(timeout);
    // Limpar diretório temporário de saída
    cleanupDir(tmpDir);
  }
}

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

function spawnWhisper(binPath, args, { signal, onProgress, onLog }) {
  let child;
  try {
    child = spawn(binPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
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
    lastProgress = handleWhisperOutput(chunk, {
      lastProgress,
      onProgress,
      onLog,
      captureImportantLogs: false,
    });
  });

  child.stderr?.on('data', (d) => {
    const chunk = d.toString();
    stderr = (stderr + chunk).slice(-60000);

    // Parsear progresso do whisper.cpp
    // Formato típico: "progress: 00:15:22 / 00:48:15"
    const progressMatch = chunk.match(/progress:\s*(\d{2}:\d{2}:\d{2})\s*\/\s*(\d{2}:\d{2}:\d{2})/);
    if (progressMatch) {
      const elapsed = parseTimeToSeconds(progressMatch[1]);
      const total = parseTimeToSeconds(progressMatch[2]);
      const percent = total > 0 ? Math.round((elapsed / total) * 100) : 0;

      if (percent > lastProgress) {
        lastProgress = percent;
        onProgress?.({
          elapsed,
          total,
          percent,
          elapsedStr: progressMatch[1],
          totalStr: progressMatch[2],
        });
      }
    }

    // Log de informações importantes
    lastProgress = handleWhisperOutput(chunk, {
      lastProgress,
      onProgress,
      onLog,
      captureImportantLogs: false,
    });

    if (chunk.includes('whisper_init_from_file')) {
      onLog?.(`[whisper-cpp] ${chunk.trim()}`);
    }
  });

  const stop = () => {
    interrupted = true;
    try {
      if (child.stdin && child.stdin.writable) child.stdin.write('q');
    } catch {
      /* ignora */
    }
    const killer = setTimeout(() => {
      try {
        if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
      } catch {
        /* ignora */
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
    // whisper-cli retorna exit code 1 mesmo com sucesso
    // Não tratar code 1 como falha — a verificação é feita pelos arquivos de saída
    child.on('close', (code) => resolve(done({ ok: !interrupted && (code === 0 || code === 1), code, stderr, stdout, interrupted })));
  });

  return { promise, stop, child };
}

function handleWhisperOutput(chunk, { lastProgress, onProgress, onLog, captureImportantLogs }) {
  let nextProgress = lastProgress;

  // Formato do --print-progress em builds recentes:
  // "whisper_print_progress_callback: progress =  42%"
  const percentMatches = chunk.matchAll(/(?:progress\s*=\s*)?(\d{1,3})\s*%/gi);
  for (const match of percentMatches) {
    const percent = Math.max(0, Math.min(100, Number.parseInt(match[1], 10)));
    if (percent > nextProgress || (percent === 100 && nextProgress < 100)) {
      nextProgress = percent;
      onProgress?.({ percent });
    }
  }

  if (captureImportantLogs && chunk.includes('whisper_init_from_file')) {
    onLog?.(`[whisper-cpp] ${chunk.trim()}`);
  }

  return nextProgress;
}

/**
 * Parseia um arquivo SRT em array de segmentos.
 *
 * @param {string} srtContent — Conteúdo do arquivo SRT
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
