import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  PREVIEW_DURATION_SECONDS,
  getPreviewDir,
  canPreview,
  buildPreviewArgs,
  extractFfmpegError,
  clearPreview,
  cleanOldPreviews,
  generatePreview,
} from '../../src/preview.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-preview-test-'));
}

// ---------------------------------------------------------------------------
// canPreview / getPreviewDir
// ---------------------------------------------------------------------------

test('canPreview aceita fontes suportadas', () => {
  for (const type of ['hls', 'dash', 'direct', 'youtube', 'social', 'ytdlp']) {
    assert.equal(canPreview(type), true, `${type} deveria ser previewável`);
  }
});

test('canPreview rejeita fontes desconhecidas e vazias', () => {
  assert.equal(canPreview('drm'), false);
  assert.equal(canPreview(''), false);
  assert.equal(canPreview(null), false);
  assert.equal(canPreview(undefined), false);
});

test('canPreview é case-insensitive', () => {
  assert.equal(canPreview('HLS'), true);
  assert.equal(canPreview('YouTube'), true);
});

test('getPreviewDir fica dentro do tempDir informado', () => {
  const dir = getPreviewDir('/tmp/base');
  assert.equal(dir.startsWith('/tmp/base'), true);
  assert.ok(dir.includes('streamgrab-preview'));
});

// ---------------------------------------------------------------------------
// buildPreviewArgs
// ---------------------------------------------------------------------------

test('buildPreviewArgs limita a duração e usa copy (sem reencode)', () => {
  const args = buildPreviewArgs({ inputUrl: 'https://x.com/a.m3u8', outputPath: '/tmp/p.mp4' });
  const tIndex = args.indexOf('-t');
  assert.equal(args[tIndex + 1], String(PREVIEW_DURATION_SECONDS));
  assert.equal(args.includes('-c'), true);
  assert.equal(args[args.indexOf('-c') + 1], 'copy');
  assert.equal(args[args.length - 1], '/tmp/p.mp4');
});

test('buildPreviewArgs posiciona o input antes das opções de saída', () => {
  const args = buildPreviewArgs({ inputUrl: 'https://x.com/a.m3u8', outputPath: '/tmp/p.mp4' });
  assert.ok(args.indexOf('-i') < args.indexOf('-t'));
});

test('buildPreviewArgs respeita duração customizada', () => {
  const args = buildPreviewArgs({ inputUrl: 'u', outputPath: 'o', durationSeconds: 15 });
  assert.equal(args[args.indexOf('-t') + 1], '15');
});

// ---------------------------------------------------------------------------
// extractFfmpegError
// ---------------------------------------------------------------------------

test('extractFfmpegError traduz 403 para ação sugerida', () => {
  const msg = extractFfmpegError('Server returned 403 Forbidden');
  assert.ok(/expirou|recusada/i.test(msg));
});

test('extractFfmpegError traduz 404', () => {
  const msg = extractFfmpegError('HTTP error 404 Not Found');
  assert.ok(/404|encontrado/i.test(msg));
});

test('extractFfmpegError devolve a última linha útil como fallback', () => {
  const msg = extractFfmpegError('linha irrelevante\nerro final relevante');
  assert.equal(msg, 'erro final relevante');
});

test('extractFfmpegError com stderr vazio devolve string vazia', () => {
  assert.equal(extractFfmpegError(''), '');
  assert.equal(extractFfmpegError(null), '');
});

// ---------------------------------------------------------------------------
// clearPreview / cleanOldPreviews
// ---------------------------------------------------------------------------

test('clearPreview remove arquivo existente e ignora ausente', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'x.mp4');
  fs.writeFileSync(file, 'data');

  assert.equal(clearPreview(file), true);
  assert.equal(fs.existsSync(file), false);
  assert.equal(clearPreview(file), false);
  assert.equal(clearPreview(''), false);
  assert.equal(clearPreview(null), false);
});

test('cleanOldPreviews remove apenas arquivos expirados', () => {
  const tempDir = makeTempDir();
  const previewDir = getPreviewDir(tempDir);
  fs.mkdirSync(previewDir, { recursive: true });

  const oldFile = path.join(previewDir, 'old.mp4');
  const newFile = path.join(previewDir, 'new.mp4');
  fs.writeFileSync(oldFile, 'old');
  fs.writeFileSync(newFile, 'new');

  const now = Date.now();
  const oldTime = (now - 60 * 60 * 1000) / 1000; // 1h atrás
  fs.utimesSync(oldFile, oldTime, oldTime);

  const removed = cleanOldPreviews(tempDir, { now });

  assert.equal(removed, 1);
  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(fs.existsSync(newFile), true);
});

test('cleanOldPreviews em diretório inexistente devolve 0 (não lança)', () => {
  assert.equal(cleanOldPreviews(path.join(makeTempDir(), 'nada')), 0);
});

// ---------------------------------------------------------------------------
// generatePreview — validações (sem executar FFmpeg)
// ---------------------------------------------------------------------------

test('generatePreview rejeita URL ausente', async () => {
  const result = await generatePreview({ ffmpegPath: 'ffmpeg', tempDir: makeTempDir() });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('generatePreview rejeita configuração incompleta', async () => {
  const r1 = await generatePreview({ url: 'https://x.com/a', tempDir: makeTempDir() });
  assert.equal(r1.ok, false);
  const r2 = await generatePreview({ url: 'https://x.com/a', ffmpegPath: 'ffmpeg' });
  assert.equal(r2.ok, false);
});

test('generatePreview rejeita fonte não previewável', async () => {
  const result = await generatePreview({
    url: 'https://x.com/a',
    sourceType: 'drm',
    ffmpegPath: 'ffmpeg',
    tempDir: makeTempDir(),
  });
  assert.equal(result.ok, false);
  assert.ok(/não disponível/i.test(result.error));
});

test('generatePreview com ffmpeg inexistente devolve erro amigável (sem lançar)', async () => {
  const result = await generatePreview({
    url: 'https://example.invalid/video.m3u8',
    sourceType: 'hls',
    ffmpegPath: 'ffmpeg-binario-que-nao-existe-xyz',
    tempDir: makeTempDir(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});
