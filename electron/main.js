import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { RESOURCES_PATH_ENV } from '../src/core/binaries.js';
import { createCurlClient, findCurlImpersonate } from '../src/curlimp.js';
import { parsePlaylistText } from '../src/hls.js';
import { isMdstrmUrl } from '../src/mdstrm.js';
import { resolveSourceAdapterAsync } from '../src/source-adapters.js';
import { loadConfig, applyProviderHeaders } from '../src/cli/config.js';
import { friendlyReport } from '../src/core/errors.js';
import { safeRefreshMdstrm } from '../src/core/mdstrm-routing.js';
import { normalizeMediaInfo } from './media-info.js';
import { createElectronServices } from './services.js';
import { createClipboardWatcher } from './clipboard-watcher.js';
import { createNotifier } from './notifications.js';
import {
  isSafeHttpUrl,
  validateAnalyzePayload,
  validateDownloadPayload,
  validateQueueEnqueuePayload,
  validateJobIdPayload,
  validateHistoryIdPayload,
  validateSettingsPayload,
  validateRevealPayload,
  validateExportLogsPayload,
  registerRevealRoot,
  isValidJobId,
  isValidTaskId,
} from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// P10 (seção 7): em produção, os binários ficam em extraResources
// (resourcesPath/bin) — o core puro lê apenas o ambiente (src/core/binaries.js).
if (app.isPackaged && process.resourcesPath) {
  process.env[RESOURCES_PATH_ENV] = process.resourcesPath;
}

// P11: serviços compartilhados (Core + Queue + Settings + History) criados
// no ready() — o Electron consome StreamGrabCore/DownloadQueue diretamente,
// sem runCliSession()/createAnswerBook() para downloads (itens 1-5 do pedido).
let services = null;

// Clipboard watcher para detecção automática de URLs.
let clipboardWatcher = null;

// Compatibilidade: taskId (abas) -> jobId (fila real).
const taskToJob = new Map();

// Raízes permitidas para abrir/localizar arquivos (seção 24: impede path
// traversal e abertura de arquivos arbitrários via IPC).
const allowedRevealRoots = new Set();

