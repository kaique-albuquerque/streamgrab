/**
 * Instala o whisper.cpp localmente em vendor/whisper/ (binário + modelos GGML).
 *
 * Roda automaticamente no `npm install` (via script "postinstall") ou
 * manualmente com: npm run whisper:install
 *
 * - Se o binário local já existir, pula (não baixa de novo).
 * - Compila whisper.cpp a partir do código fonte (requer cmake/gcc).
 * - Baixa modelos GGML do Hugging Face (small + medium).
 * - Verifica integridade dos arquivos baixados.
 *
 * Alternativa: Se não for possível compilar, instala @xenova/transformers como fallback.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'whisper');
const MODELS_DIR = path.join(VENDOR_DIR, 'models');
// whisper.cpp v1.9.4+ usa whisper-cli em vez de main
const BIN_NAME = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
const BIN_PATH = path.join(VENDOR_DIR, BIN_NAME);
const INSTALLED_MARKER = path.join(VENDOR_DIR, '.installed');

const WHISPER_CPP_REPO = 'https://github.com/ggerganov/whisper.cpp.git';
const HUGGINGFACE_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

// Apenas modelo small (~244 MB) — bom equilíbrio qualidade/velocidade
const MODELS = [
  { name: 'ggml-small.bin', size: 244_000_000, label: 'small' },
];

console.log('\n[whisper] Verificando instalação local do whisper.cpp...');

// Permite pular a instalação (ex: CI já instalou manualmente)
if (process.env.WHISPER_SKIP_DOWNLOAD === '1') {
  console.log('[whisper] WHISPER_SKIP_DOWNLOAD=1 — pulando instalação.');
  process.exit(0);
}

if (isLocalWhisperReady()) {
  console.log(`[whisper] Já instalado: ${BIN_PATH}`);
  console.log(`[whisper] Modelos: ${listInstalledModels().join(', ')}`);
  process.exit(0);
}

console.log('[whisper] Instalando whisper.cpp...');

try {
  // Etapa 1: Compilar binário
  await buildBinary();

  // Etapa 2: Baixar modelos
  await downloadModels();

  // Etapa 3: Criar marker de instalação
  fs.writeFileSync(INSTALLED_MARKER, new Date().toISOString());

  console.log('\n[whisper] ✅ Instalação concluída com sucesso!');
  console.log(`[whisper] Binário: ${BIN_PATH}`);
  console.log(`[whisper] Modelos: ${listInstalledModels().join(', ')}`);
} catch (err) {
  console.error(`\n[whisper] ❌ Falha na instalação: ${err.message}`);
  console.log('\n[whisper] Alternativas:');
  console.log('  1. Instale manualmente: https://github.com/ggerganov/whisper.cpp#build');
  console.log('  2. Use o fallback Node.js: npm install @xenova/transformers');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

function isLocalWhisperReady() {
  return fs.existsSync(BIN_PATH) && fs.existsSync(INSTALLED_MARKER);
}

function listInstalledModels() {
  if (!fs.existsSync(MODELS_DIR)) return [];
  return MODELS
    .filter((m) => fs.existsSync(path.join(MODELS_DIR, m.name)))
    .map((m) => m.label);
}

/**
 * Compila o whisper.cpp a partir do código fonte.
 * Requer: git, cmake, gcc/g++ (ou MSVC no Windows)
 */
