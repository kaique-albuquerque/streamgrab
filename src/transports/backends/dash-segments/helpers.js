/**
 * DASH segments — helper utilities and support inspection.
 */

import fs from 'node:fs';
import path from 'node:path';

import { dashMediaSegmentUrls } from '../../../dash.js';

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

/**
 * Baixa o init + media segment de uma representacao com SegmentTemplate.
 * Retorna { initPath, mediaPath, bytes, absoluteUrl } — o init e o media sao
 * arquivos distintos e precisam ser unidos antes de virar arquivo final.
 */
export async function downloadTemplateRepresentation(rep, headers, workDir, prefix, signal, totalSeconds = 0) {
  const tpl = rep.segmentTemplate;
  const ext = path.extname(new URL(tpl.media).pathname) || '.mp4';
  const initLocal = path.join(workDir, `${prefix}-init${ext}`);

  // Um unico segmento (Number fixo) ou a lista completa (1..N) quando o MPD
  // declara duration/timescale.
  const urls = dashMediaSegmentUrls(tpl, totalSeconds);
  const effective = urls.length > 0 ? urls : [tpl.media];

  const initData = await fetchBinary(tpl.initialization, headers, signal);
  fs.writeFileSync(initLocal, initData);

  const parts = [];
  let bytes = initData.length;
  for (let i = 0; i < effective.length; i++) {
    const data = await fetchBinary(effective[i], headers, signal);
    const partLocal = path.join(workDir, `${prefix}-seg${String(i + 1).padStart(6, '0')}${ext}`);
    fs.writeFileSync(partLocal, data);
    parts.push(partLocal);
    bytes += data.length;
  }

  // So os segmentos de media (sem init) — o runner junta init + media.
  const mediaLocal = path.join(workDir, `${prefix}${ext}`);
  fs.writeFileSync(mediaLocal, Buffer.concat(parts.map((p) => fs.readFileSync(p))));

  return {
    initPath: initLocal,
    mediaPath: mediaLocal,
    segmentCount: effective.length,
    bytes,
    absoluteUrl: effective[0],
  };
}

/**
 * Heuristica para detectar um init segment DASH: `ftyp` + `moov` e nenhum
 * `mdat`. Usada para decidir se o arquivo baixado e um init (que precisa ser
 * unido ao media antes de virar arquivo final).
 */
export function isInitSegment(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (buffer.toString('latin1', 4, 8) !== 'ftyp') return false;
  if (!buffer.includes(Buffer.from('moov'))) return false;
  return !buffer.includes(Buffer.from('mdat'));
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
  // Cada representacao precisa de init + media: via SegmentTemplate
  // (init-$RepresentationID$.mp4 + $Number%09d$.mp4) ou BaseURL + SegmentBase.
  const unsupported = parsed.representations.find((rep) => {
    const tpl = rep.segmentTemplate;
    if (tpl && tpl.initialization && tpl.media) return false;
    return !rep.baseUrl || !rep.segmentBase;
  });
  if (unsupported) {
    return createUnsupportedResult(
      'dash-template-unsupported',
      'Somente MPD com SegmentTemplate (init+media) ou BaseURL + SegmentBase e suportado nesta fase.'
    );
  }
  return { ok: true };
}
