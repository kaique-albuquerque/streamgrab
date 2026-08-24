import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DownloadEngine,
  createDownloadEngine,
  createDefaultExecutor,
  defaultResolveAdapter,
} from '../../src/core/engine.js';
import { ForbiddenError, NetworkError, UnsupportedSourceError } from '../../src/core/errors.js';
import { EVENT_NAMES } from '../../src/core/events.js';

// ---------------------------------------------------------------------------
// Mocks: executor deterministico + resolver fake (sem rede externa).
// ---------------------------------------------------------------------------

const FAKE_ADAPTER = { id: 'direct' };

function createFakeExecutor(overrides = {}) {
  let runCalls = 0;
  return {
    runCalls: () => runCalls,
    async analyze(adapter, { url }) {
      return {
        title: `Titulo de ${adapter.id}`,
        durationSeconds: 120,
        pageUrl: url,
        videoId: 'abc123',
        progressiveFormats: [{ formatId: '18', url: 'https://cdn.example/prog.mp4', height: 360 }],
        adaptiveVideoFormats: [{ formatId: '137', url: 'https://cdn.example/v.mp4', height: 1080 }],
        adaptiveAudioFormats: [{ formatId: '140', url: 'https://cdn.example/a.m4a' }],
        variants: ['https://cdn.example/prog.mp4', 'ytdlp-format:137'],
      };
    },
    async prepare(adapter, { selectedUrl }) {
      return {
        strategy: 'single',
        downloadUrl: selectedUrl || 'https://cdn.example/prog.mp4',
        chosenFormat: { sourceKind: 'progressive', formatId: '18' },
        totalBytes: 1000,
        durationMs: 120000,
      };
    },
    async run({ signal, onProgress, output }) {
      runCalls += 1;
      onProgress({ bytesDownloaded: 100, totalBytes: 1000, percent: 10, speed: 1024, etaSeconds: 9 });
      await fs.promises.writeFile(output, 'conteudo-do-arquivo');
      if (signal?.aborted) {
        return signal.reason === 'pause' ? { paused: true } : { cancelled: true };
      }
      return { ok: true };
    },
    ...overrides,
  };
}

/** Resolver fake: nunca faz rede. */
function fakeResolver({ adapter = FAKE_ADAPTER, spy } = {}) {
  return async (url, opts) => {
    spy?.(url, opts);
    return adapter;
  };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-engine-test-'));
}