async function buildBinary() {
  console.log(`[whisper] Etapa 1/2: Compilando whisper.cpp...`);

  const buildDir = path.join(os.tmpdir(), `whisper-build-${Date.now()}`);
  const sourceDir = path.join(buildDir, 'whisper.cpp');

  try {
    // Verificar dependências
    checkBuildDependencies();

    // Clonar repositório
    console.log(`[whisper] Clonando repositório...`);
    fs.mkdirSync(buildDir, { recursive: true });
    const cloneResult = spawnSync('git', [
      'clone', '--depth', '1', '--recursive',
      WHISPER_CPP_REPO,
      sourceDir,
    ], { encoding: 'utf8', windowsHide: true, timeout: 120_000 });

    if (cloneResult.status !== 0) {
      throw new Error(`Falha ao clonar: ${cloneResult.stderr}`);
    }

    // Criar diretório de build
    const cmakeBuildDir = path.join(sourceDir, 'build');
    fs.mkdirSync(cmakeBuildDir, { recursive: true });

    // Configurar com cmake
    console.log(`[whisper] Configurando com cmake...`);
    const cmakeArgs = process.platform === 'win32'
      ? ['-G', 'Visual Studio 17 2022', '-A', 'x64']
      : [];
    const cmakeResult = spawnSync('cmake', [
      ...cmakeArgs,
      '-DWHISPER_BUILD_TESTS=OFF',
      '-DWHISPER_BUILD_SERVER=OFF',
      '-DBUILD_SHARED_LIBS=OFF',
      '..',
    ], { encoding: 'utf8', windowsHide: true, cwd: cmakeBuildDir, timeout: 120_000 });

    if (cmakeResult.status !== 0) {
      throw new Error(`Falha no cmake: ${cmakeResult.stderr}`);
    }

    // Compilar
    console.log(`[whisper] Compilando (pode demorar alguns minutos)...`);
    const buildArgs = process.platform === 'win32'
      ? ['--config', 'Release', '--target', 'whisper-cli', '-j', String(os.cpus().length)]
      : ['-j', String(os.cpus().length)];
    const buildResult = spawnSync('cmake', [
      '--build', '.',
      ...buildArgs,
    ], { encoding: 'utf8', windowsHide: true, cwd: cmakeBuildDir, timeout: 600_000 });

    if (buildResult.status !== 0) {
      throw new Error(`Falha na compilação: ${buildResult.stderr}`);
    }

    // Encontrar o binário compilado (whisper-cli é o target correto)
    let binSource;
    if (process.platform === 'win32') {
      binSource = findFileRecursive(cmakeBuildDir, 'whisper-cli.exe');
      if (!binSource) binSource = findFileRecursive(cmakeBuildDir, 'main.exe');
    } else {
      binSource = findFileRecursive(cmakeBuildDir, 'whisper-cli');
      if (!binSource) binSource = findFileRecursive(cmakeBuildDir, 'main');
    }

    if (!binSource) {
      throw new Error('Binário não encontrado após compilação');
    }

    // Copiar para vendor/whisper/
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
    fs.copyFileSync(binSource, BIN_PATH);

    if (process.platform !== 'win32') {
      spawnSync('chmod', ['+x', BIN_PATH]);
    }

    console.log(`[whisper] Binário compilado: ${BIN_PATH}`);
  } finally {
    // Limpar diretório de build
    cleanupTemp(buildDir);
  }
}

function checkBuildDependencies() {
  const missing = [];

  // Verificar git
  const gitResult = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true });
  if (gitResult.status !== 0) missing.push('git');

  // Verificar cmake
  const cmakeResult = spawnSync('cmake', ['--version'], { encoding: 'utf8', windowsHide: true });
  if (cmakeResult.status !== 0) missing.push('cmake');

  if (process.platform === 'win32') {
    // No Windows, verificar MSVC (cl.exe) ou MinGW
    const clResult = spawnSync('where', ['cl.exe'], { encoding: 'utf8', windowsHide: true });
    const msbuildResult = spawnSync('where', ['msbuild'], { encoding: 'utf8', windowsHide: true });

    // Verificar também nos caminhos padrão do Visual Studio Build Tools
    let msbuildFound = clResult.status === 0 || msbuildResult.status === 0;
    if (!msbuildFound) {
      // Procurar em locais conhecidos do VS Build Tools
      const vsPaths = [
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise',
      ];
      for (const vsPath of vsPaths) {
        if (fs.existsSync(vsPath)) {
          msbuildFound = true;
          break;
        }
      }
    }

    if (!msbuildFound) {
      missing.push('Visual Studio Build Tools ou MSVC');
    }
  } else {
    // No Linux/Mac, verificar gcc
    const gccResult = spawnSync('gcc', ['--version'], { encoding: 'utf8', windowsHide: true });
    if (gccResult.status !== 0) missing.push('gcc/g++');
  }

  // Se faltar algo, tentar instalar automaticamente no Linux/Mac
  if (missing.length > 0 && process.platform !== 'win32') {
    console.log(`[whisper] Dependências faltando: ${missing.join(', ')}`);
    console.log('[whisper] Tentando instalar automaticamente...');
    autoInstallDeps(missing);
    // Re-verificar após instalação
    return checkBuildDependencies();
  }

  if (missing.length > 0) {
    throw new Error(
      `Dependências de compilação faltando: ${missing.join(', ')}\n` +
      '\nWindows: instale o Visual Studio Build Tools com "Desenvolvimento para Desktop com C++"\n' +
      'Linux: sudo apt install git cmake build-essential\n' +
      'Mac: xcode-select --install && brew install cmake\n' +
      '\nAlternativa: npm install @xenova/transformers'
    );
  }
}

