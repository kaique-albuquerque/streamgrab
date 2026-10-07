/**
 * Gerenciamento dos modelos GGML do whisper.cpp para o app.
 *
 * Em produção o instalador traz apenas o binário whisper-cli
 * (scripts/package-resources.mjs). Os modelos (74 MB a 2,9 GB) são baixados
 * sob demanda para um diretório gravável (userData/whisper/models), pois o
 * diretório do instalador é read-only.
 *
 * Este módulo é a ÚNICA fonte de verdade do catálogo (nome do arquivo,
 * tamanho e SHA-256) — whisper-cpp.js importa daqui.
 *
 * Download com retomada (HTTP Range): um arquivo .part é mantido entre
 * tentativas e renomeado apenas após verificação de tamanho e SHA-256. Um
 * marcador <arquivo>.sha256 registra o hash já conferido, evitando reler
 * gigabytes a cada abertura do app.
 *
 * Uso:
 *   const status = getModelStatus(modelsDir, 'small');
 *   const todos = listModels(modelsDir);
 *   await downloadModel({ modelsDir, model: 'small', onProgress, signal });
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DEFAULT_MODEL = 'small';

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
const MARKER_EXT = '.sha256';

/**
 * Origem do diretório gravável de modelos do app (userData/whisper/models).
 *
 * O CLI não registra nada — nesse caso só o diretório do motor conta. O app
 * registra um resolvedor para que download, verificação e execução usem
 * SEMPRE o mesmo diretório; sem isso o modelo baixado na interface não seria
 * encontrado na hora de transcrever.
 */
let modelsDirResolver = null;

/** Registra a origem do diretório gravável de modelos (função, ou null para limpar). */
export function setModelsDirResolver(resolver) {
  modelsDirResolver = typeof resolver === 'function' ? resolver : null;
}

/** Diretório gravável de modelos do app ('' quando não registrado). */
export function getModelsDir() {
  try {
    return modelsDirResolver?.() || '';
  } catch {
    return '';
  }
}

/**
 * Diretórios onde um modelo pode estar, na ordem de busca.
 *
 * O primeiro é o gravável (é onde download e exclusão atuam). Os demais são
 * instalações do whisper.cpp já existentes, usadas apenas como fallback de
 * leitura — assim um modelo já presente não é baixado de novo.
 *
 * @param {string} [engineDir] - Diretório de modelos do motor (whisper.cpp)
 * @returns {string[]}
 */
export function modelSearchDirs(engineDir = '') {
  return [...new Set([process.env.WHISPER_MODEL_DIR, getModelsDir(), engineDir].filter(Boolean))];
}

/** Caminho do modelo completo em um dos diretórios extras ('' se nenhum). */
function findInstalledIn(dirs, primaryDir, info) {
  for (const dir of dirs) {
    if (!dir || dir === primaryDir) continue;
    const candidate = path.join(dir, info.fileName);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && stat.size >= info.minSize) return candidate;
    } catch {
      /* segue para o próximo diretório */
    }
  }
  return '';
}

/**
 * Catálogo de modelos multilíngues suportados.
 *
 * - expectedSize/sha256: valores oficiais de ggerganov/whisper.cpp.
 * - minSize: piso de integridade (~90% do tamanho esperado).
 * - heavy: modelos grandes o bastante para merecer aviso na UI.
 * - note: resumo para o usuário (velocidade x precisão).
 *
 * O objeto é mutável de propósito: os testes trocam os tamanhos por valores
 * minúsculos para não baixar centenas de MB em disco.
 */
export const MODEL_CATALOG = {
  tiny: {
    fileName: 'ggml-tiny.bin',
    label: 'tiny',
    expectedSize: 77_691_713,
    minSize: 77_691_713 * 0.9,
    sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
    url: `${BASE_URL}/ggml-tiny.bin`,
    note: '~74 MB. O mais rápido; precisão baixa — bom para rascunhos.',
    heavy: false,
  },
  base: {
    fileName: 'ggml-base.bin',
    label: 'base',
    expectedSize: 147_951_465,
    minSize: 147_951_465 * 0.9,
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    url: `${BASE_URL}/ggml-base.bin`,
    note: '~141 MB. Um pouco melhor que o tiny e ainda muito rápido.',
    heavy: false,
  },
  small: {
    fileName: 'ggml-small.bin',
    label: 'small',
    expectedSize: 487_601_967,
    minSize: 487_601_967 * 0.9,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
    url: `${BASE_URL}/ggml-small.bin`,
    note: '~465 MB. Equilíbrio entre qualidade e velocidade (recomendado).',
    heavy: false,
  },
  medium: {
    fileName: 'ggml-medium.bin',
    label: 'medium',
    expectedSize: 1_533_763_059,
    minSize: 1_533_763_059 * 0.9,
    sha256: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208',
    url: `${BASE_URL}/ggml-medium.bin`,
    note: '~1,4 GB. Bem mais preciso; usa ~5 GB de RAM e é bem mais lento.',
    heavy: true,
  },
  'large-v3': {
    fileName: 'ggml-large-v3.bin',
    label: 'large-v3',
    expectedSize: 3_095_033_483,
    minSize: 3_095_033_483 * 0.9,
    sha256: '64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2',
    url: `${BASE_URL}/ggml-large-v3.bin`,
    note: '~2,9 GB. Melhor precisão; exige ~10 GB de RAM e máquina forte.',
    heavy: true,
  },
};

