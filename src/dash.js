import { normalizeHeaders, DEFAULT_USER_AGENT } from './utils.js';

function resolveAbsolute(url, baseUrl) {
  try {
    return new URL(url, baseUrl || undefined).toString();
  } catch {
    return String(url || '');
  }
}

function stripTag(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .trim();
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

/**
 * Substitui os identificadores de template do SegmentTemplate DASH.
 * `$Number%09d$` -> numero com zero-padding; `$RepresentationID$` -> id.
 */
function fillTemplate(template, { number, representationId }) {
  return String(template || '')
    .replace(/\$RepresentationID\$/g, String(representationId ?? ''))
    .replace(/\$Number(%[0-9]*d)?\$/g, (_, pad) => {
      const n = Number(number) || 1;
      if (!pad) return String(n);
      const width = Number((pad.match(/%0?(\d+)d/) || [])[1]) || 0;
      return width > 0 ? String(n).padStart(width, '0') : String(n);
    });
}

/**
 * Extrai o SegmentTemplate (do AdaptationSet ou da Representation) e deriva
 * os URLs de init/media. Retorna null quando nao ha template.
 */
function parseSegmentTemplate(block, repAttrs, baseUrl) {
  // A tag pode ser auto-fechada (`/>`) ou ter filhos (`>`); em ambos os casos
  // capturamos so os atributos, sem a `/` final.
  const tag = block.match(/<SegmentTemplate\b([^>]*)>/i)?.[1] || '';
  const attrs = parseAttributes(`<SegmentTemplate${tag.replace(/\/\s*$/, '')}>`);
  const media = attrs.media || '';
  const initialization = attrs.initialization || '';
  // Sem media/initialization o template so carrega heranca (timescale/duration)
  // e nao resolve URLs — ainda e um template valido.
  const hasTemplate = Object.keys(attrs).length > 0;
  if (!hasTemplate) return null;

  const representationId = repAttrs.id || '';
  const fill = (tpl, id, number) => fillTemplate(tpl, { number, representationId: id });
  const resolve = (tpl, id, number) => (tpl ? resolveAbsolute(fill(tpl, id, number), baseUrl) : '');
  const build = (id) => ({
    timescale: Number(attrs.timescale) || 0,
    duration: Number(attrs.duration) || 0,
    startNumber: Number(attrs.startNumber) || 1,
    hasTimescale: Object.hasOwn(attrs, 'timescale'),
    hasDuration: Object.hasOwn(attrs, 'duration'),
    initialization: resolve(initialization, id),
    media: resolve(media, id),
    mediaTemplate: media,
    initializationTemplate: initialization,
    representationId: id,
    baseUrl,
  });

  // Somente dados serializaveis: o Electron nao clona funcoes via IPC.
  return build(representationId);
}

/**
 * Lista as URLs de media de um SegmentTemplate (segmentos 1..N).
 *
 * Pura e serializavel (sem closures) — usada pelo backend de download e pelo
 * preview. Retorna [] quando nao ha `media` ou duration/timescale.
 *
 * @param {object} tpl - segmentTemplate do parser
 * @param {number} totalSeconds - duracao total do MPD
 * @param {number} [limit] - maximo de URLs (preview usa 1..N curto)
 * @returns {string[]}
 */
export function dashMediaSegmentUrls(tpl, totalSeconds, limit = Infinity) {
  if (!tpl || !tpl.media) return [];
  const segDur = tpl.timescale > 0 ? tpl.duration / tpl.timescale : 0;
  if (segDur <= 0) return [tpl.media];
  const count = Math.max(1, Math.ceil((Number(totalSeconds) || 0) / segDur));
  const urls = [];
  for (let i = 0; i < count; i++) {
    const filled = fillTemplate(tpl.mediaTemplate || tpl.media, {
      number: (tpl.startNumber || 1) + i,
      representationId: tpl.representationId || '',
    });
    urls.push(tpl.baseUrl ? resolveAbsolute(filled, tpl.baseUrl) : filled);
  }
  return urls.slice(0, limit);
}

const ISO8601_DURATION_RE =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

/**
 * Converte `mediaPresentationDuration` (ISO 8601, ex.: `PT1M2.5S`) em segundos.
 * Retorna 0 quando ausente ou invalido.
 */
export function parseIso8601Duration(value) {
  const text = String(value || '').trim();
  const match = ISO8601_DURATION_RE.exec(text);
  if (!match) return 0;

  const [, days, hours, minutes, seconds] = match;
  const secondsTotal =
    (Number(days) || 0) * 86400 + (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  return Number.isFinite(secondsTotal) ? secondsTotal : 0;
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
    const adaptationBase = stripTag(
      block.match(/<AdaptationSet\b[\s\S]*?<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/i)?.[1] || ''
    );
    // P12: extract language from AdaptationSet
    const lang = adaptationAttrs.lang || '';
    const repBlocks = block.match(/<Representation\b[\s\S]*?(?:\/>|<\/Representation>)/gi) || [];
    // SegmentTemplate pode estar no AdaptationSet (herdado por toda a
    // representacao) ou dentro da propria Representation.
    const adaptationTemplate = parseSegmentTemplate(block, {}, adaptationBase || baseUrl);

    for (const repBlock of repBlocks) {
      const repTag = repBlock.match(/<Representation\b[^>]*>/i)?.[0] || '';
      const repAttrs = parseAttributes(repTag);
      const bandwidth = Number(repAttrs.bandwidth) || 0;
      const width = Number(repAttrs.width) || 0;
      const height = Number(repAttrs.height) || 0;
      const codecs = repAttrs.codecs || adaptationAttrs.codecs || '';
      const localBase = stripTag(repBlock.match(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/i)?.[1] || '');
      const segmentBase = parseSegmentBase(repBlock);
      const resolvedBase = localBase || adaptationBase || baseUrl;
      // O SegmentTemplate da Representation tem precedencia; o do AdaptationSet
      // vale para todas (mas precisa dos placeholders resolvidos por id).
      const ownTemplate = parseSegmentTemplate(repBlock, repAttrs, resolvedBase);
      const segmentTemplate = ownTemplate
        || (adaptationTemplate ? parseSegmentTemplate(block, repAttrs, resolvedBase) : null);
      // `timescale`/`duration` podem vir so no SegmentTemplate do AdaptationSet
      // (sao herdados por toda representacao), mesmo quando a Representation
      // tem o seu proprio template (so com media/initialization).
      if (segmentTemplate && adaptationTemplate) {
        if (!segmentTemplate.timescale) segmentTemplate.timescale = adaptationTemplate.timescale;
        if (!segmentTemplate.duration) segmentTemplate.duration = adaptationTemplate.duration;
        if (!segmentTemplate.startNumber || segmentTemplate.startNumber === 1) {
          segmentTemplate.startNumber = adaptationTemplate.startNumber || segmentTemplate.startNumber;
        }
      }

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
        segmentTemplate,
        lang,
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