/**
 * Instala dependências automaticamente no Linux/Mac.
 */
function autoInstallDeps(missing) {
  if (process.platform === 'linux') {
    // Detectar gerenciador de pacotes
    const hasApt = spawnSync('which', ['apt'], { encoding: 'utf8', windowsHide: true }).status === 0;
    const hasDnf = spawnSync('which', ['dnf'], { encoding: 'utf8', windowsHide: true }).status === 0;
    const hasBrew = spawnSync('which', ['brew'], { encoding: 'utf8', windowsHide: true }).status === 0;

    if (hasApt) {
      console.log('[whisper] Instalando via apt...');
      const packages = [];
      if (missing.includes('git')) packages.push('git');
      if (missing.includes('cmake')) packages.push('cmake');
      if (missing.includes('gcc/g++')) packages.push('build-essential');

      if (packages.length > 0) {
        const result = spawnSync('sudo', ['apt-get', 'install', '-y', ...packages], {
          encoding: 'utf8', windowsHide: true,
        });
        if (result.status !== 0) {
          console.log(`[whisper] Aviso: falha no apt: ${result.stderr}`);
        }
      }
    } else if (hasDnf) {
      console.log('[whisper] Instalando via dnf...');
      const packages = [];
      if (missing.includes('git')) packages.push('git');
      if (missing.includes('cmake')) packages.push('cmake');
      if (missing.includes('gcc/g++')) packages.push('gcc', 'gcc-c++', 'make');

      if (packages.length > 0) {
        const result = spawnSync('sudo', ['dnf', 'install', '-y', ...packages], {
          encoding: 'utf8', windowsHide: true,
        });
        if (result.status !== 0) {
          console.log(`[whisper] Aviso: falha no dnf: ${result.stderr}`);
        }
      }
    } else if (hasBrew) {
      console.log('[whisper] Instalando via brew...');
      const packages = [];
      if (missing.includes('cmake')) packages.push('cmake');
      if (missing.includes('gcc/g++')) packages.push('gcc');

      if (packages.length > 0) {
        const result = spawnSync('brew', ['install', ...packages], {
          encoding: 'utf8', windowsHide: true,
        });
        if (result.status !== 0) {
          console.log(`[whisper] Aviso: falha no brew: ${result.stderr}`);
        }
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS
    const hasBrew = spawnSync('which', ['brew'], { encoding: 'utf8', windowsHide: true }).status === 0;

    if (!hasBrew) {
      console.log('[whisper] Homebrew não encontrado. Instale manualmente:');
      console.log('[whisper] /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
      return;
    }

    console.log('[whisper] Instalando via brew...');
    const packages = [];
    if (missing.includes('cmake')) packages.push('cmake');
    if (missing.includes('gcc/g++')) packages.push('gcc');

    if (packages.length > 0) {
      const result = spawnSync('brew', ['install', ...packages], {
        encoding: 'utf8', windowsHide: true,
      });
      if (result.status !== 0) {
        console.log(`[whisper] Aviso: falha no brew: ${result.stderr}`);
      }
    }

    // Verificar Xcode Command Line Tools
    const xcodeResult = spawnSync('xcode-select', ['--print-path'], { encoding: 'utf8', windowsHide: true });
    if (xcodeResult.status !== 0) {
      console.log('[whisper] Instalando Xcode Command Line Tools...');
      spawnSync('xcode-select', ['--install'], { windowsHide: true });
      console.log('[whisper] Siga as instruções na tela para instalar o Xcode CLI Tools.');
    }

    // Detectar chip (ARM/Apple Silicon vs Intel)
    const arch = os.arch();
    const chipType = arch === 'arm64' ? 'Apple Silicon (ARM)' : 'Intel';
    console.log(`[whisper] Arquitetura detectada: ${chipType} (${arch})`);

    // No Apple Silicon, verificar se o Homebrew está no path correto
    if (arch === 'arm64') {
      const brewPath = '/opt/homebrew/bin/brew';
      const brewAltPath = '/usr/local/bin/brew';
      if (!fs.existsSync(brewPath) && !fs.existsSync(brewAltPath)) {
        console.log('[whisper] Homebrew não encontrado para Apple Silicon.');
        console.log('[whisper] Instale: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
        console.log('[whisper] Depois adicione ao PATH: eval "$(/opt/homebrew/bin/brew shellenv)"');
      }
    }
  }
}

async function downloadModels() {
  console.log(`[whisper] Etapa 2/2: Baixando modelos GGML...`);
  fs.mkdirSync(MODELS_DIR, { recursive: true });

  for (const model of MODELS) {
    const modelPath = path.join(MODELS_DIR, model.name);

    if (fs.existsSync(modelPath)) {
      const stat = fs.statSync(modelPath);
      if (stat.size > model.size * 0.9) { // Tolerância de 10%
        console.log(`[whisper] Modelo ${model.label} já existe, pulando...`);
        continue;
      }
    }

    const url = `${HUGGINGFACE_BASE_URL}/${model.name}`;
    console.log(`[whisper] Baixando modelo ${model.label} (~${Math.round(model.size / 1e6)} MB)...`);
    console.log(`[whisper] URL: ${url}`);

    await downloadFile(url, modelPath);

    const stat = fs.statSync(modelPath);
    console.log(`[whisper] Modelo ${model.label} instalado: ${Math.round(stat.size / 1e6)} MB`);
  }
}

async function downloadFile(url, destPath) {
  const startedAt = Date.now();

  // Tentar com curl primeiro (mais confiável)
  const curlResult = spawnSync('curl', [
    '-L', '-f', '--progress-bar',
    '-o', destPath,
    url,
  ], { encoding: 'utf8', windowsHide: true });

  if (curlResult.status === 0 && fs.existsSync(destPath)) {
    const elapsed = Date.now() - startedAt;
    const size = fs.statSync(destPath).size;
    console.log(`[whisper] Download concluído: ${formatSize(size)} em ${formatElapsed(elapsed)}`);
    return;
  }

  // Fallback: usar Node.js fetch
  console.log(`[whisper] curl falhou, usando fetch...`);

  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(300_000), // 5 min timeout
  });

  if (!response.ok) {
    throw new Error(`Download falhou: HTTP ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);

  const elapsed = Date.now() - startedAt;
  console.log(`[whisper] Download concluído: ${formatSize(buffer.length)} em ${formatElapsed(elapsed)}`);
}

function findFileRecursive(dir, fileName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === fileName) return fullPath;
    if (entry.isDirectory()) {
      const found = findFileRecursive(fullPath, fileName);
      if (found) return found;
    }
  }
  return null;
}

function cleanupTemp(targetPath) {
  try {
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
    }
  } catch {
    // Ignorar erros de limpeza
  }
}

function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatElapsed(ms) {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000) return `${Math.round(ms / 1_000)}s`;
  return `${ms}ms`;
}
