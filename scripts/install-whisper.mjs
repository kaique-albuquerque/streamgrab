/**
 * Instala o whisper.cpp localmente em vendor/whisper/ (binrio + modelos GGML).
 *
 * Roda automaticamente no `npm install` (via script "postinstall") ou
 * manualmente com: npm run whisper:install
 *
 * - Se o binrio local j existir, pula (no baixa de novo).
 * - Compila whisper.cpp a partir do cdigo fonte (requer cmake/gcc).
 * - Baixa modelos GGML do Hugging Face (small + medium).
 * - Verifica integridade dos arquivos baixados.
 *
 * Alternativa: Se no for possvel compilar, instala @xenova/transformers como fallback.
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

// Apenas modelo small (~244 MB)  bom equilbrio qualidade/velocidade
const MODELS = [
  { name: 'ggml-small.bin', size: 244_000_000, label: 'small' },
];

// Cross-compile: ex. WHISPER_CMAKE_ARCH=x86_64 para builds macOS x64 em
// runners arm64 (macos-14). Vazio = arquitetura nativa da máquina.
const TARGET_ARCH = process.env.WHISPER_CMAKE_ARCH || '';

console.log('\n[whisper] Verificando instalao local do whisper.cpp...');

// Permite pular a instalao (ex: CI j instalou manualmente)
if (process.env.WHISPER_SKIP_DOWNLOAD === '1') {
  console.log('[whisper] WHISPER_SKIP_DOWNLOAD=1  pulando instalao.');
  process.exit(0);
}

if (isLocalWhisperReady()) {
  console.log(`[whisper] Ja instalado: ${BIN_PATH}`);
  console.log(`[whisper] Modelos: ${listInstalledModels().join(', ')}`);
  process.exit(0);
}

console.log('[whisper] Instalando whisper.cpp...');

try {
  // Etapa 1: Compilar binrio
  await buildBinary();

  // Etapa 2: Baixar modelos (pulado com WHISPER_BINARY_ONLY=1 — ex.: CI que
  // empacota s o binrio; o modelo  baixado em runtime pelo app
  // (src/transcribe/model-manager.js) para o userData do usurio).
  if (process.env.WHISPER_BINARY_ONLY === '1') {
    console.log('[whisper] WHISPER_BINARY_ONLY=1 — pulando download de modelos.');
  } else {
    await downloadModels();
  }

  // Etapa 3: Criar marker de instalacao
  writeInstalledMarker();

  console.log('\n[whisper]  Instalao concluda com sucesso!');
  console.log(`[whisper] Binrio: ${BIN_PATH}`);
  console.log(`[whisper] Modelos: ${listInstalledModels().join(', ')}`);
} catch (err) {
  console.error(`\n[whisper]  Falha na instalao: ${err.message}`);
  console.log('\n[whisper] Alternativas:');
  console.log('  1. Instale manualmente: https://github.com/ggerganov/whisper.cpp#build');
  console.log('  2. Use o fallback Node.js: npm install @xenova/transformers');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Funes auxiliares
// ---------------------------------------------------------------------------

function isLocalWhisperReady() {
  if (!fs.existsSync(BIN_PATH) || !fs.existsSync(INSTALLED_MARKER)) {
    return false;
  }

  const marker = readInstalledMarker();
  if (!marker) {
    return false;
  }

  return (
    marker.platform === process.platform &&
    marker.arch === os.arch() &&
    marker.bin === BIN_NAME &&
    MODELS.every((model) => isModelReady(model))
  );
}

function listInstalledModels() {
  if (!fs.existsSync(MODELS_DIR)) return [];
  return MODELS
    .filter((m) => isModelReady(m))
    .map((m) => m.label);
}

function readInstalledMarker() {
  try {
    const raw = fs.readFileSync(INSTALLED_MARKER, 'utf8');
    const marker = JSON.parse(raw);
    if (!marker || typeof marker !== 'object') return null;
    return marker;
  } catch {
    return null;
  }
}

function writeInstalledMarker() {
  const marker = {
    installedAt: new Date().toISOString(),
    platform: process.platform,
    arch: TARGET_ARCH || os.arch(),
    bin: BIN_NAME,
    models: listInstalledModels(),
  };
  fs.writeFileSync(INSTALLED_MARKER, `${JSON.stringify(marker, null, 2)}\n`);
}

function isModelReady(model) {
  const modelPath = path.join(MODELS_DIR, model.name);
  if (!fs.existsSync(modelPath)) return false;
  const stat = fs.statSync(modelPath);
  return stat.size > model.size * 0.9;
}

/**
 * Compila o whisper.cpp a partir do cdigo fonte.
 * Requer: git, cmake, gcc/g++ (ou MSVC no Windows)
 */