async function waitFor(fn, timeoutMs = 3000) {
  const start = Date.now();
  for (;;) {
    if (fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error('timeout esperando condicao');
    await new Promise((r) => setTimeout(r, 10));
  }
}

function makeEngine(opts = {}) {
  return new DownloadEngine({
    progressThrottleMs: 0,
    resolveAdapter: fakeResolver(),
    executor: createFakeExecutor(),
    ...opts,
  });
}

// ---------------------------------------------------------------------------

test('core-engine: factory, classe e executor padrao expostos', () => {
  assert.equal(typeof DownloadEngine, 'function');
  assert.equal(typeof createDownloadEngine, 'function');
  assert.ok(createDownloadEngine({ resolveAdapter: fakeResolver() }) instanceof DownloadEngine);
  assert.equal(typeof createDefaultExecutor, 'function');
  assert.equal(typeof defaultResolveAdapter, 'function');
  const executor = createDefaultExecutor();
  assert.equal(typeof executor.analyze, 'function');
  assert.equal(typeof executor.prepare, 'function');
  assert.equal(typeof executor.run, 'function');
});

test('core-engine: ciclo completo enqueue -> run emite eventos e termina completed', async () => {
  const tmp = makeTempDir();
  const engine = makeEngine();
  const seen = [];
  for (const name of EVENT_NAMES) engine.on(name, (payload) => seen.push({ name, payload }));

  const queued = engine.enqueue('https://example.com/video.mp4', { title: 'Meu video' });
  const job = await engine.run(queued.id, { destination: tmp });

  assert.equal(job.state, 'completed');
  assert.equal(job.title, 'Titulo de direct');
  assert.ok(job.meta.output, 'output deve ser preenchido');
  assert.ok(fs.existsSync(job.meta.output), 'arquivo final deve existir');

  const names = seen.map((e) => e.name);
  for (const expected of ['start', 'progress', 'complete']) {
    assert.ok(names.includes(expected), `evento ${expected} deve ter sido emitido`);
  }
  assert.ok(!names.includes('error'));

  const states = job.history.map((h) => h.to);
  assert.deepEqual(states, ['queued', 'analyzing', 'preparing', 'downloading', 'completed']);
  assert.deepEqual(engine.getQueue(), []);
  assert.deepEqual(engine.getHistory().map((j) => j.id), [job.id]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: run com URL nova cria job e o titulo analisado prevalece', async () => {
  const tmp = makeTempDir();
  const engine = makeEngine();
  const job = await engine.run('https://example.com/video.mp4', { destination: tmp });
  assert.equal(job.state, 'completed');
  assert.ok(job.id.startsWith('job-'));
  assert.equal(job.title, 'Titulo de direct');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: cancelamento interrompe, limpa parcial e emite cancel', async () => {
  const tmp = makeTempDir();
  const executor = createFakeExecutor({
    async run({ signal, output }) {
      await fs.promises.writeFile(output, 'parcial');
      await new Promise((resolve) => {
        if (signal?.aborted) return resolve();
        signal?.addEventListener('abort', resolve, { once: true });
      });
      return { cancelled: true };
    },
  });
  const engine = makeEngine({ executor });
  const cancelled = [];
  engine.on('cancel', (p) => cancelled.push(p));

  const promise = engine.run('https://example.com/video.mp4', { destination: tmp });
  await waitFor(() => engine.getQueue().some((j) => j.state === 'downloading'));
  engine.cancel(engine.getQueue()[0].id);

  const job = await promise;
  assert.equal(job.state, 'cancelled');
  assert.equal(job.error.code, 'CANCELLED');
  assert.ok(!fs.existsSync(job.meta.output), 'parcial deve ser removido');
  assert.equal(cancelled.length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: erro HTTP 500 e mapeado para NetworkError retryable (P2.2)', async () => {
  const tmp = makeTempDir();
  const executor = createFakeExecutor({
    async run() {
      return { ok: false, code: 'HTTP_ERROR', error: 'HTTP 500', status: 500 };
    },
  });
  const engine = makeEngine({ executor });
  const errors = [];
  engine.on('error', (p) => errors.push(p));

  await assert.rejects(
    () => engine.run('https://example.com/video.mp4', { destination: tmp }),
    (err) => err instanceof NetworkError && err.retryable === true
  );

  const job = engine.getHistory()[0];
  assert.equal(job.state, 'failed');
  assert.equal(job.error.code, 'NETWORK_ERROR');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].stage, 'failed');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: erro lancado no analyze do executor e classificado e job falha', async () => {
  const tmp = makeTempDir();
  const executor = createFakeExecutor({
    async analyze() {
      const err = new Error('HTTP 401');
      err.status = 401;
      throw err;
    },
  });
  const engine = makeEngine({ executor });
  await assert.rejects(() => engine.run('https://example.com/video.mp4', { destination: tmp }));
  const job = engine.getHistory()[0];
  assert.equal(job.state, 'failed');
  assert.equal(job.error.code, 'AUTHENTICATION_ERROR');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: fonte desconhecida vira UnsupportedSourceError e job falha', async () => {
  const tmp = makeTempDir();
  const engine = makeEngine({ resolveAdapter: fakeResolver({ adapter: { id: 'unknown' } }) });
  await assert.rejects(
    () => engine.run('https://example.com/arquivo.xyz', { destination: tmp }),
    (err) => err instanceof UnsupportedSourceError
  );
  const job = engine.getHistory()[0];
  assert.equal(job.state, 'failed');
  assert.equal(job.error.code, 'UNSUPPORTED_SOURCE');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: estado consistente em cada transicao (historico valido)', async () => {
  const tmp = makeTempDir();
  const engine = makeEngine();
  const job = await engine.run('https://example.com/video.mp4', { destination: tmp });
  const chain = job.history.map((h) => h.to);
  assert.deepEqual(chain, ['queued', 'analyzing', 'preparing', 'downloading', 'completed']);
  // Serializacao limpa: sem campos circulares nem funcoes.
  const json = JSON.parse(JSON.stringify(job));
  assert.equal(json.state, 'completed');
  assert.equal(json.error, null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: taskState interno acompanha downloading -> processing -> completed', async () => {
  const tmp = makeTempDir();
  const executor = createFakeExecutor({
    async run({ onProgress, output }) {
      onProgress({ bytesDownloaded: 400, totalBytes: 1000, percent: 40, stage: 'downloading' });
      onProgress({ percent: 95, stage: 'merging', message: 'Processando arquivo final' });
      await fs.promises.writeFile(output, 'final');
      return { ok: true };
    },
  });
  const engine = makeEngine({ executor });

  const job = await engine.run('https://example.com/video.mp4', { destination: tmp });

  assert.equal(job.state, 'completed');
  assert.equal(job.meta.taskState, 'completed');
  assert.ok(job.meta.downloadedAt, 'downloadedAt deve ser marcado ao entrar em merging');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: pause/resume reexecuta o download e emite pause/resume', async () => {
  const tmp = makeTempDir();
  let attempts = 0;
  const executor = createFakeExecutor({
    async run({ signal, onProgress, output }) {
      attempts += 1;
      onProgress({ bytesDownloaded: 50, totalBytes: 1000, percent: 5 });
      if (attempts === 1) {
        await new Promise((resolve) => {
          if (signal?.aborted) return resolve();
          signal?.addEventListener('abort', resolve, { once: true });
        });
        return { paused: true };
      }
      await fs.promises.writeFile(output, 'final');
      return { ok: true };
    },
  });
  const engine = makeEngine({ executor });
  const pauses = [];
  const resumes = [];
  engine.on('pause', (p) => pauses.push(p));
  engine.on('resume', (p) => resumes.push(p));

  const promise = engine.run('https://example.com/video.mp4', { destination: tmp });
  await waitFor(() => engine.getQueue().some((j) => j.state === 'downloading'));
  engine.pause(engine.getQueue()[0].id);
  await waitFor(() => engine.getQueue().some((j) => j.state === 'paused'));
  engine.resume(engine.getQueue()[0].id);

  const job = await promise;
  assert.equal(job.state, 'completed');
  assert.equal(attempts, 2);
  assert.equal(pauses.length, 1);
  assert.equal(resumes.length, 1);
  assert.ok(job.history.some((h) => h.to === 'paused'), 'historico deve conter paused');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: cancel de job queued finaliza direto e run posterior lanca JOB_ALREADY_FINAL', async () => {
  const engine = makeEngine();
  const queued = engine.enqueue('https://example.com/video.mp4');
  const cancelled = [];
  engine.on('cancel', (p) => cancelled.push(p));
  const result = engine.cancel(queued.id);
  assert.equal(result.state, 'cancelled');
  assert.equal(cancelled.length, 1);
  await assert.rejects(
    () => engine.run(queued.id),
    (err) => err.code === 'JOB_ALREADY_FINAL'
  );
});

test('core-engine: cancel de job pausado acorda o loop e finaliza', async () => {
  const tmp = makeTempDir();
  let attempts = 0;
  const executor = createFakeExecutor({
    async run({ signal }) {
      attempts += 1;
      await new Promise((resolve) => {
        if (signal?.aborted) return resolve();
        signal?.addEventListener('abort', resolve, { once: true });
      });
      return attempts === 1 ? { paused: true } : { cancelled: true };
    },
  });
  const engine = makeEngine({ executor });
  const promise = engine.run('https://example.com/video.mp4', { destination: tmp });
  await waitFor(() => engine.getQueue().some((j) => j.state === 'downloading'));
  engine.pause(engine.getQueue()[0].id);
  await waitFor(() => engine.getQueue().some((j) => j.state === 'paused'));
  engine.cancel(engine.getQueue()[0].id);
  const job = await promise;
  assert.equal(job.state, 'cancelled');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: run em job em andamento lanca JOB_ALREADY_RUNNING e controles JOB_NOT_FOUND', async () => {
  const tmp = makeTempDir();
  const executor = createFakeExecutor({
    async run({ signal }) {
      await new Promise((resolve) => {
        if (signal?.aborted) return resolve();
        signal?.addEventListener('abort', resolve, { once: true });
      });
      return { cancelled: true };
    },
  });
  const engine = makeEngine({ executor });
  const promise = engine.run('https://example.com/video.mp4', { destination: tmp });
  await waitFor(() => engine.getQueue().some((j) => j.state === 'downloading'));
  const queued = engine.getQueue()[0];
  await assert.rejects(
    () => engine.run(queued.id),
    (err) => err.code === 'JOB_ALREADY_RUNNING'
  );
  for (const fn of ['pause', 'resume', 'cancel']) {
    assert.throws(() => engine[fn]('inexistente'), (err) => err.code === 'JOB_NOT_FOUND');
  }
  engine.cancel(queued.id);
  await promise;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: download por id repassa selectedUrl ao prepare', async () => {
  const tmp = makeTempDir();
  const preparedUrls = [];
  const executor = createFakeExecutor({
    async prepare(adapter, { selectedUrl }) {
      preparedUrls.push(selectedUrl);
      return { strategy: 'single', downloadUrl: selectedUrl, totalBytes: 100, durationMs: 1000 };
    },
  });
  const engine = makeEngine({ executor });
  const queued = engine.enqueue('https://example.com/video.mp4', { title: 'Playlist' });
  const job = await engine.run(queued.id, { selectedUrl: 'ytdlp-format:137', destination: tmp });
  assert.equal(job.id, queued.id);
  assert.equal(job.state, 'completed');
  assert.deepEqual(preparedUrls, ['ytdlp-format:137']);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: aceita DownloadPlan no prepare e converte para o shape executavel atual', async () => {
  const tmp = makeTempDir();
  let seenPrepared = null;
  const executor = createFakeExecutor({
    async prepare() {
      return {
        contractVersion: 2,
        kind: 'direct',
        source: { url: 'https://cdn.example.com/video.mp4', totalBytes: 1234, durationMs: 45000 },
        requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
        selectedFormat: { formatId: '18', url: 'https://cdn.example.com/video.mp4' },
        capabilities: { rangeDownload: true },
        strategyHints: { preferredTransport: 'http' },
      };
    },
    async run({ prepared, output }) {
      seenPrepared = prepared;
      await fs.promises.writeFile(output, 'conteudo-do-arquivo');
      return { ok: true };
    },
  });

  const engine = makeEngine({ executor });
  const job = await engine.run('https://example.com/video.mp4', { destination: tmp });

  assert.equal(job.state, 'completed');
  assert.equal(seenPrepared.strategy, 'single');
  assert.equal(seenPrepared.downloadUrl, 'https://cdn.example.com/video.mp4');
  assert.equal(seenPrepared.totalBytes, 1234);
  assert.equal(seenPrepared.durationMs, 45000);
  assert.equal(seenPrepared.chosenFormat.formatId, '18');
  assert.ok(seenPrepared._downloadPlan, 'DownloadPlan original preservado internamente');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: RequestContext do DownloadPlan e fundido aos headers do download', async () => {
  const tmp = makeTempDir();
  let seenHeaders = null;
  const executor = createFakeExecutor({
    async prepare() {
      return {
        contractVersion: 2,
        kind: 'direct',
        source: { url: 'https://cdn.example.com/video.mp4' },
        requestContext: {
          headers: { 'X-Provider': 'abc' },
          cookies: null,
          referer: 'https://page.example/watch',
          origin: 'https://page.example',
          userAgent: 'ProviderAgent/1.0',
          profile: 'browser',
        },
        capabilities: {},
        strategyHints: {},
      };
    },
    async run({ headers, output }) {
      seenHeaders = headers;
      await fs.promises.writeFile(output, 'conteudo-do-arquivo');
      return { ok: true };
    },
  });

  const engine = makeEngine({ executor });
  const job = await engine.run('https://example.com/video.mp4', {
    destination: tmp,
    headers: { Authorization: 'Bearer xyz', Referer: 'https://caller.example/override' },
  });

  assert.equal(job.state, 'completed');
  assert.equal(seenHeaders.Authorization, 'Bearer xyz');
  assert.equal(seenHeaders['X-Provider'], 'abc');
  assert.equal(seenHeaders.Referer, 'https://caller.example/override');
  assert.equal(seenHeaders.Origin, 'https://page.example');
  assert.equal(seenHeaders['User-Agent'], 'ProviderAgent/1.0');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: provider.refresh renova o plano uma unica vez apos 403 refreshable', async () => {
  const tmp = makeTempDir();
  let runCalls = 0;
  let refreshCalls = 0;
  let lastPrepared = null;
  const refreshableAdapter = {
    id: 'hls',
    async refresh() {
      refreshCalls += 1;
      return {
        contractVersion: 2,
        kind: 'hls',
        source: { manifestUrl: 'https://cdn.example.com/fresh.m3u8' },
        requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
        capabilities: { refreshAccess: true },
        strategyHints: { preferredTransport: 'ffmpeg' },
      };
    },
  };
  const executor = createFakeExecutor({
    async prepare() {
      return {
        contractVersion: 2,
        kind: 'hls',
        source: { manifestUrl: 'https://cdn.example.com/stale.m3u8' },
        requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
        capabilities: { refreshAccess: true },
        strategyHints: { preferredTransport: 'ffmpeg' },
      };
    },
    async run({ prepared, output }) {
      runCalls += 1;
      lastPrepared = prepared;
      if (runCalls === 1) {
        return { ok: false, code: 'FORBIDDEN_ERROR', error: 'HTTP 403', status: 403 };
      }
      await fs.promises.writeFile(output, 'conteudo-do-arquivo');
      return { ok: true };
    },
  });

  const engine = makeEngine({
    executor,
    resolveAdapter: fakeResolver({ adapter: refreshableAdapter }),
  });
  const logs = [];
  engine.on('log', (payload) => logs.push(payload.message));

  const job = await engine.run('https://example.com/video.m3u8', { destination: tmp });
  assert.equal(job.state, 'completed');
  assert.equal(runCalls, 2);
  assert.equal(refreshCalls, 1);
  assert.equal(lastPrepared.downloadUrl, 'https://cdn.example.com/fresh.m3u8');
  assert.ok(logs.some((message) => message.includes('plano renovado pelo provider hls')));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: resolveAdapter injetado e usado (spy)', async () => {
  const tmp = makeTempDir();
  const calls = [];
  const engine = makeEngine({ resolveAdapter: fakeResolver({ spy: (url, opts) => calls.push({ url, opts }) }) });
  await engine.run('https://example.com/video.mp4', { destination: tmp });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.com/video.mp4');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: progress emite speed e eta separados', async () => {
  const tmp = makeTempDir();
  const engine = makeEngine();
  const speeds = [];
  const etas = [];
  engine.on('speed', (p) => speeds.push(p));
  engine.on('eta', (p) => etas.push(p));
  await engine.run('https://example.com/video.mp4', { destination: tmp });
  assert.equal(speeds.length, 1);
  assert.equal(speeds[0].speed, 1024);
  assert.equal(etas.length, 1);
  assert.equal(etas[0].etaSeconds, 9);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: dispose cancela downloads ativos', async () => {
  const tmp = makeTempDir();
  const executor = createFakeExecutor({
    async run({ signal, output }) {
      await fs.promises.writeFile(output, 'parcial');
      await new Promise((resolve) => {
        if (signal?.aborted) return resolve();
        signal?.addEventListener('abort', resolve, { once: true });
      });
      return { cancelled: true };
    },
  });
  const engine = makeEngine({ executor });
  const promise = engine.run('https://example.com/video.mp4', { destination: tmp });
  await waitFor(() => engine.getQueue().some((j) => j.state === 'downloading'));
  engine.dispose();
  const job = await promise;
  assert.equal(job.state, 'cancelled');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: erro em handler de evento nao derruba o engine', async () => {
  const tmp = makeTempDir();
  const engine = makeEngine();
  engine.on('progress', () => {
    throw new Error('boom no handler');
  });
  const job = await engine.run('https://example.com/video.mp4', { destination: tmp });
  assert.equal(job.state, 'completed');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: default executor usa hls-segments com playlist local quando feature flag esta ativa', async () => {
  const tmp = makeTempDir();
  const calls = { segmentUrls: [], ffmpegUrls: [], adaptive: [], checkpoints: [] };
  const executor = createDefaultExecutor({
    prepareHlsSegments: async ({ url, adaptive, onCheckpoint }) => {
      calls.segmentUrls.push(url);
      calls.adaptive.push(adaptive);
      onCheckpoint?.({
        backend: 'hls-segments',
        manifestUrl: url,
        outputMode: 'single',
        taskState: 'downloaded',
        segments: [{ id: 'video:main:seg:0', stream: 'video', representationId: 'main', index: 0, status: 'completed' }],
        completedSegmentIds: ['video:main:seg:0'],
      });
      calls.checkpoints.push('emitted');
      const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-engine-'));
      const localPlaylist = path.join(workDir, 'local.m3u8');
      fs.writeFileSync(localPlaylist, '#EXTM3U\n#EXTINF:4,\nseg.ts\n#EXT-X-ENDLIST\n', 'utf8');
      fs.writeFileSync(path.join(workDir, 'seg.ts'), 'segment-data', 'utf8');
      return {
        ok: true,
        localPlaylist,
        extraArgs: [],
        cleanup: () => fs.rmSync(workDir, { recursive: true, force: true }),
      };
    },
    ffmpegStartDownload: ({ url, output }) => {
      calls.ffmpegUrls.push(url);
      fs.writeFileSync(output, 'fake-mp4');
      return { promise: Promise.resolve({ ok: true }), stop: () => {} };
    },
  });
  const engine = new DownloadEngine({
    progressThrottleMs: 0,
    executor,
    resolveAdapter: fakeResolver({
      adapter: {
        id: 'hls',
        async analyze() {
          return { kind: 'media', title: 'HLS test', variants: [], baseUrl: 'https://cdn.example/' };
        },
        async prepareDownloadPlan() {
          return {
            contractVersion: 2,
            kind: 'hls',
            source: { manifestUrl: 'https://cdn.example/media.m3u8' },
            requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
            capabilities: { segmentedDownload: true, refreshAccess: false },
            strategyHints: { preferredTransport: 'segments' },
          };
        },
      },
    }),
    settings: {
      get(key) {
        if (key === 'features') return { hlsSegments: true };
        return null;
      },
    },
  });

  const job = await engine.run('https://cdn.example/media.m3u8', { destination: tmp });
  assert.equal(job.state, 'completed');
  assert.equal(calls.segmentUrls.length, 1);
  assert.equal(typeof calls.adaptive[0], 'object');
  assert.equal(calls.ffmpegUrls.length, 1);
  assert.equal(calls.checkpoints.length, 1);
  assert.ok(!/^https?:/.test(calls.ffmpegUrls[0]), 'FFmpeg deve receber playlist local');
  assert.equal(job.meta.checkpoint.backend, 'hls-segments');
  assert.equal(job.meta.checkpoint.taskState, 'completed');
  assert.deepEqual(job.meta.checkpoint.completedSegmentIds, ['video:main:seg:0']);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: default executor reapassa checkpoint HLS e tmpDir anterior ao backend segmentado', async () => {
  const tmp = makeTempDir();
  const resumeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-resume-engine-'));
  const calls = { checkpoints: [], tmpDirs: [] };
  const executor = createDefaultExecutor({
    prepareHlsSegments: async ({ url, checkpoint, tmpDir }) => {
      calls.checkpoints.push(checkpoint);
      calls.tmpDirs.push(tmpDir);
      const localPlaylist = path.join(resumeDir, 'local.m3u8');
      fs.writeFileSync(localPlaylist, '#EXTM3U\n#EXTINF:4,\nseg.ts\n#EXT-X-ENDLIST\n', 'utf8');
      fs.writeFileSync(path.join(resumeDir, 'seg.ts'), 'segment-data', 'utf8');
      return {
        ok: true,
        localPlaylist,
        extraArgs: [],
        diagnostics: { workDir: resumeDir },
        cleanup: () => {},
      };
    },
    ffmpegStartDownload: ({ output }) => {
      fs.writeFileSync(output, 'fake-mp4');
      return { promise: Promise.resolve({ ok: true }), stop: () => {} };
    },
  });
  const engine = new DownloadEngine({
    progressThrottleMs: 0,
    executor,
    resolveAdapter: fakeResolver({
      adapter: {
        id: 'hls',
        async analyze() {
          return { kind: 'media', title: 'HLS resume test', variants: [], baseUrl: 'https://cdn.example/' };
        },
        async prepareDownloadPlan() {
          return {
            contractVersion: 2,
            kind: 'hls',
            source: { manifestUrl: 'https://cdn.example/media.m3u8' },
            requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
            capabilities: { segmentedDownload: true, refreshAccess: false },
            strategyHints: { preferredTransport: 'segments' },
          };
        },
      },
    }),
    settings: {
      get(key) {
        if (key === 'features') return { hlsSegments: true };
        return null;
      },
    },
  });

  const queued = engine.enqueue('https://cdn.example/media.m3u8', {
    meta: {
      sourceType: 'hls',
      checkpoint: {
        backend: 'hls-segments',
        manifestUrl: 'https://cdn.example/media.m3u8',
        outputMode: 'single',
        taskState: 'downloading',
        diagnostics: { workDir: resumeDir },
        completedSegmentIds: ['video:/media.m3u8:seg:0'],
      },
    },
  });

  try {
    const job = await engine.run(queued.id, { destination: tmp });
    assert.equal(job.state, 'completed');
    assert.equal(calls.checkpoints.length, 1);
    assert.equal(calls.checkpoints[0].backend, 'hls-segments');
    assert.equal(calls.tmpDirs[0], resumeDir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(resumeDir, { recursive: true, force: true });
  }
});

test('core-engine: default executor faz fallback para ffmpeg remoto quando hls-segments retorna manifesto nao suportado', async () => {
  const tmp = makeTempDir();
  const calls = { segmentUrls: [], ffmpegUrls: [] };
  const executor = createDefaultExecutor({
    prepareHlsSegments: async ({ url }) => {
      calls.segmentUrls.push(url);
      return {
        ok: false,
        code: 'MANIFEST_UNSUPPORTED',
        reasonCode: 'hls-byterange-unsupported',
        error: 'BYTERANGE unsupported',
        fallback: 'ffmpeg',
      };
    },
    ffmpegStartDownload: ({ url, output }) => {
      calls.ffmpegUrls.push(url);
      fs.writeFileSync(output, 'fake-mp4');
      return { promise: Promise.resolve({ ok: true }), stop: () => {} };
    },
  });
  const engine = new DownloadEngine({
    progressThrottleMs: 0,
    executor,
    resolveAdapter: fakeResolver({
      adapter: {
        id: 'hls',
        async analyze() {
          return { kind: 'media', title: 'HLS test', variants: [], baseUrl: 'https://cdn.example/' };
        },
        async prepareDownloadPlan() {
          return {
            contractVersion: 2,
            kind: 'hls',
            source: { manifestUrl: 'https://cdn.example/media.m3u8' },
            requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
            capabilities: { segmentedDownload: true, refreshAccess: false },
            strategyHints: { preferredTransport: 'segments' },
          };
        },
      },
    }),
    settings: {
      get(key) {
        if (key === 'features') return { hlsSegments: true };
        return null;
      },
    },
  });

  const job = await engine.run('https://cdn.example/media.m3u8', { destination: tmp });
  assert.equal(job.state, 'completed');
  assert.equal(calls.segmentUrls.length, 1);
  assert.deepEqual(calls.ffmpegUrls, ['https://cdn.example/media.m3u8']);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('core-engine: default executor usa dash-segments com mux local quando feature flag esta ativa', async () => {
  const tmp = makeTempDir();
  const calls = { dashUrls: [], muxInputs: [], adaptive: [], checkpoints: [] };
  const executor = createDefaultExecutor({
    prepareDashSegments: async ({ url, adaptive, onCheckpoint }) => {
      calls.dashUrls.push(url);
      calls.adaptive.push(adaptive);
      onCheckpoint?.({
        backend: 'dash-segments',
        manifestUrl: url,
        outputMode: 'mux',
        taskState: 'downloaded',
        selected: { videoRepresentationId: 'video-720', audioRepresentationId: 'audio-128' },
        segments: [
          { id: 'video:video-720:init:0', stream: 'video', representationId: 'video-720', index: 0, init: true, status: 'completed' },
          { id: 'audio:audio-128:init:0', stream: 'audio', representationId: 'audio-128', index: 0, init: true, status: 'completed' },
        ],
        completedSegmentIds: ['video:video-720:init:0', 'audio:audio-128:init:0'],
      });
      calls.checkpoints.push('emitted');
      const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dash-segments-engine-'));
      const video = path.join(workDir, 'video.mp4');
      const audio = path.join(workDir, 'audio.m4a');
      fs.writeFileSync(video, 'video-data');
      fs.writeFileSync(audio, 'audio-data');
      return {
        ok: true,
        mode: 'mux',
        videoPath: video,
        audioPath: audio,
        cleanup: () => fs.rmSync(workDir, { recursive: true, force: true }),
      };
    },
    ffmpegStartMuxDownload: ({ videoInput, audioInput, output }) => {
      calls.muxInputs.push({ videoInput, audioInput });
      fs.writeFileSync(output, 'muxed-data');
      return { promise: Promise.resolve({ ok: true }), stop: () => {} };
    },
  });
  const engine = new DownloadEngine({
    progressThrottleMs: 0,
    executor,
    resolveAdapter: fakeResolver({
      adapter: {
        id: 'dash',
        async analyze() {
          return { kind: 'dash', title: 'DASH test', representations: [], videoRepresentations: [], audioRepresentations: [], baseUrl: 'https://cdn.example/' };
        },
        async prepareDownloadPlan() {
          return {
            contractVersion: 2,
            kind: 'dash',
            source: { manifestUrl: 'https://cdn.example/manifest.mpd' },
            requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
            capabilities: { segmentedDownload: true, refreshAccess: false },
            strategyHints: { preferredTransport: 'segments' },
          };
        },
      },
    }),
    settings: {
      get(key) {
        if (key === 'features') return { dashSegments: true };
        return null;
      },
    },
  });
  try {
    const job = await engine.run('https://cdn.example/manifest.mpd', { destination: tmp });
    assert.equal(job.state, 'completed');
    assert.equal(calls.dashUrls.length, 1);
    assert.equal(typeof calls.adaptive[0], 'object');
    assert.equal(calls.muxInputs.length, 1);
    assert.equal(calls.checkpoints.length, 1);
    assert.equal(job.meta.checkpoint.backend, 'dash-segments');
    assert.equal(job.meta.checkpoint.taskState, 'completed');
    assert.deepEqual(
      job.meta.checkpoint.completedSegmentIds.sort(),
      ['audio:audio-128:init:0', 'video:video-720:init:0'].sort()
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('core-engine: default executor reapassa checkpoint DASH e tmpDir anterior ao backend segmentado', async () => {
  const tmp = makeTempDir();
  const resumeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dash-segments-resume-engine-'));
  const calls = { checkpoints: [], tmpDirs: [] };
  const executor = createDefaultExecutor({
    prepareDashSegments: async ({ url, checkpoint, tmpDir }) => {
      calls.checkpoints.push(checkpoint);
      calls.tmpDirs.push(tmpDir);
      const video = path.join(resumeDir, 'video.mp4');
      const audio = path.join(resumeDir, 'audio.m4a');
      fs.writeFileSync(video, 'video-data');
      fs.writeFileSync(audio, 'audio-data');
      return {
        ok: true,
        mode: 'mux',
        videoPath: video,
        audioPath: audio,
        diagnostics: { workDir: resumeDir },
        cleanup: () => {},
      };
    },
    ffmpegStartMuxDownload: ({ output }) => {
      fs.writeFileSync(output, 'muxed-data');
      return { promise: Promise.resolve({ ok: true }), stop: () => {} };
    },
  });
  const engine = new DownloadEngine({
    progressThrottleMs: 0,
    executor,
    resolveAdapter: fakeResolver({
      adapter: {
        id: 'dash',
        async analyze() {
          return { kind: 'dash', title: 'DASH resume test', representations: [], videoRepresentations: [], audioRepresentations: [], baseUrl: 'https://cdn.example/' };
        },
        async prepareDownloadPlan() {
          return {
            contractVersion: 2,
            kind: 'dash',
            source: { manifestUrl: 'https://cdn.example/manifest.mpd' },
            requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
            capabilities: { segmentedDownload: true, refreshAccess: false },
            strategyHints: { preferredTransport: 'segments' },
          };
        },
      },
    }),
    settings: {
      get(key) {
        if (key === 'features') return { dashSegments: true };
        return null;
      },
    },
  });

  const queued = engine.enqueue('https://cdn.example/manifest.mpd', {
    meta: {
      sourceType: 'dash',
      checkpoint: {
        backend: 'dash-segments',
        manifestUrl: 'https://cdn.example/manifest.mpd',
        outputMode: 'mux',
        taskState: 'downloading',
        diagnostics: { workDir: resumeDir },
        completedSegmentIds: ['video:video-720:init:0'],
      },
    },
  });

  try {
    const job = await engine.run(queued.id, { destination: tmp });
    assert.equal(job.state, 'completed');
    assert.equal(calls.checkpoints.length, 1);
    assert.equal(calls.checkpoints[0].backend, 'dash-segments');
    assert.equal(calls.tmpDirs[0], resumeDir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(resumeDir, { recursive: true, force: true });
  }
});
