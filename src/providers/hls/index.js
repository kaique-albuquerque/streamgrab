/**
 * P3/P5 - Provider HLS normalizado (src/providers/hls/index.js)
 *
 * Envolve src/hls.js (fetch + parse de playlists) e reconhece URLs da Media
 * Stream/mdstrm como HLS.
 *
 * Mantem analyze()/prepareDownload() legados e adiciona resolve()/
 * prepareDownloadPlan() nativos do contrato V2.
 */

import { detectSourceType, DEFAULT_USER_AGENT } from '../../utils.js';
import { isMdstrmUrl, extractMdstrmVideoId, refreshMdstrmUrl } from '../../mdstrm.js';
import { fetchPlaylistText, parsePlaylistText } from '../../hls.js';
import { createMediaInfo, createFormat } from '../../core/models.js';
import { createProviderResolution, createDownloadPlan } from '../../core/download-plan.js';
import { createRequestContext } from '../../core/request-context.js';
import { checkHlsDrm } from './drm.js';

function createHlsRequestContext(headers = {}) {
  return createRequestContext({
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      ...(headers || {}),
    },
  });
}

function createHlsMediaInfo(parsed) {
  return {
    ...createMediaInfo({
      kind: parsed.kind,
      sourceType: 'hls',
      provider: 'hls',
      title: '',
      variants: parsed.variants,
    }),
    baseUrl: parsed.baseUrl || '',
  };
}

function supportsMdstrmRefresh(url) {
  return Boolean(extractMdstrmVideoId(url));
}

function resolveFreshVariantByPath(selectedUrl, variants = [], baseUrl = '') {
  let selectedPath = '';
  try {
    selectedPath = new URL(selectedUrl).pathname;
  } catch {
    return null;
  }

  for (const variant of variants) {
    const uri = variant?.uri || variant?.url;
    if (!uri) continue;
    try {
      const absolute = new URL(uri, baseUrl || selectedUrl).toString();
      if (new URL(absolute).pathname === selectedPath) return absolute;
    } catch {
      // ignora variante invalida
    }
  }
  return null;
}

export const hlsProvider = {
  id: 'hls',
  label: 'HLS (.m3u8)',
  priority: 90,
  supportsQualitySelection: true,

  detect(url) {
    return detectSourceType(url) === 'hls' || isMdstrmUrl(url);
  },

  async resolve({ url, headers }) {
    const { text, url: finalUrl } = await fetchPlaylistText(url, headers);
    checkHlsDrm(text);
    const parsed = parsePlaylistText(text, finalUrl || url);
    const mediaInfo = createHlsMediaInfo(parsed);

    return createProviderResolution({
      contractVersion: 2,
      providerId: 'hls',
      kind: 'hls',
      sourceUrl: String(url || ''),
      matchedBy: 'url',
      confidence: 'high',
      pageUrl: String(url || ''),
      canonicalUrl: String(finalUrl || url || ''),
      manifestUrl: String(finalUrl || url || ''),
      formats: this.getFormats(mediaInfo),
      mediaInfo,
      requestContext: createHlsRequestContext(headers),
      capabilities: {
        qualitySelection: true,
        segmentedDownload: true,
        refreshAccess: supportsMdstrmRefresh(url),
      },
      strategyHints: {
        preferredTransport: 'segments',
        preserveSelectedVariant: true,
      },
      diagnostics: {},
    });
  },

  async analyze({ url, headers }) {
    const { text, url: finalUrl } = await fetchPlaylistText(url, headers);
    checkHlsDrm(text);
    const parsed = parsePlaylistText(text, finalUrl || url);
    return createHlsMediaInfo(parsed);
  },

  getFormats(media) {
    return (media.variants || []).map((v, i) =>
      createFormat({
        formatId: `hls-${v.height || v.bandwidth || i + 1}`,
        url: v.uri,
        resolution: v.resolution,
        bandwidth: v.bandwidth,
        codecs: v.codecs,
        width: v.width,
        height: v.height,
        container: '',
        hasVideo: true,
        hasAudio: true,
      }),
    );
  },

  async prepareDownloadPlan({ url, selectedUrl, headers }) {
    return createDownloadPlan({
      contractVersion: 2,
      kind: 'hls',
      source: { manifestUrl: String(selectedUrl || url || '') },
      requestContext: createHlsRequestContext(headers),
      selectedFormat: selectedUrl ? { url: String(selectedUrl) } : null,
      capabilities: {
        qualitySelection: true,
        segmentedDownload: true,
        refreshAccess: supportsMdstrmRefresh(url),
      },
      strategyHints: {
        preferredTransport: 'segments',
        preserveSelectedVariant: true,
      },
      refreshState: {
        entryUrl: String(url || ''),
        selectedUrl: selectedUrl ? String(selectedUrl) : '',
      },
    });
  },

  async refresh({ currentPlan, refreshAttempt }) {
    if (Number(refreshAttempt || 0) >= 2) return null;

    const entryUrl = String(currentPlan?.refreshState?.entryUrl || currentPlan?.source?.manifestUrl || '');
    const selectedUrl = String(currentPlan?.refreshState?.selectedUrl || '');
    if (!supportsMdstrmRefresh(entryUrl) && !supportsMdstrmRefresh(selectedUrl)) return null;

    const refreshedEntryUrl = await refreshMdstrmUrl(entryUrl);
    let refreshedSelectedUrl = '';

    if (selectedUrl) {
      const analysis = await this.analyze({ url: refreshedEntryUrl });
      refreshedSelectedUrl = resolveFreshVariantByPath(selectedUrl, analysis.variants, analysis.baseUrl) || '';
    }

    return this.prepareDownloadPlan({
      url: refreshedEntryUrl,
      selectedUrl: refreshedSelectedUrl || undefined,
      headers: currentPlan?.requestContext?.headers || {},
    });
  },

  async prepareDownload({ url, selectedUrl }) {
    return { downloadUrl: selectedUrl || url };
  },
};