async function buildBinary() {
  console.log(`[whisper] Etapa 1/2: Compilando whisper.cpp...`);

  const buildDir = path.join(os.tmpdir(), `whisper-build-${Date.now()}`);
  const sourceDir = path.join(buildDir, 'whisper.cpp');

  try {
    // Verificar dependncias
    checkBuildDependencies();

    // Clonar repositrio
    console.log(`[whisper] Clonando repositrio...`);
    fs.mkdirSync(buildDir, { recursive: true });
    const cloneResult = spawnSync('git', [
      'clone', '--depth', '1', '--recursive',
      WHISPER_CPP_REPO,
      sourceDir,
    ], { encoding: 'utf8', windowsHide: true, timeout: 120_000 });

    if (cloneResult.status !== 0) {
      throw new Error(`Falha ao clonar: ${cloneResult.stderr}`);
    }

    // Criar diretrio de build
    const cmakeBuildDir = path.join(sourceDir, 'build');
    fs.mkdirSync(cmakeBuildDir, { recursive: true });

    // Configurar com cmake
    console.log(`[whisper] Configurando com cmake...`);
    const cmakeArgs = getCmakeConfigureArgs();
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
      throw new Error(`Falha na compilao: ${buildResult.stderr}`);
    }

    // Encontrar o binrio compilado (whisper-cli  o target correto)
    let binSource;
    if (process.platform === 'win32') {
      binSource = findFileRecursive(cmakeBuildDir, 'whisper-cli.exe');
      if (!binSource) binSource = findFileRecursive(cmakeBuildDir, 'main.exe');
    } else {
      binSource = findFileRecursive(cmakeBuildDir, 'whisper-cli');
      if (!binSource) binSource = findFileRecursive(cmakeBuildDir, 'main');
    }

    if (!binSource) {
      throw new Error('Binrio no encontrado aps compilao');
    }

    // Copiar para vendor/whisper/
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
    fs.copyFileSync(binSource, BIN_PATH);

    if (process.platform !== 'win32') {
      spawnSync('chmod', ['+x', BIN_PATH]);
    }

    console.log(`[whisper] Binrio compilado: ${BIN_PATH}`);
  } finally {
    // Limpar diretrio de build
    cleanupTemp(buildDir);
  }
}

function checkBuildDependencies() {
  const missing = [];

  if (!hasCommand('git', ['--version'])) missing.push('git');
  if (!hasCommand('cmake', ['--version'])) missing.push('cmake');

  if (process.platform === 'win32') {
    // No Windows, verificar MSVC (cl.exe) ou MinGW
    let msbuildFound = hasCommand('cl.exe') || hasCommand('msbuild');
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
  } else if (process.platform === 'darwin') {
    const hasXcodeCli = hasCommand('xcode-select', ['--print-path']);
    const hasClang = hasCommand('clang', ['--version']);
    const hasCxx = hasAnyCommand(['clang++', 'c++'], ['--version']);

    if (!hasXcodeCli && (!hasClang || !hasCxx)) {
      missing.push('Xcode Command Line Tools ou clang/clang++');
    }
  } else {
    const hasCc = hasAnyCommand(['gcc', 'cc'], ['--version']);
    const hasCxx = hasAnyCommand(['g++', 'c++'], ['--version']);
    if (!hasCc || !hasCxx) missing.push('gcc/g++ ou cc/c++');
  }

  if (missing.length > 0) {
    throw new Error(
      `Dependncias de compilao faltando: ${missing.join(', ')}\n` +
      '\nWindows: instale o Visual Studio Build Tools com "Desenvolvimento para Desktop com C++"\n' +
      'Linux: sudo apt install git cmake build-essential\n' +
      'Mac: xcode-select --install && brew install cmake\n' +
      '\nAlternativa: npm install @xenova/transformers'
    );
  }
}

