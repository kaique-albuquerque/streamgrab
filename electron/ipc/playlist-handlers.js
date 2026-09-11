/**
 * Handler IPC de análise de playlist/fonte de mídia.
 */

import { ipcMain } from 'electron';
import { parsePlaylistText } from '../../src/hls.js';
import { isMdstrmUrl } from '../../src/mdstrm.js';
import { resolveSourceAdapterAsync } from '../../src/source-adapters.js';
import { loadConfig, applyProviderHeaders } from '../../src/cli/config.js';
import { friendlyReport } from '../../src/core/errors.js';
import { safeRefreshMdstrm } from '../../src/core/mdstrm-routing.js';
import { normalizeMediaInfo } from '../media-info.js';
import { validateAnalyzePayload } from '../security.js';
import { PROJECT_ROOT } from './state.js';

import { createCurlClient, findCurlImpersonate } from '../../src/curlimp.js';

async function analyzePlaylist(rawPayload) {
  const payload = validateAnalyzePayload(rawPayload);
  if (!payload) {
    const err = new Error('URL inválida. Informe uma URL http/https.');
    err.code = 'INVALID_URL';
    throw err;
  }
  const { url, headers, auth } = payload;

  const config = loadConfig(PROJECT_ROOT, { log: () => {} });
  const mergedHeaders = applyProviderHeaders({
    url,
    headers: { ...config.headers, ...headers },
    argv: ['--hotmart'],
  });

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

  const media = normalizeMediaInfo(analysis, {
    url,
    baseUrl: analysis.baseUrl || url,
    sourceType: adapter.id === 'youtube' ? 'youtube' : adapter.id === 'social' ? 'social' : analysis.sourceType || adapter.id,
    provider: adapter.label || adapter.id,
  });
  return { ...analysis, media, workingUrl };
}

export { analyzePlaylist };

export function registerPlaylistHandlers() {
  ipcMain.handle('playlist:analyze', async (_event, rawPayload) => {
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
}
