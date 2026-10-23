import { createRequestContext } from '../../request-context.js';
import { isValidDownloadPlan } from '../../download-plan.js';

function planSourceUrl(source = {}) {
  return String(source.manifestUrl || source.url || '');
}

function toLegacyPrepared(plan) {
  const kind = String(plan?.kind || '');
  const source = plan?.source || {};

  if (kind === 'mux') {
    return {
      strategy: 'mux',
      videoUrl: String(source.videoUrl || ''),
      audioUrl: String(source.audioUrl || ''),
      formatId: String(source.formatId || ''),
      chosenFormat: plan.selectedFormat || null,
      totalBytes: Number(source.totalBytes || 0) || 0,
      durationMs: Number(source.durationMs || 0) || 0,
      _requestContext: plan.requestContext,
      _downloadPlan: plan,
    };
  }

  return {
    strategy: 'single',
    downloadUrl: planSourceUrl(source),
    formatId: String(source.formatId || ''),
    chosenFormat: plan.selectedFormat || null,
    totalBytes: Number(source.totalBytes || 0) || 0,
    durationMs: Number(source.durationMs || 0) || 0,
    _requestContext: plan.requestContext,
    _downloadPlan: plan,
  };
}

export function normalizePreparedDownload(prepared) {
  if (isValidDownloadPlan(prepared)) {
    return toLegacyPrepared(prepared);
  }
  return prepared;
}

export function headersFromRequestContext(requestContext = {}) {
  const context = createRequestContext(requestContext);
  const headers = { ...context.headers };
  if (context.referer && !Object.hasOwn(headers, 'Referer')) headers.Referer = context.referer;
  if (context.origin && !Object.hasOwn(headers, 'Origin')) headers.Origin = context.origin;
  if (context.userAgent && !Object.hasOwn(headers, 'User-Agent')) headers['User-Agent'] = context.userAgent;
  return headers;
}

export function isRefreshableFailure(error) {
  const code = String(error?.code || '');
  return code === 'FORBIDDEN_ERROR' || code === 'EXPIRED_URL' || code === 'EXPIRED_URL_ERROR';
}
