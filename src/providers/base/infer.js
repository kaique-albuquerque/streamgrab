/**
 * Inferência de campos da resolução/plano a partir do shape legado do
 * provider (id/analyze/prepareDownload).
 */

import { createProviderCapabilities } from '../../core/download-plan.js';

export function inferResolutionKind(provider, analysis, url) {
  return String(
    analysis?.sourceType ||
    analysis?.kind ||
    provider?.id ||
    (typeof url === 'string' && url.includes('.m3u8') ? 'hls' : ''),
  );
}

export function inferMatchedBy(provider, url) {
  if (provider?.id === 'direct' && typeof url === 'string' && !/\.\w+(?:$|[?#])/.test(url)) {
    return 'content-type';
  }
  return 'url';
}

export function inferPlanKind(provider, prepared, analysis) {
  if (prepared?.strategy === 'mux') return 'mux';
  const providerId = String(provider?.id || '');
  if (providerId === 'ytdlp') return 'ytdlp';
  const kind = String(analysis?.sourceType || analysis?.kind || providerId || 'direct');
  if (['direct', 'hls', 'dash', 'mux', 'ytdlp'].includes(kind)) return kind;
  return 'direct';
}

export function inferSource(provider, prepared, params) {
  if (prepared?.strategy === 'mux') {
    return {
      videoUrl: String(prepared.videoUrl || ''),
      audioUrl: String(prepared.audioUrl || ''),
      formatId: String(prepared.formatId || ''),
    };
  }

  const downloadUrl = String(prepared?.downloadUrl || params.selectedUrl || params.url || '');
  if (provider?.id === 'hls') return { manifestUrl: downloadUrl };
  if (provider?.id === 'dash') return { manifestUrl: downloadUrl };
  if (provider?.id === 'ytdlp') return { url: downloadUrl, formatId: String(prepared?.formatId || '') };
  return { url: downloadUrl };
}

export function inferPreferredTransport(provider, prepared, analysis, options = {}) {
  if (prepared?.strategy === 'mux') return 'ytdlp';
  if (provider?.id === 'hls' || analysis?.sourceType === 'hls') return 'ffmpeg';
  if (provider?.id === 'dash' || analysis?.sourceType === 'dash') return 'ffmpeg';
  if (provider?.id === 'direct' && options.turbo) return 'range';
  return undefined;
}

export function inferCapabilities(provider) {
  return createProviderCapabilities({
    qualitySelection: Boolean(provider?.supportsQualitySelection),
    rangeDownload: provider?.id === 'direct',
  });
}

export function normalizeSelectedFormat(params = {}) {
  if (!params.selectedUrl && !params.formatId) return null;
  return {
    url: String(params.selectedUrl || ''),
    formatId: String(params.formatId || ''),
  };
}
