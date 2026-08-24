import { isValidM3u8Url } from '../../utils.js';

const DIRECT_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.ts'];

function toAbsoluteUrl(candidateUrl, baseUrl) {
  try {
    return new URL(candidateUrl, baseUrl).toString();
  } catch {
    return '';
  }
}

function pushCandidate(list, candidate) {
  if (!candidate.candidateUrl) return;
  if (list.some((item) => item.candidateUrl === candidate.candidateUrl && item.mediaType === candidate.mediaType)) return;
  list.push(candidate);
}

function classifyAbsoluteUrl(candidateUrl) {
  const lower = String(candidateUrl || '').toLowerCase();
  if (isValidM3u8Url(lower) || lower.includes('.m3u8')) return 'hls';
  if (lower.includes('.mpd')) return 'dash';
  if (DIRECT_EXTENSIONS.some((ext) => lower.includes(ext))) return 'direct';
  return '';
}

export function discoverManifestCandidates(html, baseUrl) {
  const text = String(html || '');
  const candidates = [];

  const absolutePattern = /https?:\/\/[^"'`\s<>]+/gi;
  for (const match of text.matchAll(absolutePattern)) {
    const candidateUrl = match[0];
    const mediaType = classifyAbsoluteUrl(candidateUrl);
    if (!mediaType) continue;
    pushCandidate(candidates, {
      candidateUrl,
      mediaType,
      confidence: mediaType === 'direct' ? 'medium' : 'high',
      evidence: 'absolute-url',
    });
  }

  const relativePattern = /(?:src|href|file)\s*[:=]\s*["']([^"'<>]+\.(?:m3u8|mpd|mp4|webm|mkv|mov|m4v|ts)(?:\?[^"'<>]*)?)["']/gi;
  for (const match of text.matchAll(relativePattern)) {
    const candidateUrl = toAbsoluteUrl(match[1], baseUrl);
    const mediaType = classifyAbsoluteUrl(candidateUrl);
    if (!mediaType) continue;
    pushCandidate(candidates, {
      candidateUrl,
      mediaType,
      confidence: 'high',
      evidence: 'html-attribute',
    });
  }

  const quotedPattern = /["']([^"'<>]+\.(?:m3u8|mpd|mp4|webm|mkv|mov|m4v|ts)(?:\?[^"'<>]*)?)["']/gi;
  for (const match of text.matchAll(quotedPattern)) {
    const candidateUrl = toAbsoluteUrl(match[1], baseUrl);
    const mediaType = classifyAbsoluteUrl(candidateUrl);
    if (!mediaType) continue;
    pushCandidate(candidates, {
      candidateUrl,
      mediaType,
      confidence: mediaType === 'direct' ? 'medium' : 'medium',
      evidence: 'quoted-url',
    });
  }

  return candidates;
}

export default { discoverManifestCandidates };
