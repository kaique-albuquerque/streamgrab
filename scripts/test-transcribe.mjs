/**
 * Script de teste rápido para transcrição (SPEC-09).
 *
 * Uso:
 *   node scripts/test-transcribe.mjs                          # Testa com vídeo local (se existir)
 *   node scripts/test-transcribe.mjs URL_DO_VIDEO             # Baixa e transcreve
 *   node scripts/test-transcribe.mjs URL_DO_VIDEO --lang en   # Transcreve em inglês
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Importar módulos do StreamGrab
const { checkTranscriptionAvailable, transcribeVideo } = await import('../src/transcribe/index.js');

const args = process.argv.slice(2);
const url = args[0] || '';
const langIdx = args.indexOf('--lang');
const language = langIdx !== -1 ? (args[langIdx + 1] || 'pt') : 'pt';

console.log('');
console.log('🧪 ========================================');
console.log('   TESTE DE TRANSCRIÇÃO — StreamGrab');
console.log('🧪 ========================================');
console.log('');

// 1. Verificar disponibilidade
console.log('📋 Passo 1/4: Verificando engine de transcrição...');
const status = await checkTranscriptionAvailable();
if (!status.available) {
  console.error(`❌ Engine não disponível: ${status.reason}`);
  process.exit(1);
}
console.log(`✅ Engine disponível: ${status.engine}`);
console.log('');

// 2. Determinar vídeo de teste
let videoPath = '';

if (url && url.startsWith('http')) {
  console.log(`📥 Passo 2/4: Baixando vídeo de: ${url.slice(0, 80)}...`);
  console.log('   (usando FFmpeg para download HLS)...');

  const { execSync } = await import('node:child_process');
  const downloadsDir = path.join(PROJECT_ROOT, 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });

  // Gerar nome de arquivo baseado no timestamp
  const timestamp = Date.now();
  const outputFile = path.join(downloadsDir, `test_video_${timestamp}.mp4`);

  try {
    // Usar FFmpeg para baixar HLS diretamente
    const ffmpegCmd = `ffmpeg -i "${url}" -c copy -y "${outputFile}"`;
    console.log(`   Executando: ffmpeg -i "..." -c copy -y "${path.basename(outputFile)}"`);

    execSync(ffmpegCmd, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: PROJECT_ROOT,
      timeout: 300_000, // 5 min timeout
    });

    if (fs.existsSync(outputFile)) {
      videoPath = outputFile;
      const size = (fs.statSync(outputFile).size / 1e6).toFixed(1);
      console.log(`✅ Vídeo baixado: ${path.basename(outputFile)} (${size} MB)`);
    }
  } catch (err) {
    console.error(`❌ Falha no download: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log('📥 Passo 2/4: Procurando vídeo local na pasta downloads/...');
  const downloadsDir = path.join(PROJECT_ROOT, 'downloads');

  if (fs.existsSync(downloadsDir)) {
    const files = fs.readdirSync(downloadsDir)
      .filter(f => /\.(mp4|webm|mkv|mov)$/i.test(f))
      .map(f => ({ name: f, time: fs.statSync(path.join(downloadsDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 0) {
      videoPath = path.join(downloadsDir, files[0].name);
      console.log(`✅ Vídeo encontrado: ${files[0].name}`);
    }
  }

  if (!videoPath) {
    console.log('');
    console.log('⚠️  Nenhum vídeo encontrado na pasta downloads/');
    console.log('');
    console.log('   Opções:');
    console.log('   1. Coloque um vídeo .mp4 na pasta downloads/');
    console.log('   2. Execute com uma URL:');
    console.log('      node scripts/test-transcribe.mjs https://youtube.com/watch?v=...');
    console.log('');
    process.exit(0);
  }
}

console.log('');

// 3. Transcrever
console.log(`🎤 Passo 3/4: Transcrevendo vídeo (idioma: ${language})...`);
console.log(`   Arquivo: ${path.basename(videoPath)}`);
console.log(`   Tamanho: ${(fs.statSync(videoPath).size / 1e6).toFixed(1)} MB`);
console.log('');

const startedAt = Date.now();

try {
  const result = await transcribeVideo({
    videoPath,
    language,
    formats: ['txt', 'md'],
    onProgress: ({ stage, percent, elapsedStr, totalStr }) => {
      if (percent !== undefined) {
        process.stdout.write(`\r   ⏳ ${stage}: ${percent}%${elapsedStr ? ` (${elapsedStr}/${totalStr})` : ''}   `);
      }
    },
    onLog: (msg) => {
      // Só mostrar logs importantes
      if (msg.includes('✅') || msg.includes('⚠️') || msg.includes('Etapa')) {
        console.log(`   ${msg}`);
      }
    },
  });

  console.log('');
  console.log('');

  // 4. Mostrar resultado
  console.log('📄 Passo 4/4: Resultado da transcrição');
  console.log('');
  console.log(`   ⏱️  Tempo total: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`   🔧 Engine: ${result.engine}`);
  console.log(`   📁 Arquivos gerados: ${result.files.length}`);
  console.log('');

  for (const file of result.files) {
    const size = (file.size / 1024).toFixed(1);
    console.log(`   📄 ${path.basename(file.path)} (${size} KB)`);
  }

  // Mostrar preview do texto
  if (result.text) {
    const preview = result.text.slice(0, 500);
    console.log('');
    console.log('   📝 Preview do texto transcrito:');
    console.log('   ────────────────────────────────');
    const lines = preview.split('\n').slice(0, 8);
    for (const line of lines) {
      console.log(`   ${line}`);
    }
    if (result.text.length > 500) {
      console.log('   ...');
    }
    console.log('   ────────────────────────────────');
  }

  console.log('');
  console.log('✅ Teste concluído com sucesso!');
  console.log('');
  console.log('💡 Dica: Cole o conteúdo do .txt no NotebookLM para estudar!');
  console.log('');

} catch (err) {
  console.error('');
  console.error(`❌ Falha na transcrição: ${err.message}`);
  process.exit(1);
}
