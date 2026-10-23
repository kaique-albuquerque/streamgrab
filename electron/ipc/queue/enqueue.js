/**
 * Enfileiramento de um download na DownloadQueue.
 */

import { applyProviderHeaders, loadConfig } from '../../../src/cli/config.js';
import { isSafeAbsolutePath, isSafeHttpUrl } from '../../security.js';
import { PROJECT_ROOT, addRevealRoot, getServices, taskToJob } from '../state.js';

function createQueueError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function enqueueDownload({ url, filename, outputDir, selectedUrl, title, turbo, cookiesFile, cookiesFromBrowser, taskId, audioLanguage, allAudio, subtitleLanguages, embedSubs }) {
  const services = getServices();
  if (!services) {
    throw createQueueError('Serviços ainda não inicializados.', 'NOT_READY');
  }
  // Sentinel Security: Defense-in-depth validation of URL, output directory, and cookies file.
  if (!isSafeHttpUrl(url)) {
    throw createQueueError('URL de download inválida.', 'INVALID_URL');
  }
  if (outputDir && !isSafeAbsolutePath(outputDir)) {
    throw createQueueError('Diretório de saída inválido.', 'INVALID_OUTPUT_DIR');
  }
  if (cookiesFile && !isSafeAbsolutePath(cookiesFile)) {
    throw createQueueError('Caminho do arquivo de cookies inválido.', 'INVALID_COOKIES_FILE');
  }
  if (outputDir) addRevealRoot(outputDir);

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