function hasAnyCommand(commands, args = []) {
  return commands.some((command) => hasCommand(command, args));
}

function hasCommand(command, args = []) {
  if (args.length > 0) {
    const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
    return result.status === 0;
  }

  const which = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(which, [command], { encoding: 'utf8', windowsHide: true });
  return result.status === 0;
}

function getCmakeConfigureArgs() {
  // macOS cross-compile (ex.: x86_64 em runner arm64) — clang suporta
  // nativamente via CMAKE_OSX_ARCHITECTURES.
  if (process.platform === 'darwin' && TARGET_ARCH) {
    return [`-DCMAKE_OSX_ARCHITECTURES=${TARGET_ARCH}`];
  }

  if (process.platform !== 'win32') {
    return [];
  }

  if (hasCommand('ninja', ['--version'])) {
    return ['-G', 'Ninja'];
  }

  const arch = getWindowsCmakeArch();
  const generators = getCmakeGenerators();

  if (generators.includes('Visual Studio 17 2022')) {
    return ['-G', 'Visual Studio 17 2022', '-A', arch];
  }

  if (generators.includes('Visual Studio 16 2019')) {
    return ['-G', 'Visual Studio 16 2019', '-A', arch];
  }

  return [];
}

function getWindowsCmakeArch() {
  if (process.arch === 'arm64') return 'ARM64';
  return 'x64';
}

function getCmakeGenerators() {
  try {
    const result = spawnSync('cmake', ['--help'], { encoding: 'utf8', windowsHide: true });
    return `${result.stdout || ''}\n${result.stderr || ''}`;
  } catch {
    return '';
  }
}

/**
 * Instala dependncias automaticamente no Linux/Mac.
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
      console.log('[whisper] Homebrew no encontrado. Instale manualmente:');
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
      console.log('[whisper] Siga as instrues na tela para instalar o Xcode CLI Tools.');
    }

    // Detectar chip (ARM/Apple Silicon vs Intel)
    const arch = os.arch();
    const chipType = arch === 'arm64' ? 'Apple Silicon (ARM)' : 'Intel';
    console.log(`[whisper] Arquitetura detectada: ${chipType} (${arch})`);

    // No Apple Silicon, verificar se o Homebrew est no path correto
    if (arch === 'arm64') {
      const brewPath = '/opt/homebrew/bin/brew';
      const brewAltPath = '/usr/local/bin/brew';
      if (!fs.existsSync(brewPath) && !fs.existsSync(brewAltPath)) {
        console.log('[whisper] Homebrew no encontrado para Apple Silicon.');
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
      if (stat.size > model.size * 0.9) { // Tolerncia de 10%
        console.log(`[whisper] Modelo ${model.label} j existe, pulando...`);
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

  // Tentar com curl primeiro (mais confivel)
  const curlResult = spawnSync('curl', [
    '-L', '-f', '--progress-bar',
    '-o', destPath,
    url,
  ], { encoding: 'utf8', windowsHide: true });

  if (curlResult.status === 0 && fs.existsSync(destPath)) {
    const elapsed = Date.now() - startedAt;
    const size = fs.statSync(destPath).size;
    console.log(`[whisper] Download concludo: ${formatSize(size)} em ${formatElapsed(elapsed)}`);
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
  console.log(`[whisper] Download concludo: ${formatSize(buffer.length)} em ${formatElapsed(elapsed)}`);
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

