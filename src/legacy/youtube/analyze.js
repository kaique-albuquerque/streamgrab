/**
 * YouTube — análise de uma URL de watch até o catálogo de formatos.
 */

import { extractPlayerJsUrl, fetchPlayerJs, resolveCipherFormats } from '../youtube-signature/index.js';
import { fetchYouTubePage, extractInitialPlayerResponse, extractYouTubeVideoId } from './page.js';
import { fetchYouTubePlayerApi } from './player.js';
import { buildManifestVariants } from './manifests.js';
import { parseYouTubePlayerResponse } from './response.js';

export async function analyzeYouTubeUrl(url, headers = {}) {
  const { html, finalUrl } = await fetchYouTubePage(url, headers);
  let playerResponse = extractInitialPlayerResponse(html);
  const videoId = extractYouTubeVideoId(finalUrl || url, playerResponse);

  if (!playerResponse?.streamingData && videoId) {
    try {
      const apiResp = await fetchYouTubePlayerApi({ videoId, html, headers });
      if (apiResp?.streamingData) {
        playerResponse = {
          ...playerResponse, ...apiResp,
          streamingData: apiResp.streamingData,
          videoDetails: apiResp.videoDetails || playerResponse.videoDetails,
          playabilityStatus: apiResp.playabilityStatus || playerResponse.playabilityStatus,
        };
      }
    } catch { /* segue com a resposta do HTML */ }
  }

  const playerJsUrl = extractPlayerJsUrl(html, finalUrl);
  if (playerJsUrl) {
    try {
      const playerJsText = await fetchPlayerJs(playerJsUrl, headers);
      if (playerResponse?.streamingData) {
        playerResponse.streamingData.formats =
          resolveCipherFormats(playerResponse.streamingData.formats, playerJsText);
        playerResponse.streamingData.adaptiveFormats =
          resolveCipherFormats(playerResponse.streamingData.adaptiveFormats, playerJsText);
      }
    } catch { /* segue com os formatos ja resolvidos */ }
  }

  const manifestVariants = await buildManifestVariants(playerResponse?.streamingData, headers);
  const parsed = parseYouTubePlayerResponse(playerResponse, finalUrl, manifestVariants);

  if (!parsed.progressiveFormats.length && !parsed.adaptiveVideoFormats.length
    && !parsed.dashManifestUrl && !parsed.hlsManifestUrl) {
    const err = new Error(
      'Nenhum formato do YouTube com URL direta ou manifesto utilizavel foi encontrado.'
    );
    err.code = 'YOUTUBE_DIRECT_FORMAT_UNAVAILABLE';
    err.playerResponse = playerResponse;
    throw err;
  }

  return parsed;
}
