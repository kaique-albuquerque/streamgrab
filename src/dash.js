import { normalizeHeaders, DEFAULT_USER_AGENT } from './utils.js';

function stripTag(value) {
  return String(value || '').replace(/<[^>]+>/g, '').trim();
}

function parseAttributes(tag) {
  const attrs = {};
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g;
  let match;
  while ((match = re.exec(tag))) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function resolveContentType(adaptationAttrs, mimeType = '') {
  const contentType = adaptationAttrs.contentType || '';
  if (contentType) return contentType;
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'unknown';
}

function parseSegmentBase(repBlock) {
  const segmentBaseTag = repBlock.match(/<SegmentBase\b([^>]*)>/i);
  if (!segmentBaseTag) return null;
  const attrs = parseAttributes(segmentBaseTag[0]);
  const initTag = repBlock.match(/<Initialization\b([^>]*)\/>/i);
  const initAttrs = initTag ? parseAttributes(initTag[0]) : {};
  return {
    indexRange: attrs.indexRange || '',
    initializationRange: initAttrs.range || '',
  };
}

export function parseDashManifest(text, baseUrl = '') {
  const representations = [];
  const adaptationBlocks = String(text || '').match(/<AdaptationSet\b[\s\S]*?<\/AdaptationSet>/gi) || [];
  const mpdTag = String(text || '').match(/<MPD\b[^>]*>/i)?.[0] || '';
  const mpdAttrs = parseAttributes(mpdTag);

  for (const block of adaptationBlocks) {
    const adaptationTag = block.match(/<AdaptationSet\b[^>]*>/i)?.[0] || '';
    const adaptationAttrs = parseAttributes(adaptationTag);
    const mimeType = adaptationAttrs.mimeType || '';
    const contentType = resolveContentType(adaptationAttrs, mimeType);
    const adaptationBase = stripTag(block.match(/<AdaptationSet\b[\s\S]*?<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/i)?.[1] || '');
    const repBlocks = block.match(/<Representation\b[\s\S]*?<\/Representation>/gi) || [];

    for (const repBlock of repBlocks) {
      const repTag = repBlock.match(/<Representation\b[^>]*>/i)?.[0] || '';
      const repAttrs = parseAttributes(repTag);
      const bandwidth = Number(repAttrs.bandwidth) || 0;
      const width = Number(repAttrs.width) || 0;
      const height = Number(repAttrs.height) || 0;
      const codecs = repAttrs.codecs || adaptationAttrs.codecs || '';
      const localBase = stripTag(repBlock.match(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/i)?.[1] || '');
      const segmentBase = parseSegmentBase(repBlock);

      representations.push({
        id: repAttrs.id || '',
        contentType,
        mimeType,
        codecs,
        bandwidth,
        width,
        height,
        resolution: width && height ? `${width}x${height}` : '',
        baseUrl: localBase || adaptationBase,
        segmentBase,
      });
    }
  }

  const videoRepresentations = representations
    .filter((rep) => rep.contentType === 'video')
    .sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
  const audioRepresentations = representations
    .filter((rep) => rep.contentType === 'audio')
    .sort((a, b) => b.bandwidth - a.bandwidth);

  return {
    kind: 'dash',
    baseUrl,
    type: String(mpdAttrs.type || '').toLowerCase(),
    profiles: String(mpdAttrs.profiles || ''),
    representations,
    videoRepresentations,
    audioRepresentations,
  };
}

export async function fetchDashManifestText(url, headers = {}, timeoutMs = 30000) {
  // P11.1: mesmo padrao do fetch HLS — UA default para evitar 403 de CDN/WAF.
  const requestHeaders = normalizeHeaders({ 'User-Agent': DEFAULT_USER_AGENT, ...headers });
  const res = await fetch(url, {
    headers: requestHeaders,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
    err.status = res.status;
    throw err;
  }

  return { text: await res.text(), url: res.url || url };
}

export async function fetchDashManifest(url, headers = {}, timeoutMs = 30000) {
  const { text, url: finalUrl } = await fetchDashManifestText(url, headers, timeoutMs);
  return parseDashManifest(text, finalUrl);
}
