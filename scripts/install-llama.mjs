/**
 * Instala o llama.cpp localmente em vendor/llama/ (llama-server + bibliotecas).
 *
 * Roda automaticamente no `npm install` (via `postinstall`) ou manualmente com
 * `npm run llama:install`.
 *
 * - Usa os assets pré-compilados oficiais do `ggml-org/llama.cpp` (tag fixada).
 * - `llama-server` é um stub fino: depende de `llama-cli-impl`, `llama-common`,
 *   `llama`, `ggml`, `ggml-base`, `libomp` e das `ggml-cpu-*.dll` por
 *   microarquitetura. Por isso **todas** as bibliotecas da distribuição são
 *   copiadas para `vendor/llama/`.
 * - Se o binário local já existir com o marker válido, pula.
 * - `LLAMA_SKIP_DOWNLOAD=1` pula a instalação (CI).
 * - Falha nunca derruba o `npm install`: loga aviso e sai 0.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'llama');
const INSTALLED_MARKER = path.join(VENDOR_DIR, '.installed');

/** Tag fixada do llama.cpp (assets pré-compilados). */
export const LLAMA_TAG = 'b12676';

const BASE_URL = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}`;

/** Extensão do executável por plataforma. */
function binNameFor(platform) {
  return platform === 'win32' ? 'llama-server.exe' : 'llama-server';
}

/**
 * Monta o plano de download do llama.cpp para uma plataforma/arquitetura.
 *
 * Puro e testável: não toca em disco nem em rede.
 *
 * @param {object} params
 * @param {string} params.platform - `process.platform`
 * @param {string} params.arch - `process.arch`
 * @param {string} [params.tag] - tag do release
 * @returns {{ url: string, archiveType: 'zip'|'tar.gz', binName: string, filesToCopy: string[] }}
 */
export function buildLlamaPlan({ platform, arch, tag = LLAMA_TAG }) {
  const binName = binNameFor(platform);
  const assets = {
    'win32-x64': { asset: `llama-${tag}-bin-win-cpu-x64.zip`, archiveType: 'zip' },
    'darwin-arm64': { asset: `llama-${tag}-bin-macos-arm64.tar.gz`, archiveType: 'tar.gz' },
    'darwin-x64': { asset: `llama-${tag}-bin-macos-x64.tar.gz`, archiveType: 'tar.gz' },
    'linux-x64': { asset: `llama-${tag}-bin-ubuntu-x64.tar.gz`, archiveType: 'tar.gz' },
  };

  const entry = assets[`${platform}-${arch}`];
  if (!entry) {
    throw new Error(
      `nao ha binario pre-compilado do llama.cpp para ${platform}/${arch}. ` +
        'Plataformas suportadas: win32-x64, darwin-arm64, darwin-x64, linux-x64.',
    );
  }

  return {
    url: `${BASE_URL}/${entry.asset}`,
    archiveType: entry.archiveType,
    binName,
    filesToCopy: [],
  };
}

/** Copia o executável e todas as bibliotecas da pasta de origem. */
function copyBinDirectory(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  const names = fs.readdirSync(fromDir);
  for (const name of names) {
    const source = path.join(fromDir, name);
    if (!fs.statSync(source).isFile()) continue;
    fs.copyFileSync(source, path.join(toDir, name));
  }
}

/** Localiza um arquivo pela base do nome dentro de uma árvore. */
function findFile(dir, baseName) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === baseName) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, baseName);
      if (found) return found;
    }
  }
  return '';
}

/** Extrai um zip (Windows) ou tar.gz (demais) para `destDir`. */
function extractArchive(archivePath, destDir, archiveType) {
  fs.mkdirSync(destDir, { recursive: true });
  if (archiveType === 'zip') {
    const r = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force`,
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 300000 },
    );
    if (r.status !== 0) throw new Error(`Falha ao extrair ZIP: ${r.stderr || r.stdout || 'erro desconhecido'}`);
    return;
  }
  const r = spawnSync('tar', ['-xzf', archivePath, '-C', destDir], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300000,
  });
  if (r.status !== 0) throw new Error(`Falha ao extrair tar.gz: ${r.stderr || r.stdout || 'erro desconhecido'}`);
}

/** Baixa o asset do plano para `destPath`. */
async function download(url, destPath) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download falhou: HTTP ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

/** Instalação local já pronta? */
function isLocalLlamaReady(binName) {
  if (!fs.existsSync(path.join(VENDOR_DIR, binName))) return false;
  try {
    const marker = JSON.parse(fs.readFileSync(INSTALLED_MARKER, 'utf8'));
    return marker?.platform === process.platform && marker?.arch === process.arch && marker?.bin === binName;
  } catch {
    return false;
  }
}

/** Formata duração em ms para exibição. */
function formatElapsed(ms) {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000) return `${Math.round(ms / 1_000)}s`;
  return `${ms}ms`;
}

async function main() {
  const startedAt = Date.now();
  console.log('\n[llama] Verificando instalação local do llama.cpp...');

  if (process.env.LLAMA_SKIP_DOWNLOAD === '1') {
    console.log('[llama] LLAMA_SKIP_DOWNLOAD=1 — pulando instalação.');
    return;
  }

  const plan = buildLlamaPlan({ platform: process.platform, arch: process.arch });

  if (isLocalLlamaReady(plan.binName)) {
    console.log(`[llama] Já instalado: ${path.join(VENDOR_DIR, plan.binName)}`);
    return;
  }

  const archivePath = path.join(os.tmpdir(), `llama-${Date.now()}.${plan.archiveType === 'zip' ? 'zip' : 'tar.gz'}`);
  const extractDir = path.join(os.tmpdir(), `llama-extract-${Date.now()}`);

  try {
    console.log('[llama] Etapa 1/3: baixando asset pré-compilado...');
    await download(plan.url, archivePath);

    console.log('[llama] Etapa 2/3: extraindo...');
    extractArchive(archivePath, extractDir, plan.archiveType);

    console.log('[llama] Etapa 3/3: copiando binário e bibliotecas...');
    const found = findFile(extractDir, plan.binName);
    if (!found) throw new Error(`binário ${plan.binName} não encontrado no arquivo baixado`);
    copyBinDirectory(path.dirname(found), VENDOR_DIR);

    fs.writeFileSync(
      INSTALLED_MARKER,
      JSON.stringify(
        { installedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, bin: plan.binName, tag: LLAMA_TAG },
        null,
        2,
      ),
    );

    console.log(`[llama] Instalado em: ${path.join(VENDOR_DIR, plan.binName)}`);
    console.log(`[llama] ✅ llama.cpp pronto em ${formatElapsed(Date.now() - startedAt)}`);
  } catch (err) {
    // Tolerante a falha: quem não usa tradução não pode ter o npm install quebrado.
    console.warn(`[llama] ⚠ Instalação do llama.cpp falhou (tradução de legendas ficará indisponível): ${err.message}`);
    console.warn('[llama] Tente novamente com: npm run llama:install');
  } finally {
    for (const dir of [extractDir]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* limpeza best-effort */
      }
    }
    try {
      fs.rmSync(archivePath, { force: true });
    } catch {
      /* limpeza best-effort */
    }
  }
}

// Executa apenas quando chamado diretamente (não quando importado em testes).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.warn(`[llama] ⚠ Erro inesperado na instalação: ${err.message}`);
  });
}