const PROGRESS_MIN_INTERVAL_MS = 250;

/** Ids do catálogo, na ordem de exibição (menor → maior). */
export function listModelIds() {
  return Object.keys(MODEL_CATALOG);
}

/**
 * O modelo existe no catálogo?
 *
 * Usa `hasOwnProperty` de propósito: um id como 'constructor' ou '__proto__'
 * não deve herdar nada de Object.prototype.
 */
export function isKnownModel(model) {
  return typeof model === 'string' && Object.prototype.hasOwnProperty.call(MODEL_CATALOG, model);
}

/**
 * Entrada do catálogo para um id, ou null se desconhecido.
 *
 * Use esta função em vez de indexar MODEL_CATALOG direto, para nunca
 * resolver propriedades herdadas de Object.prototype.
 */
export function getModelEntry(model) {
  return isKnownModel(model) ? MODEL_CATALOG[model] : null;
}

function unknownModelError(model) {
  return new Error(`Modelo desconhecido: ${model}. Opções: ${listModelIds().join(', ')}`);
}

function markerPath(modelPath) {
  return `${modelPath}${MARKER_EXT}`;
}

/** Marcador de integridade gravado ao final de um download verificado. */
function readMarker(modelPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(markerPath(modelPath), 'utf8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

function writeMarker(modelPath, sha256) {
  try {
    const size = fs.statSync(modelPath).size;
    fs.writeFileSync(markerPath(modelPath), JSON.stringify({ sha256, size }), 'utf8');
  } catch {
    /* o marcador é opcional: falhar ao gravar não invalida o modelo */
  }
}

/**
 * Status do modelo em `modelsDir`.
 *
 * @param {string} modelsDir - Diretório gravável onde o app baixa o modelo
 * @param {string} [model='small'] - Chave do catálogo
 * @param {object} [options]
 * @param {string[]} [options.extraDirs] - Diretórios só-leitura a consultar
 *   quando o modelo não está em `modelsDir` (instalações do whisper.cpp).
 * @returns {{ installed: boolean, model: string, label: string, fileName: string,
 *             path: string, dir: string, externalDir: string, size: number,
 *             expectedSize: number, percent: number, partialSize: number,
 *             note: string, heavy: boolean, hashVerified: boolean }}
 */
export function getModelStatus(modelsDir, model = DEFAULT_MODEL, { extraDirs = [] } = {}) {
  const info = getModelEntry(model);
  if (!info) {
    return {
      installed: false,
      model,
      label: '',
      fileName: '',
      path: '',
      dir: '',
      externalDir: '',
      size: 0,
      expectedSize: 0,
      percent: 0,
      partialSize: 0,
      note: '',
      heavy: false,
      hashVerified: false,
      error: `Modelo desconhecido: ${model}. Opções: ${listModelIds().join(', ')}`,
    };
  }

  const modelPath = path.join(modelsDir, info.fileName);
  const partPath = `${modelPath}.part`;

  const sizeOf = (p) => {
    try {
      if (fs.existsSync(p)) return fs.statSync(p).size;
    } catch {
      /* ignora */
    }
    return 0;
  };

  const primarySize = sizeOf(modelPath);
  const partialSize = sizeOf(partPath);

  // Fallback só-leitura: modelo já trazido por uma instalação do whisper.cpp
  // conta como instalado (e é usado direto, sem baixar de novo).
  const externalPath = primarySize >= info.minSize ? '' : findInstalledIn(extraDirs, modelsDir, info);

  const size = externalPath ? sizeOf(externalPath) : primarySize;
  const installed = Boolean(externalPath) || primarySize >= info.minSize;
  const resolvedPath = externalPath || modelPath;
  const marker = readMarker(resolvedPath);
  // Instalações antigas (antes da verificação por hash) não têm marcador:
  // continuam válidas por tamanho, apenas sem a confirmação extra.
  const hashVerified = Boolean(marker && marker.sha256 === info.sha256 && marker.size === size);

  return {
    installed,
    model,
    label: info.label,
    fileName: info.fileName,
    path: resolvedPath,
    dir: externalPath ? path.dirname(externalPath) : modelsDir,
    externalDir: externalPath ? path.dirname(externalPath) : '',
    size,
    expectedSize: info.expectedSize,
    percent: installed ? 100 : Math.min(99, Math.round((partialSize / info.expectedSize) * 100)),
    partialSize,
    note: info.note,
    heavy: Boolean(info.heavy),
    hashVerified,
  };
}

/**
 * Status de todos os modelos do catálogo, na ordem de exibição.
 *
 * @param {string} modelsDir - Diretório gravável dos modelos
 * @param {object} [options]
 * @param {string[]} [options.extraDirs] - Diretórios só-leitura de fallback
 * @returns {Array<ReturnType<typeof getModelStatus>>}
 */
export function listModels(modelsDir, { extraDirs = [] } = {}) {
  return listModelIds().map((model) => getModelStatus(modelsDir, model, { extraDirs }));
}

/**
 * Status de um modelo na ordem de busca padrão: diretório gravável do app e,
 * se o modelo não estiver lá, as instalações já existentes do whisper.cpp.
 *
 * @param {string} model - Chave do catálogo
 * @param {string} [engineDir] - Diretório de modelos do motor (whisper.cpp)
 */
export function getModelStatusFor(model, engineDir = '') {
  const [primary, ...extraDirs] = modelSearchDirs(engineDir);
  return getModelStatus(primary || '', model, { extraDirs });
}

/** Igual a `getModelStatusFor`, para todos os modelos do catálogo. */
export function listModelsFor(engineDir = '') {
  const [primary, ...extraDirs] = modelSearchDirs(engineDir);
  return listModels(primary || '', { extraDirs });
}

/**
 * Remove os arquivos de um modelo (modelo, `.part` e marcador de hash).
 *
 * Só aceita ids do catálogo — o caminho é sempre derivado de `fileName`,
 * nunca do valor recebido.
 *
 * @param {string} modelsDir - Diretório dos modelos
 * @param {string} model - Chave do catálogo
 * @returns {{ model: string, removed: string[], status: ReturnType<typeof getModelStatus> }}
 */
export function deleteModel(modelsDir, model) {
  const info = getModelEntry(model);
  if (!info) throw unknownModelError(model);

  const modelPath = path.join(modelsDir, info.fileName);
  const removed = [];

  for (const target of [modelPath, `${modelPath}.part`, markerPath(modelPath)]) {
    try {
      if (!fs.existsSync(target)) continue;
      fs.rmSync(target, { force: true });
      removed.push(target);
    } catch (err) {
      throw new Error(`Não foi possível excluir ${path.basename(target)}: ${err.message}`);
    }
  }

  return { model, removed, status: getModelStatus(modelsDir, model) };
}

/**
 * Baixa um modelo do catálogo para `modelsDir` com retomada e progresso.
 *
 * - Se já instalado, retorna status imediatamente.
 * - Download parcial fica em `<modelo>.part` e é retomado via HTTP Range.
 * - Integridade verificada por tamanho mínimo e, quando o catálogo traz
 *   `sha256`, pelo hash SHA-256 do arquivo completo (calculado durante a
 *   própria gravação, sem reler o arquivo).
 *
 * @param {object} params
 * @param {string} params.modelsDir - Diretório de destino
 * @param {string} [params.model='small'] - Chave do catálogo
 * @param {Function} [params.onProgress] - Callback de progresso
 * @param {AbortSignal} [params.signal] - Sinal de cancelamento
 * @param {typeof fetch} [params.fetchImpl] - fetch injetável (testes)
 * @returns {Promise<ReturnType<typeof getModelStatus>>}
 */
export async function downloadModel({
  modelsDir,
  model = DEFAULT_MODEL,
  onProgress,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const info = getModelEntry(model);
  if (!info) throw unknownModelError(model);

  const status = getModelStatus(modelsDir, model);
  if (status.installed) return status;

  fs.mkdirSync(modelsDir, { recursive: true });

  const modelPath = status.path;
  const partPath = `${modelPath}.part`;

  // Retomada: se o .part já cobre o tamanho mínimo, só valida e renomeia.
  const resumed = await finishFromExistingPart(modelsDir, model, info, status);
  if (resumed) return resumed;

  let downloaded = status.partialSize;
  // Hash incremental: retoma a partir do prefixo já baixado em vez de reler
  // o arquivo inteiro no final (economiza gigabytes em modelos grandes).
  let hash = info.sha256 ? createHash('sha256') : null;
  if (hash && downloaded > 0) await hashExisting(partPath, hash, downloaded);

  const headers = downloaded > 0 ? { Range: `bytes=${downloaded}-` } : {};
  const response = await fetchImpl(info.url, { headers, redirect: 'follow', signal });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Download do modelo falhou: HTTP ${response.status} ${response.statusText}`);
  }

  // Servidor ignorou o Range (respondeu 200 em vez de 206) — recomeça do zero.
  if (downloaded > 0 && response.status === 200) {
    downloaded = 0;
    hash = info.sha256 ? createHash('sha256') : null;
  }

  if (!response.body) {
    throw new Error('Resposta do download sem corpo streaming.');
  }

  const contentLength = Number(response.headers.get('content-length')) || 0;
  const total = response.status === 206 ? downloaded + contentLength : contentLength || info.expectedSize;

  const fileStream = fs.createWriteStream(partPath, { flags: downloaded > 0 ? 'a' : 'w' });
  const nodeStream = toNodeStream(response.body);

  let lastPercent = -1;
  let lastEmitAt = 0;

  nodeStream.on('data', (chunk) => {
    downloaded += chunk.length;
    hash?.update(chunk);
    const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
    const now = Date.now();
    if (percent !== lastPercent && (now - lastEmitAt >= PROGRESS_MIN_INTERVAL_MS || percent === 100)) {
      lastPercent = percent;
      lastEmitAt = now;
      onProgress?.({ stage: 'downloading', percent, downloaded, total, model, file: info.fileName });
    }
  });

  await pipelineOrCancel(nodeStream, fileStream, signal);
  await verifyIntegrity(partPath, info, model, hash);

  const finalSize = fs.statSync(partPath).size;
  fs.renameSync(partPath, modelPath);
  writeMarker(modelPath, info.sha256);
  onProgress?.({ stage: 'done', percent: 100, downloaded: finalSize, total: finalSize, model, file: info.fileName });

  return getModelStatus(modelsDir, model);
}

/**
 * Promove um `.part` já completo para o arquivo final (retomada finalizada).
 *
 * @returns {Promise<ReturnType<typeof getModelStatus> | null>} Status final ou null
 */
async function finishFromExistingPart(modelsDir, model, info, status) {
  if (status.partialSize < info.minSize) return null;

  const partPath = `${status.path}.part`;
  await verifyIntegrity(partPath, info, model);
  fs.renameSync(partPath, status.path);
  writeMarker(status.path, info.sha256);
  return getModelStatus(modelsDir, model);
}

/** fetch real devolve web ReadableStream; aceita também Node Readable (testes). */
function toNodeStream(body) {
  return typeof body.pipe === 'function' ? body : Readable.fromWeb(body);
}

/**
 * Grava o corpo da resposta no `.part`, preservando o arquivo em caso de falha
 * para permitir retomada na próxima tentativa.
 */
async function pipelineOrCancel(nodeStream, fileStream, signal) {
  try {
    await pipeline(nodeStream, fileStream);
  } catch (err) {
    if (signal?.aborted) {
      const cancelled = new Error('Download do modelo cancelado.');
      cancelled.cancelled = true;
      throw cancelled;
    }
    throw err;
  }
}

/**
 * Confere tamanho e, quando disponível, o SHA-256 do arquivo.
 *
 * Um arquivo corrompido é descartado (retomar não ajudaria); um arquivo
 * apenas incompleto é mantido para retomada.
 *
 * @param {string} filePath - Arquivo a validar
 * @param {object} info - Entrada do catálogo
 * @param {string} model - Id do modelo (mensagens de erro)
 * @param {import('node:crypto').Hash | null} [hash] - Hash já calculado do arquivo
 */
async function verifyIntegrity(filePath, info, model, hash = null) {
  const size = fs.statSync(filePath).size;
  if (size < info.minSize) {
    throw new Error(
      `Modelo ${model} baixado parece incompleto (${formatSize(size)} de ~${formatSize(info.expectedSize)}). ` +
        'Execute o download novamente.'
    );
  }

  if (!info.sha256) return;

  const digest = hash ? hash.digest('hex') : await sha256OfFile(filePath);
  if (digest === info.sha256) return;

  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    /* melhor esforço: o erro abaixo já explica o problema */
  }

  throw new Error(
    `Modelo ${model} corrompido: o hash SHA-256 não confere. ` +
      'O arquivo inválido foi descartado — baixe novamente.'
  );
}

/** Alimenta `hash` com os primeiros `length` bytes do arquivo. */
async function hashExisting(filePath, hash, length) {
  const stream = fs.createReadStream(filePath, { end: length - 1 });
  for await (const chunk of stream) hash.update(chunk);
}

async function sha256OfFile(filePath) {
  const hash = createHash('sha256');
  await hashExisting(filePath, hash, Number.MAX_SAFE_INTEGER);
  return hash.digest('hex');
}

function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default downloadModel;
