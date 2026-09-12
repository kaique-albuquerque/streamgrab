/**
 * DASH segments — helper utilities and support inspection.
 */

import fs from 'node:fs';
import path from 'node:path';

export function createUnsupportedResult(reasonCode, reason) {
  return {
    ok: false,
    code: 'MANIFEST_UNSUPPORTED',
    reasonCode,
    error: reason,
    fallback: 'ffmpeg',
  };
}

export function resolveAbsolute(url, baseUrl) {
  return new URL(url, baseUrl).toString();
}

export async function fetchBinary(url, headers, signal) {
  const res = await fetch(url, { headers, redirect: 'follow', signal });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadRepresentation(rep, baseUrl, headers, workDir, prefix, signal) {
  const absolute = resolveAbsolute(rep.baseUrl, baseUrl);
  const ext = path.extname(new URL(absolute).pathname) || '.mp4';
  const local = path.join(workDir, `${prefix}${ext}`);
  const data = await fetchBinary(absolute, headers, signal);
  fs.writeFileSync(local, data);
  return { localPath: local, bytes: data.length, absoluteUrl: absolute };
}

export function inspectDashSegmentSupport(parsed) {
  if (!parsed || parsed.kind !== 'dash') {
    return createUnsupportedResult('not-dash', 'Manifesto nao parece ser DASH.');
  }
  if (String(parsed.type || '') !== 'static') {
    return createUnsupportedResult('dash-live-unsupported', 'Somente MPD static e suportado nesta fase.');
  }
  if (!Array.isArray(parsed.videoRepresentations) || parsed.videoRepresentations.length === 0) {
    return createUnsupportedResult('dash-no-video', 'Manifesto DASH sem representacao de video suportada.');
  }
  const unsupported = parsed.representations.find((rep) => !rep.baseUrl || !rep.segmentBase);
  if (unsupported) {
    return createUnsupportedResult(
      'dash-template-unsupported',
      'Somente MPD com BaseURL + SegmentBase e suportado nesta fase.'
    );
  }
  return { ok: true };
}
