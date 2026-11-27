/**
 * DASH — barrel publico (strangler).
 *
 * Mantem a API historica de `src/dash.js` (parseDashManifest,
 * fetchDashManifest, fetchDashManifestText, parseIso8601Duration,
 * dashMediaSegmentUrls) e delega a implementacao para ./dash/:
 *  - xml.js      → helpers XML/MPD puros (atributos, tags, ISO 8601)
 *  - template.js → SegmentTemplate (init/media, listagem de URLs)
 *  - parse.js    → montagem das representacoes + I/O do manifesto
 */

export {
  parseDashManifest,
  fetchDashManifest,
  fetchDashManifestText,
  resolveAbsolute,
  stripTag,
  parseAttributes,
  resolveContentType,
} from './dash/parse.js';
export { parseIso8601Duration } from './dash/xml.js';
export { fillTemplate, parseSegmentTemplate, dashMediaSegmentUrls } from './dash/template.js';