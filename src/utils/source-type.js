/**
 * Identificação de hosts / tipos de fonte a partir da URL.
 */

import { isSocialMediaUrl } from './social.js';

const DIRECT_MEDIA_EXTENSIONS = new Set(['mp4', 'webm', 'mkv', 'mov', 'm4v', 'ts']);

export function isYouTubeUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

export function detectSourceType(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'unknown';
    if (isYouTubeUrl(value)) return 'youtube';
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname.toLowerCase();
    if (pathname.includes('.m3u8')) return 'hls';
    if (pathname.includes('.mpd')) return 'dash';
    if (host.includes('googlevideo.com') && pathname.includes('/videoplayback')) return 'direct';
    if (isSocialMediaUrl(value)) return 'social';
    const ext = pathname.match(/\.([a-z0-9]{1,5})$/i)?.[1] || '';
    if (DIRECT_MEDIA_EXTENSIONS.has(ext)) return 'direct';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function isSupportedMediaUrl(value) {
  return detectSourceType(value) !== 'unknown';
}
