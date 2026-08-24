import { createMediaInfo } from '../../core/models.js';
import { createProviderResolution, createDownloadPlan } from '../../core/download-plan.js';
import { createRequestContext } from '../../core/request-context.js';
import { analyzeGenericPage } from './page-analyzer.js';

function bestCandidate(analysis) {
  return analysis.candidates[0] || null;
}

function mediaInfoForCandidate(candidate, finalUrl) {
  return createMediaInfo({
    kind: candidate.mediaType,
    sourceType: candidate.mediaType,
    provider: 'generic',
    title: '',
    pageUrl: finalUrl,
    variants: [],
  });
}

function strategyHintsFor(candidate) {
  if (candidate.mediaType === 'hls' || candidate.mediaType === 'dash') {
    return { preferredTransport: 'ffmpeg' };
  }
  return { preferredTransport: 'http' };
}

function capabilitiesFor(candidate) {
  return {
    qualitySelection: false,
    rangeDownload: candidate.mediaType === 'direct',
    segmentedDownload: false,
  };
}

export const genericProvider = {
  id: 'generic',
  label: 'Generic HTML',
  priority: 10,
  supportsQualitySelection: false,

  detect() {
    return false;
  },

  async resolve({ url, headers }) {
    const analysis = await analyzeGenericPage(url, headers);
    const candidate = bestCandidate(analysis);
    if (!candidate || candidate.confidence === 'low') {
      const err = new Error('Pagina nao revelou midia suportada com confianca suficiente.');
      err.code = 'UNSUPPORTED_SOURCE';
      throw err;
    }

    const requestContext = createRequestContext({
      headers,
      referer: analysis.finalUrl,
      origin: analysis.origin,
    });

    return createProviderResolution({
      contractVersion: 2,
      providerId: 'generic',
      kind: candidate.mediaType,
      sourceUrl: String(url || ''),
      matchedBy: candidate.evidence === 'html-attribute' ? 'html' : 'fallback',
      confidence: candidate.confidence,
      pageUrl: String(url || ''),
      canonicalUrl: analysis.finalUrl,
      manifestUrl: candidate.mediaType === 'hls' || candidate.mediaType === 'dash' ? candidate.candidateUrl : '',
      mediaUrl: candidate.mediaType === 'direct' ? candidate.candidateUrl : '',
      mediaInfo: mediaInfoForCandidate(candidate, analysis.finalUrl),
      requestContext,
      capabilities: capabilitiesFor(candidate),
      strategyHints: strategyHintsFor(candidate),
      diagnostics: {
        evidence: candidate.evidence,
        candidatesFound: analysis.candidates.length,
        players: analysis.players.map((item) => item.player),
      },
    });
  },

  async analyze({ url, headers }) {
    const resolution = await this.resolve({ url, headers });
    return resolution.mediaInfo;
  },

  getFormats() {
    return [];
  },

  async prepareDownloadPlan({ url, headers, analysis, selectedUrl }) {
    const kind = String(analysis?.sourceType || analysis?.kind || '');
    const targetUrl = String(selectedUrl || analysis?.pageUrl || url || '');
    const candidateKind = kind === 'hls' || kind === 'dash' || kind === 'direct' ? kind : 'direct';
    const requestContext = createRequestContext({ headers, referer: url, origin: new URL(url).origin });

    return createDownloadPlan({
      contractVersion: 2,
      kind: candidateKind,
      source: candidateKind === 'direct' ? { url: targetUrl } : { manifestUrl: targetUrl },
      requestContext,
      capabilities: capabilitiesFor({ mediaType: candidateKind }),
      strategyHints: strategyHintsFor({ mediaType: candidateKind }),
    });
  },
};

export default genericProvider;
