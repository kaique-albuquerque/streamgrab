// Roteamento de download para redes sociais (Facebook, Instagram, TikTok…).
//
// As URLs de CDN dessas plataformas sao assinadas e expiram; baixar por HTTP
// direto devolve 403 e, quando o video tem streams separados, o progresso de
// video e audio chega pelo mesmo canal (a barra enche e volta). O yt-dlp
// resolve cookies/assinatura e reporta um progresso agregado.
//
// Sem rede: o runner de onde sai o download HTTP e o yt-dlp sao injetados
// (executor) ou mockados via mock.module.

import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNERS_URL = pathToFileURL(
  path.join(ROOT, 'src', 'core', 'engine', 'runners', 'index.js')
).href;

const httpCalls = { stream: [], mux: 0 };

mock.module(RUNNERS_URL, {
  namedExports: {
    runFfmpegDownload: async () => ({ ok: true, via: 'ffmpeg' }),
    runCurlHlsDownload: async () => ({ ok: true, via: 'curl' }),
    runHlsSegmentedDownload: async () => ({ ok: true, via: 'hls-segments' }),
    runDashSegmentedDownload: async () => ({ ok: true, via: 'dash-segments' }),
    runMuxDownload: async () => {
      httpCalls.mux += 1;
      return { ok: true, via: 'mux-http' };
    },
    runMuxMultiDownload: async () => ({ ok: true, via: 'mux-multi' }),
    runStreamDownload: async (url) => {
      httpCalls.stream.push(url);
      return { ok: true, via: 'stream' };
    },
    embedSubtitles: async () => ({ ok: true }),
  },
});

const { createDefaultExecutor } = await import('../../src/core/engine/executor/index.js');
const { usesYtDlpDownload, usesYtDlpForSingle } = await import(
  '../../src/core/engine/executor/strategies.js'
);

function makeJob(url, sourceType, meta = {}) {
  return { id: 'job-1', url, _sourceType: sourceType, meta: { sourceType, ...meta } };
}

/** yt-dlp falso: registra as chamadas e resolve/pode falhar. */
function makeFakeYtdlp({ fail = false } = {}) {
  const calls = [];
  const fn = async (params) => {
    calls.push(params);
    if (fail) {
      const err = new Error('yt-dlp falhou');
      err.code = 'YTDLP_ERROR';
      throw err;
    }
    return { ok: true };
  };
  fn.calls = calls;
  return fn;
}

test.beforeEach(() => {
  httpCalls.stream = [];
  httpCalls.mux = 0;
});

// ---------------------------------------------------------------------------
// Predicados de roteamento
// ---------------------------------------------------------------------------

test('usesYtDlpDownload: youtube, social e ytdlp sao fontes do yt-dlp', () => {
  assert.equal(usesYtDlpDownload('youtube', 'https://www.youtube.com/watch?v=abc'), true);
  assert.equal(usesYtDlpDownload('social', 'https://www.facebook.com/watch/?v=1'), true);
  assert.equal(usesYtDlpDownload('ytdlp', 'https://vimeo.com/1'), true);
  assert.equal(usesYtDlpDownload('', 'https://www.youtube.com/watch?v=abc'), true);
});

test('usesYtDlpDownload: hls, dash e direct nao sao fontes do yt-dlp', () => {
  assert.equal(usesYtDlpDownload('hls', 'https://cdn.example/master.m3u8'), false);
  assert.equal(usesYtDlpDownload('dash', 'https://cdn.example/manifest.mpd'), false);
  assert.equal(usesYtDlpDownload('direct', 'https://cdn.example/video.mp4'), false);
  assert.equal(usesYtDlpDownload(undefined, 'https://cdn.example/video.mp4'), false);
});

test('usesYtDlpForSingle: so redes sociais (YouTube progressivo segue no HTTP direto)', () => {
  assert.equal(usesYtDlpForSingle('social'), true);
  assert.equal(usesYtDlpForSingle('SOCIAL'), true);
  assert.equal(usesYtDlpForSingle('youtube'), false);
  assert.equal(usesYtDlpForSingle('direct'), false);
  assert.equal(usesYtDlpForSingle(undefined), false);
});

// ---------------------------------------------------------------------------
// Executor — strategy single
// ---------------------------------------------------------------------------

