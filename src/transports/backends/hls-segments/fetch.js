/**
 * HLS segments — binary fetch and path helpers.
 */

import path from 'node:path';
import { extForUri } from '../../curl/index.js';

export async function fetchBinary(url, headers, signal) {
  const res = await fetch(url, { headers, redirect: 'follow', signal });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf, finalUrl: res.url || url };
}

export function safePathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

export function segmentRepresentationId(preferredVariantPath, mediaBase) {
  return preferredVariantPath || safePathname(mediaBase) || 'main';
}

export function localSegmentPath(workDir, index, uri, fallbackExt) {
  return path.join(workDir, `seg_${String(index).padStart(5, '0')}.${extForUri(uri, fallbackExt)}`);
}
