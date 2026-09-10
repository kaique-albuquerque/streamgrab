/**
 * P8 — Preload do Electron (seção 24)
 *
 * Convertido para CommonJS (.cjs) para permitir `sandbox: true` no
 * BrowserWindow: preloads em sandbox não suportam ESM e têm acesso restrito
 * (apenas `require('electron')` + polyfills do sandbox). Nenhuma API do Node
 * é exposta ao renderer — só o bridge tipado abaixo.
 *
 * Segurança (seção 24):
 *  - contextIsolation: true (no main.js)
 *  - nodeIntegration: false (no main.js)
 *  - API mínima: analyze/start/cancel/pickDir/resolvePaths/openFile/showInFolder
 *    + P11: fila, histórico e configurações (itens 2-5 do pedido).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Fluxo de análise e download (downloads vão para a fila real do core).
  analyzePlaylist: (payload) => ipcRenderer.invoke('playlist:analyze', payload),
  startDownload: (payload) => ipcRenderer.invoke('download:start', payload),
  cancelDownload: (payload) => ipcRenderer.invoke('download:cancel', payload),
  pickOutputDir: () => ipcRenderer.invoke('app:pick-output-dir'),
  resolvePaths: () => ipcRenderer.invoke('app:resolve-paths'),
  diskSpace: (payload) => ipcRenderer.invoke('app:disk-space', payload),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', { url }),
  openFile: (payload) => ipcRenderer.invoke('app:open-file', payload),
  showInFolder: (payload) => ipcRenderer.invoke('app:show-in-folder', payload),

  // P11 — Fila real (src/core/queue.js).
  queueEnqueue: (payload) => ipcRenderer.invoke('queue:enqueue', payload),
  queueList: () => ipcRenderer.invoke('queue:list'),
  queueSetPaused: (paused) => ipcRenderer.invoke('queue:setPaused', Boolean(paused)),
  queuePause: (jobId) => ipcRenderer.invoke('queue:pause', { jobId }),
  queueResume: (jobId) => ipcRenderer.invoke('queue:resume', { jobId }),
  queueCancel: (jobId) => ipcRenderer.invoke('queue:cancel', { jobId }),
  queueRetry: (jobId) => ipcRenderer.invoke('queue:retry', { jobId }),
  queueRemove: (jobId) => ipcRenderer.invoke('queue:remove', { jobId }),

  // P11 — Histórico (src/core/history.js).
  historyList: () => ipcRenderer.invoke('history:list'),
  historyRemove: (id) => ipcRenderer.invoke('history:remove', { id }),
  historyClear: () => ipcRenderer.invoke('history:clear'),
  historyRedownload: (id) => ipcRenderer.invoke('history:redownload', { id }),
  exportHistory: (payload) => ipcRenderer.invoke('history:export', payload),

  // P11 — Configurações (src/core/settings.js).
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsUpdate: (partial) => ipcRenderer.invoke('settings:update', partial),
  settingsReset: () => ipcRenderer.invoke('settings:reset'),

  // Eventos unificados da fila/engine (started/start/progress/pause/resume/
  // complete/error/cancel/speed/eta) — payload { event, payload }.
  onQueueEvent: (cb) => ipcRenderer.on('queue:event', (_e, data) => cb(data)),

  // Clipboard watcher — detecção automática de URL.
  onClipboardDetected: (cb) => ipcRenderer.on('clipboard:url-detected', (_e, data) => cb(data)),
  clipboardIgnoreUrl: (url) => ipcRenderer.invoke('clipboard:ignore-url', { url }),

  // SPEC-03 — Download em lote.
  batchEnqueue: (payload) => ipcRenderer.invoke('batch:enqueue', payload),
  onBatchProgress: (cb) => ipcRenderer.on('batch:progress', (_e, data) => cb(data)),

  // SPEC-06 — Preview de mídia.
  generatePreview: (payload) => ipcRenderer.invoke('preview:generate', payload),
  clearPreview: (filePath) => ipcRenderer.invoke('preview:clear', { filePath }),
});