function addRevealRoot(dir) {
  registerRevealRoot(dir, allowedRevealRoots);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0a0f14',
    title: 'StreamGrab',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // P8 (seção 24): sandbox ativado — o preload é CommonJS (preload.cjs)
      // e o renderer roda isolado, sem acesso ao Node.
      sandbox: true,
    },
  });

  win.removeMenu();

  // P8 (seção 24): navegação web e janelas externas — impede abertura de popups
  // ou navegação da janela principal para URLs não confiáveis.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (isSafeHttpUrl(url)) shell.openExternal(url);
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  // P11: monta os serviços com persistência real em userData
  // (settings.json, history.json, queue.json) — itens 3-5 do pedido.
  const userDataDir = app.getPath('userData');
  const broadcast = (event, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('queue:event', { event, payload });
    }
  };

  services = createElectronServices({
    userDataDir,
    onEvent: (event, payload) => broadcast(event, payload),
  });

  // Eventos do engine que a fila não re-emite: progresso, pausa/retomada,
  // início do job, velocidade, ETA e diagnóstico sanitizado — mesmo canal
  // `queue:event`.
  for (const event of ['start', 'progress', 'speed', 'eta', 'pause', 'resume', 'log']) {
    services.core.on(event, (payload) => broadcast(event, payload));
  }

  // Persistência final antes de sair (a fila salva a cada mudança de estado,
  // mas garante aqui no encerramento).
  app.on('before-quit', () => {
    try {
      services?.queue.save();
    } catch {
      /* ignora */
    }
  });

  createWindow();

  // Clipboard watcher — detecta URLs de mídia na área de transferência
  clipboardWatcher = createClipboardWatcher({ clipboard });
  clipboardWatcher.setOnDetected(({ url, sourceType }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('clipboard:url-detected', { url, sourceType });
      }
    }
  });
  if (services.settings.get('clipboardWatch') !== false) {
    clipboardWatcher.start();
  }

  // Pausa/retoma watcher com foco da janela
  const createdWin = BrowserWindow.getAllWindows()[0];
  if (createdWin) {
    createdWin.on('blur', () => clipboardWatcher.focusLost());
    createdWin.on('focus', () => clipboardWatcher.focusGained());
  }

  // Notificações nativas — conecta aos eventos broadcast para o renderer
  const notifier = createNotifier({
    settingsGet: () => services.settings.all(),
    getWindow: () => BrowserWindow.getAllWindows()[0] || null,
    shell,
  });
  // Escuta eventos complet/error do engine (já broadcast, mas notifier
  // precisa do evento separadamente para agregação)
  for (const event of ['complete', 'error']) {
    services.core.on(event, (payload) => notifier.onJobEvent(event, payload));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app:pick-output-dir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  addRevealRoot(result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle('app:resolve-paths', async () => {
  const defaultDownloads = app.getPath('downloads');
  addRevealRoot(defaultDownloads);
  return {
    projectRoot: PROJECT_ROOT,
    defaultDownloads,
  };
});

// SPEC-07: espaço em disco para o dashboard da fila
ipcMain.handle('app:disk-space', async (_event, { dir } = {}) => {
  const targetDir = typeof dir === 'string' && dir ? dir : app.getPath('downloads');
  const { getDiskSpace } = await import('../src/core/disk.js');
  const space = await getDiskSpace(targetDir);
  return space || { free: null, total: null, used: null };
});

// Abre uma URL http(s) no navegador padrão (seção 24: apenas http/https).
ipcMain.handle('app:open-external', async (_event, { url } = {}) => {
  if (!isSafeHttpUrl(url)) return { ok: false, error: 'URL inválida.' };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Falha ao abrir o link.' };
  }
});

// P8 (seção 24): abertura/localização de arquivos concluídos — restrita às
// raízes registradas (pasta escolhida, Downloads padrão, projectRoot).
ipcMain.handle('app:open-file', async (_event, payload) => {
  const validated = validateRevealPayload(payload, [...allowedRevealRoots]);
  if (!validated) return { ok: false, error: 'Caminho inválido ou fora das pastas permitidas.' };
  const result = await shell.openPath(validated.filePath);
  return result ? { ok: false, error: result } : { ok: true };
});

ipcMain.handle('app:show-in-folder', async (_event, payload) => {
  const validated = validateRevealPayload(payload, [...allowedRevealRoots]);
  if (!validated) return { ok: false, error: 'Caminho inválido ou fora das pastas permitidas.' };
  shell.showItemInFolder(validated.filePath);
  return { ok: true };
});

// P4.1: export diagnostic log to file
ipcMain.handle('app:export-logs', async (_event, payload) => {
  const userDataDir = app.getPath('userData');
  const validated = validateExportLogsPayload(payload, [...allowedRevealRoots, userDataDir]);
  if (!validated) return { ok: false, error: 'Caminho de log inválido ou fora das pastas permitidas.' };
  const { exportLogs, defaultLogPath } = await import('../src/core/log-export.js');
  const logger = services?.core?.events ? services.core : null;
  const buffer = logger?.getBuffer?.() || [];
  const dest = validated.path || defaultLogPath(userDataDir);
  return exportLogs(buffer, dest);
});

// Clipboard: adiciona URL ao cooldown (usuário clicou "Ignorar")
ipcMain.handle('clipboard:ignore-url', async (_event, { url }) => {
  if (clipboardWatcher && typeof url === 'string') {
    clipboardWatcher.addCooldown(url);
  }
  return { ok: true };
});

async function analyzePlaylist(rawPayload) {
  // P8 (seção 24): validação da mensagem IPC antes de qualquer processamento.
  const payload = validateAnalyzePayload(rawPayload);
  if (!payload) {
    const err = new Error('URL inválida. Informe uma URL http/https.');
    err.code = 'INVALID_URL';
    throw err;
  }
  const { url, headers, auth } = payload;

  // P11.1: o Electron agora le os headers do config.json (como o CLI) e os
  // repassa para analise + download. Headers vindos do renderer vencem config.
  const config = loadConfig(PROJECT_ROOT, { log: () => {} });
  const mergedHeaders = applyProviderHeaders({
    url,
    headers: { ...config.headers, ...headers },
    argv: ['--hotmart'],
  });

  // URL efetivamente usada na analise (mdstrm converte a URL crua do CDN para
  // a URL do player). Devolvida ao renderer para que a fila re-analise/baixe
  // a MESMA URL que funcionou — a crua da 403 para qualquer cliente.
  let workingUrl = url;

  const adapter = await resolveSourceAdapterAsync(url, mergedHeaders);
  let analysis;
  if (adapter.id === 'direct') {
    analysis = { kind: 'direct', totalDuration: 0 };
  } else if (adapter.id === 'dash') {
    analysis = await adapter.analyze({ url, headers: mergedHeaders });
  } else if (adapter.id === 'youtube' || adapter.id === 'social') {
    const mergedAuth = {
      cookiesFile: auth?.cookiesFile || config.cookiesFile || '',
      cookiesFromBrowser: auth?.cookiesFromBrowser || config.cookiesFromBrowser || '',
    };
    analysis = await adapter.analyze({ url, headers: mergedHeaders, auth: mergedAuth });
  } else if (adapter.id === 'unknown') {
    analysis = await adapter.analyze({ url, headers: mergedHeaders });
  } else {
    const found = findCurlImpersonate();

    // mdstrm: URL crua do CDN (tokens presos à sessão do player) dá 403 para
    // qualquer cliente. Converte para a URL do player usando o embed público —
    // funciona SEM curl-impersonate (fetch nativo); com curl, usa o cliente
    // para imitar o TLS quando o CDN exige navegador real.
    if (isMdstrmUrl(url)) {
      const client = found ? createCurlClient({ cmd: found.cmd, headers: mergedHeaders, profile: found.profile }) : null;
      workingUrl = await safeRefreshMdstrm(url, client);
    }

    try {
      analysis = await adapter.analyze({ url: workingUrl, headers: mergedHeaders });
    } catch (err) {
      if (err?.status !== 403 || !found) throw err;

      const client = createCurlClient({ cmd: found.cmd, headers: mergedHeaders, profile: found.profile });
      const { text, finalUrl } = await client.getText(workingUrl);
      analysis = parsePlaylistText(text, finalUrl || url);
    }
  }

  // P8 (seção 8/9): resposta normalizada para a UI + shape legado preservado.
  const media = normalizeMediaInfo(analysis, {
    url,
    baseUrl: analysis.baseUrl || url,
    sourceType: adapter.id === 'youtube' ? 'youtube' : adapter.id === 'social' ? 'social' : analysis.sourceType || adapter.id,
    provider: adapter.label || adapter.id,
  });
  return { ...analysis, media, workingUrl };
}

ipcMain.handle('playlist:analyze', async (_event, rawPayload) => {
  // P11 (secao 42 — UX de falhas): falhas viram { ok: false, error: report }
  // para a UI renderizar "Motivo / Acao sugerida / [Detalhes]".
  try {
    return await analyzePlaylist(rawPayload);
  } catch (err) {
    const report = friendlyReport(err);
    if (!report.suggestedAction && report.code === 'INVALID_URL') {
      report.suggestedAction = 'Informe uma URL completa, iniciando com http:// ou https://.';
    }
    return { ok: false, error: report };
  }
});

// ---------------------------------------------------------------------------
// P11 — downloads via StreamGrabCore + DownloadQueue (itens 1-2 do pedido)
//
// `download:start` (botão "Baixar agora", com taskId) e `queue:enqueue`
// (botão "Adicionar à fila") enfileiram na MESMA fila real com persistência:
// concorrência limitada (settings.maxConcurrentDownloads), estados aguardando/
// downloading/paused/completed/failed/cancelled, pause/resume/cancel/retry.
// Nenhum download depende de runCliSession()/createAnswerBook().
// ---------------------------------------------------------------------------

function enqueueDownload({ url, filename, outputDir, selectedUrl, title, turbo, cookiesFile, cookiesFromBrowser, taskId, audioLanguage, allAudio, subtitleLanguages, embedSubs }) {
  if (!services) {
    const err = new Error('Serviços ainda não inicializados.');
    err.code = 'NOT_READY';
    throw err;
  }
  if (outputDir) addRevealRoot(outputDir);

  // P11.1: headers do config.json (Referer/Origin/User-Agent) seguem para o
  // download na fila — mesmo comportamento do CLI.
  const config = loadConfig(PROJECT_ROOT, { log: () => {} });
  const downloadHeaders = applyProviderHeaders({
    url,
    headers: config.headers,
    argv: ['--hotmart'],
  });

  const job = services.queue.enqueue(url, {
    title: title || filename || '',
    meta: {
      destination: outputDir || '',
      filename: filename || '',
      selectedUrl: selectedUrl || '',
      sourceUrl: url,
      taskId: taskId || '',
      turbo: Boolean(turbo),
      turboChunks: Number(services.settings.get('turboChunks')) || 8,
      headers: downloadHeaders,
      auth: {
        cookiesFile: cookiesFile || config.cookiesFile || '',
        cookiesFromBrowser: cookiesFromBrowser || config.cookiesFromBrowser || '',
      },
      // P12.1: audio/subtitle selections
      audioLanguage: audioLanguage || '',
      allAudio: Boolean(allAudio),
      subtitleLanguages: Array.isArray(subtitleLanguages) ? subtitleLanguages : [],
      embedSubs: Boolean(embedSubs),
    },
  });
  if (taskId) taskToJob.set(taskId, job.id);
  services.queue.save();
  return job;
}

ipcMain.handle('download:start', async (_event, rawPayload) => {
  // P8 (seção 24): validação completa do payload antes de enfileirar.
  const payload = validateDownloadPayload(rawPayload);
  if (!payload) {
    const result = {
      code: 1,
      ok: false,
      error: {
        message: 'Payload de download inválido.',
        suggestedAction: 'Feche e reabra a aba ou reinicie o aplicativo e tente novamente.',
      },
    };
    return result;
  }
  try {
    const job = enqueueDownload(payload);
    return { ok: true, jobId: job.id };
  } catch (err) {
    const result = { code: 1, ok: false, error: friendlyReport(err) };
    return result;
  }
});

ipcMain.handle('queue:enqueue', async (_event, rawPayload) => {
  const payload = validateQueueEnqueuePayload(rawPayload);
  if (!payload) {
    return { ok: false, error: { message: 'Payload de fila inválido.', suggestedAction: 'Verifique a URL e tente novamente.' } };
  }
  try {
    const job = enqueueDownload(payload);
    return { ok: true, jobId: job.id };
  } catch (err) {
    return { ok: false, error: friendlyReport(err) };
  }
});

ipcMain.handle('queue:list', async () => {
  if (!services) return { jobs: [], maxConcurrent: 3, paused: false };
  // all(): inclui jobs terminais para a UI oferecer retry/remove.
  const jobs = services.queue.all().map((j) => ({ ...j, meta: { ...j.meta } }));
  return { jobs, maxConcurrent: services.queue.maxConcurrent, paused: services.queue.paused };
});

// ---------------------------------------------------------------------------
// SPEC-06 — Preview de mídia
//
// Gera um trecho curto (até 60s) do vídeo para o usuário conferir o conteúdo
// antes de baixar. Cache em memória de 30 min para não regerar o mesmo preview.
// ---------------------------------------------------------------------------
const previewCache = new Map(); // `${url}|${quality}` -> { path, time }

ipcMain.handle('preview:generate', async (_event, rawPayload) => {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  const quality = typeof payload.quality === 'string' ? payload.quality.trim() : '';
  const sourceType = typeof payload.sourceType === 'string' ? payload.sourceType : '';

  if (!isSafeHttpUrl(url)) return { ok: false, error: 'URL inválida para preview.' };
  if (quality && !isSafeMediaSelection(quality)) return { ok: false, error: 'Qualidade inválida para preview.' };

  const { generatePreview, clearPreview } = await import('../src/preview.js');
  if (!canPreviewSource(sourceType)) {
    return { ok: false, error: 'Preview não disponível para este tipo de mídia.' };
  }

  const cacheKey = `${url}|${quality}`;
  const cached = previewCache.get(cacheKey);
  if (cached) {
    if (Date.now() - cached.time < 30 * 60 * 1000) {
      try {
        // Revalida a existência do arquivo antes de servir do cache.
        const stat = (await import('node:fs')).statSync(cached.path);
        if (stat.size > 0) {
          return {
            ok: true,
            filePath: cached.path,
            srcUrl: pathToFileURL(cached.path).toString(),
            size: stat.size,
            mimeType: 'video/mp4',
            cached: true,
          };
        }
      } catch {
        /* arquivo sumiu: gera de novo */
      }
      previewCache.delete(cacheKey);
    } else {
      clearPreview(cached.path);
      previewCache.delete(cacheKey);
    }
  }

  const { getFfmpegCommand } = await import('../src/ffmpeg/service.js');
  const { formatHeaders } = await import('../src/ffmpeg/muxer.js');

  const config = loadConfig(PROJECT_ROOT, { log: () => {} });
  const mergedHeaders = applyProviderHeaders({ url, headers: config.headers, argv: ['--hotmart'] });
  const headerStr = formatHeaders(mergedHeaders);

  const result = await generatePreview({
    url,
    quality,
    sourceType,
    ffmpegPath: getFfmpegCommand(),
    tempDir: app.getPath('temp'),
    headers: headerStr,
  });

  if (result.ok && result.filePath) {
    previewCache.set(cacheKey, { path: result.filePath, time: Date.now() });
    return { ...result, srcUrl: pathToFileURL(result.filePath).toString(), mimeType: 'video/mp4' };
  }
  return result;
});

ipcMain.handle('preview:clear', async (_event, rawPayload) => {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const filePath = typeof payload.filePath === 'string' ? payload.filePath : '';
  if (!filePath) return { ok: false };
  const { clearPreview } = await import('../src/preview.js');
  clearPreview(filePath);
  for (const [key, value] of previewCache) {
    if (value.path === filePath) previewCache.delete(key);
  }
  return { ok: true };
});

/** Fontes elegíveis para preview (espelha src/preview.js). */
function canPreviewSource(sourceType) {
  return ['hls', 'dash', 'direct', 'youtube', 'social', 'ytdlp'].includes(String(sourceType || '').toLowerCase());
}

// SPEC-03: download em lote — processa várias URLs e enfileira cada uma.
ipcMain.handle('batch:enqueue', async (_event, rawPayload) => {
  if (!services) {
    return { results: [], ok: 0, failed: 0, error: 'Serviços não inicializados.' };
  }
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const rawUrls = Array.isArray(payload.urls) ? payload.urls : [];

  // Segurança: valida e normaliza cada URL antes de processar.
  const urls = [];
  for (const u of rawUrls) {
    const value = typeof u === 'string' ? u.trim() : '';
    if (value && isSafeHttpUrl(value)) urls.push(value);
  }

  if (urls.length === 0) {
    return { results: [], ok: 0, failed: 0, error: 'Nenhuma URL válida informada.' };
  }

  const outputDir = typeof payload.outputDir === 'string' ? payload.outputDir : '';
  if (outputDir) addRevealRoot(outputDir);

  const { processBatch } = await import('../src/batch.js');

  const send = (data) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('batch:progress', data);
    }
  };

  const results = await processBatch({
    urls,
    outputDir,
    options: {
      turbo: payload.turbo === true,
      allAudio: payload.allAudio === true,
      subtitleLanguages: Array.isArray(payload.subtitleLanguages) ? payload.subtitleLanguages : [],
      embedSubs: payload.embedSubs === true,
    },
    analyze: (url) => analyzePlaylist({ url, headers: {}, auth: {} }),
    enqueue: (item) => {
      const job = enqueueDownload({
        url: item.url,
        filename: item.filename,
        title: item.title,
        outputDir: item.outputDir,
        turbo: item.options?.turbo === true,
        allAudio: item.options?.allAudio === true,
        subtitleLanguages: item.options?.subtitleLanguages || [],
        embedSubs: item.options?.embedSubs === true,
      });
      return job;
    },
    onProgress: (data) => send(data),
  });

  return results;
});

