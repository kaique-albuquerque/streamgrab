/**
 * Script interativo de transcricao para testes via ntl.
 *
 * Uso: npm run transcribe
 * - Detecta videos automaticamente em downloads/ e C:\Users\...\Downloads\
 * - Pede confirmacao antes de transcrever
 * - Mostra progresso e resultado
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOWNLOADS_DIR = path.join(PROJECT_ROOT, 'downloads');

// Pastas onde procurar videos
const SEARCH_DIRS = [
  DOWNLOADS_DIR,
  'C:\\Users\\Kaique Dias\\Downloads',
];

const VIDEO_EXTS = /\.(mp4|webm|mkv|mov|m4v)$/i;

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function findVideos() {
  const videos = [];
  for (const dir of SEARCH_DIRS) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir)
        .filter(f => VIDEO_EXTS.test(f))
        .map(f => {
          const full = path.join(dir, f);
          const stat = fs.statSync(full);
          return { name: f, path: full, sizeMB: (stat.size / 1e6).toFixed(1), mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 5);
      videos.push(...files);
    } catch {}
  }
  return videos;
}

console.log('');
console.log('[TRANSCRICAO DE VIDEO - StreamGrab]');
console.log('========================================');
console.log('');

const { checkTranscriptionAvailable } = await import('../src/transcribe/index.js');
const status = await checkTranscriptionAvailable();
if (!status.available) {
  console.error(`ERRO: Engine nao disponivel: ${status.reason}`);
  process.exit(1);
}
console.log(`OK: Engine: ${status.engine}`);
console.log('');

console.log('Procurando videos...');
const videos = findVideos();

if (videos.length === 0) {
  console.log('');
  console.log('AVISO: Nenhum video encontrado nas pastas:');
  for (const dir of SEARCH_DIRS) {
    console.log(`   - ${dir}`);
  }
  console.log('');
  console.log('   Copie um video .mp4 para uma dessas pastas e tente novamente.');
  process.exit(0);
}

console.log('');
console.log('Videos encontrados:');
console.log('');
for (let i = 0; i < videos.length; i++) {
  const v = videos[i];
  console.log(`   [${i + 1}] ${v.name} (${v.sizeMB} MB)`);
}
console.log('');
console.log('   [0] Digitar caminho manualmente');
console.log('');

const choice = await ask('Selecionar video (numero): ');
const index = parseInt(choice, 10) - 1;

let videoPath = '';
if (choice === '0') {
  const manual = await ask('Caminho do video: ');
  videoPath = manual.replace(/"/g, '');
  if (!fs.existsSync(videoPath)) {
    console.error(`ERRO: Arquivo nao encontrado: ${videoPath}`);
    process.exit(1);
  }
} else if (index >= 0 && index < videos.length) {
  videoPath = videos[index].path;
} else {
  console.error('ERRO: Opcao invalida');
  process.exit(1);
}

console.log('');
console.log(`Video: ${path.basename(videoPath)}`);
console.log(`Tamanho: ${(fs.statSync(videoPath).size / 1e6).toFixed(1)} MB`);
console.log('');

const lang = await ask('Idioma (pt/en/es) [padrao: pt]: ') || 'pt';
console.log('');

console.log('Transcrevendo... (pode demorar alguns minutos)');
console.log('');

const { transcribeVideo } = await import('../src/transcribe/index.js');
const startedAt = Date.now();
let progressActive = false;

function renderProgress(percent, stage = 'transcribing') {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  const width = 28;
  const filled = Math.round((safePercent / 100) * width);
  const bar = '#'.repeat(filled).padEnd(width, '-');
  const label = stage === 'extracting' ? 'Extraindo audio' : 'Transcrevendo';
  progressActive = true;
  process.stdout.write(`\r   ${label} [${bar}] ${String(safePercent).padStart(3, ' ')}%`);
}

function clearProgressLine() {
  if (!progressActive) return;
  process.stdout.write('\r' + ' '.repeat(70) + '\r');
  progressActive = false;
}

try {
  const result = await transcribeVideo({
    videoPath,
    language: lang,
    formats: ['txt', 'srt'],
    onProgress: ({ stage, percent }) => {
      if (percent !== undefined) {
        renderProgress(percent, stage);
      }
    },
    onLog: (msg) => {
      if (msg.includes('OK') || msg.includes('AVISO') || msg.includes('Etapa')) {
        clearProgressLine();
        console.log(`\n   ${msg}`);
      }
    },
  });

  clearProgressLine();
  console.log('');
  console.log('');
  console.log('OK: Transcricao concluida!');
  console.log('');
  console.log(`   Tempo: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`   Engine: ${result.engine}`);
  console.log('');
  console.log('   Arquivos gerados:');
  for (const file of result.files) {
    console.log(`      ${file.path}`);
  }
  console.log('');
  console.log('Dica: Cole o conteudo do .txt no NotebookLM para estudar!');
  console.log('');
} catch (err) {
  clearProgressLine();
  console.error('');
  console.error(`ERRO: ${err.message}`);
  process.exit(1);
}
