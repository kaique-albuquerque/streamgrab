/** Capacidades/estratégias compartilhadas do provider HLS. */

import { extractMdstrmVideoId } from '../../mdstrm.js';

export function supportsMdstrmRefresh(url) {
  return Boolean(extractMdstrmVideoId(url));
}

export function hlsCapabilities(url) {
  return {
    qualitySelection: true,
    segmentedDownload: true,
    refreshAccess: supportsMdstrmRefresh(url),
  };
}

export function hlsStrategyHints() {
  return {
    preferredTransport: 'segments',
    preserveSelectedVariant: true,
  };
}
