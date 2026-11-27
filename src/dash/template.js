/**
 * SegmentTemplate DASH —解析 de `media`/`initialization` e listagem de URLs.
 *
 * O template pode estar no AdaptationSet (herdado) ou na Representation, e
 * usa placeholders `$RepresentationID$` / `$Number%09d$`. O objeto devolvido
 * e somente dados serializaveis: o Electron nao clona funcoes via IPC.
 */

import { parseAttributes, resolveAbsolute } from './xml.js';

/**
 * Substitui os identificadores de template do SegmentTemplate DASH.
 * `$Number%09d$` -> numero com zero-padding; `$RepresentationID$` -> id.
 */
export function fillTemplate(template, { number, representationId } = {}) {
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
export function parseSegmentTemplate(block, repAttrs = {}, baseUrl = '') {
  // A tag pode ser auto-fechada (`/>`) ou ter filhos (`>`); em ambos os casos
  // capturamos so os atributos, sem a `/` final.
  const tag = block.match(/<SegmentTemplate\b([^>]*)>/i)?.[1] || '';
  const attrs = parseAttributes(`<SegmentTemplate${tag.replace(/\/\s*$/, '')}>`);
  // Sem nenhum atributo nao ha template; sem media/initialization ele so
  // carrega heranca (timescale/duration) e nao resolve URLs.
  if (Object.keys(attrs).length === 0) return null;

  const media = attrs.media || '';
  const initialization = attrs.initialization || '';
  const representationId = repAttrs.id || '';
  const fill = (tpl, id, number) => fillTemplate(tpl, { number, representationId: id });
  const resolve = (tpl, id, number) => (tpl ? resolveAbsolute(fill(tpl, id, number), baseUrl) : '');

  return {
    timescale: Number(attrs.timescale) || 0,
    duration: Number(attrs.duration) || 0,
    startNumber: Number(attrs.startNumber) || 1,
    hasTimescale: Object.hasOwn(attrs, 'timescale'),
    hasDuration: Object.hasOwn(attrs, 'duration'),
    initialization: resolve(initialization, representationId),
    media: resolve(media, representationId),
    mediaTemplate: media,
    initializationTemplate: initialization,
    representationId,
    baseUrl,
  };
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