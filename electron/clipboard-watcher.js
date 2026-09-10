/**
 * ClipboardWatcher — Monitora a área de transferência em busca de URLs
 * de mídia compatíveis com o StreamGrab.
 *
 * Lê a clipboard via Electron API (processo main) em intervalos regulares.
 * Quando detecta uma URL de vídeo compatível, notifica o renderer via IPC.
 *
 * Segurança (seção 24):
 *  - A clipboard é lida APENAS no processo main.
 *  - O renderer nunca acessa a clipboard diretamente.
 *  - O watcher pausa quando a janela não está focada.
 */

const POLL_INTERVAL_MS = 2000;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos
const COOLDOWN_CLEANUP_THRESHOLD = 20;

export function createClipboardWatcher({ clipboard }) {
  let intervalId = null;
  let lastUrl = '';
  let isPaused = false;
  let isEnabled = true;
  const cooldownMap = new Map();
  let cooldownCount = 0;

  /** Listener chamado quando uma URL é detectada. */
  let onDetected = null;

  function start(pollMs = POLL_INTERVAL_MS) {
    if (intervalId) return;
    intervalId = setInterval(poll, pollMs);
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function setEnabled(val) {
    isEnabled = Boolean(val);
    if (!isEnabled) stop();
    else if (!intervalId) start();
  }

  function focusGained() { isPaused = false; }
  function focusLost() { isPaused = true; }

  function setOnDetected(cb) {
    onDetected = typeof cb === 'function' ? cb : null;
  }

  function poll() {
    if (isPaused || !isEnabled) return;

    try {
      const text = (clipboard.readText() || '').trim();
      if (!text) return;

      const normalized = text.toLowerCase();
      if (normalized === lastUrl) return;

      // Verifica cooldown
      if (cooldownMap.has(normalized)) {
        const ts = cooldownMap.get(normalized);
        if (Date.now() - ts < COOLDOWN_MS) return;
        cooldownMap.delete(normalized);
      }

      const sourceType = detectSourceType(normalized);
      if (sourceType === 'unknown') {
        // Marca como última para não reprocessar, mas não notifica
        lastUrl = normalized;
        return;
      }

      lastUrl = normalized;

      if (typeof onDetected === 'function') {
        onDetected({ url: text, sourceType });
      }
    } catch {
      // clipboard.readText() pode lançar se a clipboard estiver vazia
    }
  }

  function addCooldown(url) {
    cooldownMap.set(url.toLowerCase(), Date.now());
    cooldownCount++;
    if (cooldownCount % COOLDOWN_CLEANUP_THRESHOLD === 0) {
      cleanupCooldown();
    }
  }

  function cleanupCooldown() {
    const now = Date.now();
    for (const [url, ts] of cooldownMap) {
      if (now - ts > COOLDOWN_MS) cooldownMap.delete(url);
    }
  }

  function isOnCooldown(url) {
    const ts = cooldownMap.get(url.toLowerCase());
    if (!ts) return false;
    if (Date.now() - ts < COOLDOWN_MS) return true;
    cooldownMap.delete(url.toLowerCase());
    return false;
  }

  function dispose() {
    stop();
    cooldownMap.clear();
    onDetected = null;
  }

  return {
    start,
    stop,
    setEnabled,
    focusGained,
    focusLost,
    setOnDetected,
    addCooldown,
    isOnCooldown,
    dispose,
  };
}

/**
 * Detecta o tipo de fonte a partir de uma URL normalizada (lowercase).
 */
function detectSourceType(url) {
  if (/(youtube\.com|youtu\.be)\//.test(url)) return 'youtube';
  if (/\.m3u8/.test(url)) return 'hls';
  if (/\.mpd/.test(url)) return 'dash';
  if (/\.(mp4|webm|mkv|mov|avi)(\?|$)/.test(url)) return 'direct';
  if (/(instagram\.com|facebook\.com|tiktok\.com|x\.com|twitter\.com)\//.test(url)) return 'social';
  return 'unknown';
}