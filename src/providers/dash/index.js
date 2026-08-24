/**
 * P3/P5 - Provider DASH normalizado (src/providers/dash/index.js)
 *
 * Envolve src/dash.js (fetch + parse de MPD) e detecta DRM
 * (<ContentProtection>) com erro claro, sem contornar Widevine/PlayReady.
 *
 * Mantem analyze()/prepareDownload() legados e adiciona resolve()/
 * prepareDownloadPlan() nativos do contrato V2.
 */

import { detectSourceType, DEFAULT_USER_AGENT } from '../../utils.js';
import { fetchDashManifestText, parseDashManifest } from '../../dash.js';
import { createMediaInfo, createFormat } from '../../core/models.js';
import { createProviderResolution, createDownloadPlan } from '../../core/download-plan.js';
import { createRequestContext } from '../../core/request-context.js';
import { checkDashDrm } from './drm.js';

function createDashRequestContext(headers = {}) {
  return createRequestContext({
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      ...(headers || {}),
    },
  });
}

function createDashMediaInfo(parsed) {
  return {
    ...createMediaInfo({
      kind: 'dash',
      sourceType: 'dash',
      provider: 'dash',
      title: '',
      variants: [],
    }),
    baseUrl: parsed.baseUrl || '',
    representations: parsed.representations,
    videoRepresentations: parsed.videoRepresentations,
  };
}

export const dashProvider = {
  id: 'dash',
  label: 'DASH (.mpd)',
  priority: 80,
  supportsQualitySelection: false,

  detect(url) {
    return detectSourceType(url) === 'dash';
  },

  async resolve({ url, headers }) {
    const { text, url: finalUrl } = await fetchDashManifestText(url, headers);
    checkDashDrm(text);
    const parsed = parseDashManifest(text, finalUrl || url);
    const mediaInfo = createDashMediaInfo(parsed);

    return createProviderResolution({
      contractVersion: 2,
      providerId: 'dash',
      kind: 'dash',
      sourceUrl: String(url || ''),
      matchedBy: 'url',
      confidence: 'high',
      pageUrl: String(url || ''),
      canonicalUrl: String(finalUrl || url || ''),
      manifestUrl: String(finalUrl || url || ''),
      formats: this.getFormats(mediaInfo),
      mediaInfo,
      requestContext: createDashRequestContext(headers),
      capabilities: {
        qualitySelection: false,
        segmentedDownload: true,
      },
      strategyHints: {
        preferredTransport: 'segments',
      },
      diagnostics: {},
    });
  },

  async analyze({ url, headers }) {
    const { text, url: finalUrl } = await fetchDashManifestText(url, headers);
    checkDashDrm(text);
    const parsed = parseDashManifest(text, finalUrl || url);
    return createDashMediaInfo(parsed);
  },

  getFormats(media) {
    return (media.videoRepresentations || []).map((r) =>
      createFormat({
        formatId: String(r.id || `dash-${r.height || r.bandwidth || 'video'}`),
        url: r.baseUrl,
        resolution: r.resolution,
        bandwidth: r.bandwidth,
        codecs: r.codecs,
        width: r.width,
        height: r.height,
        container: 'mp4',
        hasVideo: true,
        hasAudio: false,
      }),
    );
  },

  async prepareDownloadPlan({ url, headers }) {
    return createDownloadPlan({
      contractVersion: 2,
      kind: 'dash',
      source: { manifestUrl: String(url || '') },
      requestContext: createDashRequestContext(headers),
      capabilities: {
        qualitySelection: false,
        segmentedDownload: true,
      },
      strategyHints: {
        preferredTransport: 'segments',
      },
    });
  },

  async prepareDownload({ url }) {
    return { downloadUrl: url };
  },
};