test('executor: social com strategy single baixa pelo yt-dlp', async () => {
  const ytdlpDownload = makeFakeYtdlp();
  const executor = createDefaultExecutor({ ytdlpDownload });

  const result = await executor.run({
    job: makeJob('https://www.facebook.com/watch/?v=123', 'social', {
      auth: { cookiesFromBrowser: 'chrome' },
      subtitleLanguages: ['pt'],
      embedSubs: true,
    }),
    prepared: {
      strategy: 'single',
      downloadUrl: 'https://scontent.example/video.mp4?token=abc',
      chosenFormat: { sourceKind: 'progressive', formatId: 'sd' },
    },
    output: 'C:\\out\\video.mp4',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    mode: 'video',
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(ytdlpDownload.calls.length, 1, 'yt-dlp deve ser chamado uma vez');
  const call = ytdlpDownload.calls[0];
  assert.equal(call.url, 'https://www.facebook.com/watch/?v=123', 'usa a pagina, nao a URL do CDN');
  assert.equal(call.formatId, 'sd', 'reaproveita o formato escolhido na analise');
  assert.equal(call.output, 'C:\\out\\video.mp4');
  assert.equal(call.auth.cookiesFromBrowser, 'chrome');
  assert.deepEqual(call.subtitleLanguages, ['pt']);
  assert.equal(call.embedSubs, true);
  assert.deepEqual(httpCalls.stream, [], 'nao deve baixar por HTTP direto');
});

test('executor: social single cai no HTTP direto quando o yt-dlp falha', async () => {
  const ytdlpDownload = makeFakeYtdlp({ fail: true });
  const executor = createDefaultExecutor({ ytdlpDownload });
  const logs = [];

  const result = await executor.run({
    job: makeJob('https://www.instagram.com/reel/abc/', 'social'),
    prepared: {
      strategy: 'single',
      downloadUrl: 'https://cdn.example/video.mp4',
      chosenFormat: { sourceKind: 'progressive', formatId: 'hd' },
    },
    output: 'C:\\out\\video.mp4',
    headers: {},
    onLog: (msg) => logs.push(msg),
  });

  assert.equal(result.ok, true);
  assert.equal(result.via, 'stream', 'fallback HTTP direto deve assumir');
  assert.deepEqual(httpCalls.stream, ['https://cdn.example/video.mp4']);
  assert.ok(
    logs.some((l) => l.includes('fallback')),
    'deve registrar o fallback no log'
  );
});

test('executor: social single sem formato escolhido pede "best" ao yt-dlp', async () => {
  const ytdlpDownload = makeFakeYtdlp();
  const executor = createDefaultExecutor({ ytdlpDownload });

  await executor.run({
    job: makeJob('https://www.tiktok.com/@u/video/1', 'social'),
    prepared: { strategy: 'single', downloadUrl: 'https://cdn.example/v.mp4' },
    output: 'C:\\out\\v.mp4',
    headers: {},
  });

  assert.equal(ytdlpDownload.calls[0].formatId, 'best');
});

test('executor: direct com strategy single continua no HTTP direto', async () => {
  const ytdlpDownload = makeFakeYtdlp();
  const executor = createDefaultExecutor({ ytdlpDownload });

  const result = await executor.run({
    job: makeJob('https://cdn.example/video.mp4', 'direct'),
    prepared: { strategy: 'single', downloadUrl: 'https://cdn.example/video.mp4' },
    output: 'C:\\out\\video.mp4',
    headers: {},
  });

  assert.equal(result.via, 'stream');
  assert.equal(ytdlpDownload.calls.length, 0, 'fontes diretas nao passam pelo yt-dlp');
});

test('executor: youtube progressivo continua no HTTP direto', async () => {
  const ytdlpDownload = makeFakeYtdlp();
  const executor = createDefaultExecutor({ ytdlpDownload });

  await executor.run({
    job: makeJob('https://www.youtube.com/watch?v=abc', 'youtube'),
    prepared: {
      strategy: 'single',
      downloadUrl: 'https://rr1---sn.googlevideo.com/videoplayback?itag=18',
      chosenFormat: { sourceKind: 'progressive', formatId: '18' },
    },
    output: 'C:\\out\\video.mp4',
    headers: {},
  });

  assert.equal(ytdlpDownload.calls.length, 0);
  assert.equal(httpCalls.stream.length, 1);
});

// ---------------------------------------------------------------------------
// Executor — strategy mux
// ---------------------------------------------------------------------------

test('executor: social com strategy mux baixa pelo yt-dlp (nao pelo mux HTTP)', async () => {
  const ytdlpDownload = makeFakeYtdlp();
  const executor = createDefaultExecutor({ ytdlpDownload });

  const result = await executor.run({
    job: makeJob('https://www.instagram.com/reel/abc/', 'social'),
    prepared: {
      strategy: 'mux',
      videoUrl: 'https://cdn.example/v.mp4',
      audioUrl: 'https://cdn.example/a.m4a',
      chosenFormat: { sourceKind: 'adaptive', formatId: 'dash-720', height: 720 },
    },
    output: 'C:\\out\\video.mp4',
    headers: {},
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(ytdlpDownload.calls.length, 1);
  assert.equal(ytdlpDownload.calls[0].url, 'https://www.instagram.com/reel/abc/');
  assert.match(
    ytdlpDownload.calls[0].formatId,
    /^bestvideo\[height<=720\]/,
    'mux usa o seletor de altura do formato escolhido'
  );
  assert.equal(httpCalls.mux, 0, 'nao deve usar o mux por HTTP');
});

test('executor: social mux cai no mux HTTP quando o yt-dlp falha', async () => {
  const ytdlpDownload = makeFakeYtdlp({ fail: true });
  const executor = createDefaultExecutor({ ytdlpDownload });

  const result = await executor.run({
    job: makeJob('https://www.facebook.com/watch/?v=1', 'social'),
    prepared: {
      strategy: 'mux',
      videoUrl: 'https://cdn.example/v.mp4',
      audioUrl: 'https://cdn.example/a.m4a',
      chosenFormat: { sourceKind: 'adaptive', formatId: '720p', height: 720 },
    },
    output: 'C:\\out\\video.mp4',
    headers: {},
  });

  assert.equal(result.via, 'mux-http');
  assert.equal(httpCalls.mux, 1);
});
