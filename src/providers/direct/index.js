/**
 * P3/P5 - Provider de midia direta (src/providers/direct/index.js)
 *
 * Arquivos de midia servidos por URL direta (extensoes conhecidas, URLs de
 * playback do Google, ou Content-Type de midia detectado por probe).
 *
 * Este provider e o primeiro migrado para o contrato V2 nativo, mas mantem
 * analyze() e prepareDownload() legados para compatibilidade.
 */

import { detectSourceType } from '../../utils.js';
import { createMediaInfo } from '../../core/models.js';
import { createProviderResolution, createDownloadPlan } from '../../core/download-plan.js';
import { createRequestContext } from '../../core/request-context.js';

function createDirectMediaInfo() {
  return createMediaInfo({
    kind: 'direct',
    sourceType: 'direct',
    provider: 'direct',
    title: '',
    variants: [],
  });
}

export const directProvider = {
  id: 'direct',
  label: 'Midia direta',
  priority: 70,
  supportsQualitySelection: false,

  detect(url) {
    return detectSourceType(url) === 'direct';
  },

  async resolve({ url, headers }) {
    return createProviderResolution({
      contractVersion: 2,
      providerId: 'direct',
      kind: 'direct',
      sourceUrl: String(url || ''),
      matchedBy: 'url',
      confidence: 'high',
      pageUrl: String(url || ''),
      canonicalUrl: String(url || ''),
      mediaUrl: String(url || ''),
      mediaInfo: createDirectMediaInfo(),
      requestContext: createRequestContext({ headers }),
      capabilities: {
        qualitySelection: false,
        rangeDownload: true,
      },
      strategyHints: {
        preferredTransport: 'http',
      },
      diagnostics: {},
    });
  },

  async analyze() {
    return createDirectMediaInfo();
  },

  getFormats() {
    return [];
  },

  async prepareDownloadPlan({ url, headers, options }) {
    return createDownloadPlan({
      contractVersion: 2,
      kind: 'direct',
      source: { url: String(url || '') },
      requestContext: createRequestContext({ headers }),
      capabilities: {
        qualitySelection: false,
        rangeDownload: true,
      },
      strategyHints: {
        preferredTransport: options?.turbo ? 'range' : 'http',
      },
    });
  },

  async prepareDownload({ url }) {
    return { downloadUrl: url };
  },
};
