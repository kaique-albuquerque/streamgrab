/**
 * Script interativo de transcriÃ§Ã£o para testes via ntl.
 *
 * Uso: npm run transcribe
 * - Detecta vÃ­deos automaticamente em downloads/ e C:\Users\...\Downloads\
 * - Pede confirmaÃ§Ã£o antes de transcrever
 * - Mostra progresso e resultado
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOWNLOADS_DIR = path.join(PROJECT_ROOT, 'downloads');

// Pastas onde procurar vÃ­deos
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
        .slice(0, 5); // Ãšltimos 5 vÃ­deos
      videos.push(...files);
    } catch {}
  }
  return videos;
}

// Main
console.log('');
console.log('ðŸŽ¤ ========================================');
console.log('   TRANSCRIÃ‡ÃƒO DE VÃDEO â€” StreamGrab');
console.log('ðŸŽ¤ ========================================');
console.log('');

// 1. Verificar engine
const { checkTranscriptionAvailable } = await import('../src/transcribe/index.js');
const status = await checkTranscriptionAvailable();
if (!status.available) {
  console.error(`âŒ Engine nÃ£o disponÃ­vel: ${status.reason}`);
  process.exit(1);
}
console.log(`âœ… Engine: ${status.engine}`);
console.log('');

// 2. Encontrar vÃ­deos
console.log('ðŸ” Procurando vÃ­deos...');
const videos = findVideos();

if (videos.length === 0) {
  console.log('');
  console.log('âš ï¸  Nenhum vÃ­deo encontrado nas pastas:');
  for (const dir of SEARCH_DIRS) {
    console.log(`   - ${dir}`);
  }
  console.log('');
  console.log('   Copie um vÃ­deo .mp4 para uma dessas pastas e tente novamente.');
  process.exit(0);
}

// 3. Mostrar opÃ§Ãµes
console.log('');
console.log('ðŸ“¹ VÃ­deos encontrados:');
console.log('');
for (let i = 0; i < videos.length; i++) {
  const v = videos[i];
  console.log(`   [${i + 1}] ${v.name} (${v.sizeMB} MB)`);
}
console.log('');
console.log(`   [0] Digitar caminho manualmente`);
console.log('');

// 4. Selecionar vÃ­deo
const choice = await ask('Selecionar vÃ­deo (nÃºmero): ');
const index = parseInt(choice, 10) - 1;

let videoPath = '';
if (choice === '0') {
  const manual = await ask('Caminho do vÃ­deo: ');
  videoPath = manual.replace(/"/g, '');
  if (!fs.existsSync(videoPath)) {
    console.error(`âŒ Arquivo nÃ£o encontrado: ${videoPath}`);
    process.exit(1);
  }
} else if (index >= 0 && index < videos.length) {
  videoPath = videos[index].path;
} else {
  console.error('âŒ OpÃ§Ã£o invÃ¡lida');
  process.exit(1);
}

console.log('');
console.log(`ðŸ“¹ VÃ­deo: ${path.basename(videoPath)}`);
console.log(`ðŸ“Š Tamanho: ${(fs.statSync(videoPath).size / 1e6).toFixed(1)} MB`);
console.log('');

// 5. Perguntar idioma
const lang = await ask('Idioma (pt/en/es) [padrÃ£o: pt]: ') || 'pt';
console.log('');

// 6. Transcrever
console.log('ðŸŽ¤ Transcrevendo... (pode demorar alguns minutos)');
console.log('');

const { transcribeVideo } = await import('../src/transcribe/index.js');
const startedAt = Date.now();
let progressActive = false;

function renderProgress(percent) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  const width = 28;
  const filled = Math.round((safePercent / 100) * width);
  const bar = '#'.repeat(filled).padEnd(width, '-');
  progressActive = true;
  process.stdout.write(`\r   Transcrevendo [${bar}] ${String(safePercent).padStart(3, ' ')}%`);
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
    onProgress: ({ percent }) => {
      if (percent !== undefined) {
        renderProgress(percent);
      }
    },
    onLog: (msg) => {
      if (msg.includes('âœ…') || msg.includes('âš ï¸') || msg.includes('Etapa')) {
        clearProgressLine();
        console.log(`\n   ${msg}`);
      }
    },
  });

  clearProgressLine();
  console.log('');
  console.log('');
  console.log('âœ… TranscriÃ§Ã£o concluÃ­da!');
  console.log('');
  console.log(`   â±ï¸  Tempo: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`   ðŸ”§ Engine: ${result.engine}`);
  console.log('');
  console.log('   ðŸ“„ Arquivos gerados:');
  for (const file of result.files) {
    console.log(`      ${file.path}`);
  }
  console.log('');
  console.log('ðŸ’¡ Cole o conteÃºdo do .txt no NotebookLM para estudar!');
  console.log('');

} catch (err) {
  console.error('');
  console.error(`âŒ Erro: ${err.message}`);
  process.exit(1);
}
