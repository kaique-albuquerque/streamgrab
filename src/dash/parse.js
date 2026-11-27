/**
 * Parser do MPD DASH e fetch do manifesto.
 *
 * A decomposicao em XML/segmentos esta em ./xml.js e ./template.js; este
 * arquivo mantem apenas a montagem das representacoes e o I/O do manifesto.
 */

import { normalizeHeaders, DEFAULT_USER_AGENT } from '../utils.js';
import {
  parseAttributes, resolveContentType, stripTag, parseIso8601Duration,
} from './xml.js';
import { parseSegmentTemplate } from './template.js';

export { resolveAbsolute, stripTag, parseAttributes, resolveContentType, parseIso8601Duration } from './xml.js';
export { fillTemplate, parseSegmentTemplate, dashMediaSegmentUrls } from './template.js';

/** Le o SegmentBase (indexRange + range do init) de uma Representation. */
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

/** Monta uma representacao a partir do bloco XML e do contexto do AdaptationSet. */
function buildRepresentation(repBlock, block, ctx) {
  const { adaptationAttrs, adaptationBase, adaptationTemplate, baseUrl, lang } = ctx;
  const repAttrs = parseAttributes(repBlock.match(/<Representation\b[^>]*>/i)?.[0] || '');
  const width = Number(repAttrs.width) || 0;
  const height = Number(repAttrs.height) || 0;
  const localBase = stripTag(repBlock.match(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/i)?.[1] || '');
  const resolvedBase = localBase || adaptationBase || baseUrl;

  // O SegmentTemplate da Representation tem precedencia; o do AdaptationSet
  // vale para todas (mas precisa dos placeholders resolvidos por id).
  const ownTemplate = parseSegmentTemplate(repBlock, repAttrs, resolvedBase);
  const segmentTemplate = ownTemplate
    || (adaptationTemplate ? parseSegmentTemplate(block, repAttrs, resolvedBase) : null);

  return {
    id: repAttrs.id || '',
    contentType: ctx.contentType,
    mimeType: ctx.mimeType,
    codecs: repAttrs.codecs || adaptationAttrs.codecs || '',
    bandwidth: Number(repAttrs.bandwidth) || 0,
    width,
    height,
    resolution: width && height ? `${width}x${height}` : '',
    baseUrl: localBase || adaptationBase,
    segmentBase: parseSegmentBase(repBlock),
    segmentTemplate,
    lang,
  };
}

/** Herda timescale/duration/startNumber do template do AdaptationSet. */
function inheritTemplate(segmentTemplate, inherited) {
  if (!segmentTemplate || !inherited) return;
  if (!segmentTemplate.timescale) segmentTemplate.timescale = inherited.timescale;
  if (!segmentTemplate.duration) segmentTemplate.duration = inherited.duration;
  if (!segmentTemplate.startNumber || segmentTemplate.startNumber === 1) {
    segmentTemplate.startNumber = inherited.startNumber || segmentTemplate.startNumber;
  }
}

export function parseDashManifest(text, baseUrl = '') {
  const representations = [];
  const adaptationBlocks = String(text || '').match(/<AdaptationSet\b[\s\S]*?<\/AdaptationSet>/gi) || [];
  const mpdAttrs = parseAttributes(String(text || '').match(/<MPD\b[^>]*>/i)?.[0] || '');

  for (const block of adaptationBlocks) {
    const adaptationAttrs = parseAttributes(block.match(/<AdaptationSet\b[^>]*>/i)?.[0] || '');
    const mimeType = adaptationAttrs.mimeType || '';
    const adaptationBase = stripTag(
      block.match(/<AdaptationSet\b[\s\S]*?<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/i)?.[1] || ''
    );
    const ctx = {
      adaptationAttrs,
      adaptationBase,
      adaptationTemplate: parseSegmentTemplate(block, {}, adaptationBase || baseUrl),
      baseUrl,
      contentType: resolveContentType(adaptationAttrs, mimeType),
      mimeType,
      lang: adaptationAttrs.lang || '',
    };

    const repBlocks = block.match(/<Representation\b[\s\S]*?(?:\/>|<\/Representation>)/gi) || [];
    for (const repBlock of repBlocks) {
      const rep = buildRepresentation(repBlock, block, ctx);
      inheritTemplate(rep.segmentTemplate, ctx.adaptationTemplate);
      representations.push(rep);
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
    durationSeconds: parseIso8601Duration(mpdAttrs.mediaPresentationDuration),
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