ipcMain.handle('queue:setPaused', async (_e, value) => {
  if (!services) return { ok: false, error: 'Serviços não inicializados' };
  services.queue.setPaused(Boolean(value));
  await services.queue.save();
  return { ok: true, paused: services.queue.paused };
});

ipcMain.handle('queue:pause', async (_event, rawPayload) => {
  const payload = validateJobIdPayload(rawPayload);
  if (!payload || !services) return false;
  try {
    services.queue.pause(payload.jobId);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('queue:resume', async (_event, rawPayload) => {
  const payload = validateJobIdPayload(rawPayload);
  if (!payload || !services) return false;
  try {
    services.queue.resume(payload.jobId);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('queue:cancel', async (_event, rawPayload) => {
  const payload = validateJobIdPayload(rawPayload);
  if (!payload || !services) return false;
  try {
    services.queue.cancel(payload.jobId);
    services.queue.save();
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('queue:retry', async (_event, rawPayload) => {
  const payload = validateJobIdPayload(rawPayload);
  if (!payload || !services) return false;
  try {
    const job = services.queue.retry(payload.jobId);
    services.queue.save();
    return { ok: true, jobId: job.id };
  } catch {
    return false;
  }
});

ipcMain.handle('queue:remove', async (_event, rawPayload) => {
  const payload = validateJobIdPayload(rawPayload);
  if (!payload || !services) return false;
  try {
    services.queue.remove(payload.jobId);
    services.queue.save();
    return true;
  } catch {
    return false;
  }
});

// Compatibilidade com o fluxo antigo de cancelamento por taskId (abas).
// Aceita { jobId } (fila real) ou { taskId } (mapeado para jobId).
ipcMain.handle('download:cancel', async (_event, rawPayload) => {
  if (!services) return false;
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  let jobId = typeof payload.jobId === 'string' && isValidJobId(payload.jobId) ? payload.jobId : '';
  if (!jobId) {
    const taskId = typeof payload.taskId === 'string' && isValidTaskId(payload.taskId) ? payload.taskId : '';
    jobId = taskToJob.get(taskId) || '';
  }
  if (!jobId) return false;
  try {
    services.queue.cancel(jobId);
    services.queue.save();
    return true;
  } catch {
    return false;
  }
});

// ---------------------------------------------------------------------------
// P11 — Histórico e Configurações (itens 3-5 do pedido)
// ---------------------------------------------------------------------------

ipcMain.handle('history:list', async () => {
  if (!services) return [];
  return services.history.list();
});

ipcMain.handle('history:remove', async (_event, rawPayload) => {
  const payload = validateHistoryIdPayload(rawPayload);
  if (!payload || !services) return false;
  services.history.remove(payload.id);
  return true;
});

ipcMain.handle('history:clear', async () => {
  if (!services) return false;
  services.history.clear();
  return true;
});

// SPEC-08: exporta o histórico em CSV/JSON. Se `filePath` não for informado,
// abre o diálogo nativo "Salvar como". O renderer pode enviar apenas as
// entradas visíveis (filtradas) via `entries`.
ipcMain.handle('history:export', async (_event, rawPayload) => {
  if (!services) return { ok: false, error: 'Serviços não inicializados.' };

  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const format = payload.format === 'csv' ? 'csv' : 'json';

  // Entradas: usa a lista filtrada enviada pelo renderer ou todo o histórico.
  let entries;
  if (Array.isArray(payload.entries)) {
    entries = payload.entries
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        id: String(e.id || ''),
        title: String(e.title || ''),
        url: String(e.url || ''),
        provider: String(e.provider || ''),
        format: String(e.format || ''),
        destination: String(e.destination || ''),
        status: String(e.status || ''),
        size: Number(e.size) || 0,
        durationMs: Number(e.durationMs) || 0,
        date: String(e.date || ''),
      }));
  } else {
    entries = services.history.list();
  }

  let destPath = typeof payload.filePath === 'string' ? payload.filePath : '';
  if (!destPath) {
    const { suggestExportFilename } = await import('../src/core/history-export.js');
    const result = await dialog.showSaveDialog({
      title: 'Exportar histórico',
      defaultPath: suggestExportFilename(format),
      filters: format === 'csv'
        ? [{ name: 'CSV (Planilha)', extensions: ['csv'] }]
        : [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    destPath = result.filePath;
    addRevealRoot(path.dirname(destPath));
  } else if (!path.isAbsolute(destPath)) {
    return { ok: false, error: 'Caminho de destino inválido.' };
  }

  const { exportHistoryToFile } = await import('../src/core/history-export.js');
  return exportHistoryToFile({ entries, format, filePath: destPath });
});

ipcMain.handle('history:redownload', async (_event, rawPayload) => {
  const payload = validateHistoryIdPayload(rawPayload);
  if (!payload || !services) return false;
  const entry = services.history.get(payload.id);
  if (!entry) return { ok: false, error: 'Entrada não encontrada no histórico.' };
  try {
    const destination = typeof entry.destination === 'string' && entry.destination ? entry.destination : '';
    const dir = destination ? path.dirname(destination) : '';
    const base = destination ? path.basename(destination, path.extname(destination)) : '';
    const job = enqueueDownload({
      url: entry.url,
      filename: base,
      outputDir: dir,
      title: entry.title || '',
    });
    return { ok: true, jobId: job.id };
  } catch (err) {
    return { ok: false, error: friendlyReport(err) };
  }
});

ipcMain.handle('settings:get', async () => {
  if (!services) return {};
  return services.settings.all();
});

ipcMain.handle('settings:update', async (_event, rawPayload) => {
  if (!services) return null;
  const clean = validateSettingsPayload(rawPayload);
  if (!clean) return null;
  return { ok: true, settings: services.applySettings(clean) };
});

ipcMain.handle('settings:reset', async () => {
  if (!services) return null;
  const updated = services.settings.reset();
  services.queue.setMaxConcurrent(updated.maxConcurrentDownloads);
  services.queue.save();
  return updated;
});
