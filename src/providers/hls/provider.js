/**
 * Provider HLS normalizado (contrato V2) com compatibilidade legada.
 */

import { detectSourceType } from '../../utils.js';
import { isMdstrmUrl } from '../../mdstrm.js';
import { analyzePlaylist, buildFormats, buildPlan, buildResolution } from './playlist.js';
import { refreshHlsPlan } from './refresh.js';

async function resolve({ url, headers }) {
  const { finalUrl, mediaInfo } = await analyzePlaylist(url, headers);
  return buildResolution({ url, finalUrl, mediaInfo, headers });
}

async function analyze({ url, headers }) {
  const { mediaInfo } = await analyzePlaylist(url, headers);
  return mediaInfo;
}

async function prepareDownloadPlan({ url, selectedUrl, headers }) {
  return buildPlan({ url, selectedUrl, headers });
}

export const hlsProvider = {
  id: 'hls',
  label: 'HLS (.m3u8)',
  priority: 90,
  supportsQualitySelection: true,

  detect(url) {
    return detectSourceType(url) === 'hls' || isMdstrmUrl(url);
  },

  resolve,
  analyze,

  getFormats(media) {
    return buildFormats(media);
  },

  prepareDownloadPlan,

  async refresh({ currentPlan, refreshAttempt }) {
    return refreshHlsPlan({ currentPlan, refreshAttempt, prepareDownloadPlan });
  },

  async prepareDownload({ url, selectedUrl }) {
    return { downloadUrl: selectedUrl || url };
  },
};
