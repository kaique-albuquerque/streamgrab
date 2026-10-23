/**
 * YouTube — resolução da URL efetiva de download e estratégia.
 */

import { validateYouTubeMediaUrl } from './player.js';
import { buildCandidatePlans, parseManifestSelection } from './plans.js';

export async function prepareYouTubeDownload({ analysis, selectedUrl, headers = {} }) {
  const manifestSelection = parseManifestSelection(selectedUrl);

  if (manifestSelection === 'dash' && analysis?.dashManifestUrl) {
    return {
      strategy: 'single',
      downloadUrl: analysis.dashManifestUrl,
      chosenFormat: { sourceKind: 'manifest-dash' },
    };
  }
  if (manifestSelection === 'hls' && analysis?.hlsManifestUrl) {
    return {
      strategy: 'single',
      downloadUrl: analysis.hlsManifestUrl,
      chosenFormat: { sourceKind: 'manifest-hls' },
    };
  }

  const candidates = buildCandidatePlans(analysis, selectedUrl);
  if (!candidates.length) {
    const err = new Error('Nao foi possivel resolver URLs do YouTube para download.');
    err.code = 'YOUTUBE_DOWNLOAD_URL_MISSING';
    throw err;
  }

  let lastFailure = null;
  for (const c of candidates) {
    if (c.strategy === 'single' || c.strategy === 'manifest') {
      const probe = await validateYouTubeMediaUrl(c.downloadUrl, headers);
      if (probe.ok) {
        return c.strategy === 'manifest'
          ? { strategy: 'single', downloadUrl: c.downloadUrl,
              chosenFormat: { sourceKind: `manifest-${c.manifestType}` } }
          : c;
      }
      lastFailure = `${c.strategy}:${probe.status || probe.reason}`;
      continue;
    }
    const videoProbe = await validateYouTubeMediaUrl(c.videoUrl, headers);
    if (!videoProbe.ok) { lastFailure = `video:${videoProbe.status || videoProbe.reason}`; continue; }
    const audioProbe = await validateYouTubeMediaUrl(c.audioUrl, headers);
    if (!audioProbe.ok) { lastFailure = `audio:${audioProbe.status || audioProbe.reason}`; continue; }
    return c;
  }

  const err = new Error('As URLs de midia do YouTube foram resolvidas, mas nenhuma passou na validacao.');
  err.code = 'YOUTUBE_DOWNLOAD_URL_INVALID';
  err.details = lastFailure;
  throw err;
}
