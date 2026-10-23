/** DownloadPlan: criação e validação. */

import { createRequestContext, isValidRequestContext } from '../request-context.js';
import { DOWNLOAD_PLAN_KINDS } from './constants.js';
import { createProviderCapabilities, createStrategyHints } from './capabilities.js';
import { isPlainObject, normalizeOptionalObject } from './validation.js';

export function createDownloadPlan(input = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError('createDownloadPlan: entrada deve ser um objeto');
  }

  const kind = String(input.kind || '');
  if (!DOWNLOAD_PLAN_KINDS.includes(kind)) {
    throw new TypeError(`createDownloadPlan: kind invalido "${kind}"`);
  }
  if (!isPlainObject(input.source)) {
    throw new TypeError('createDownloadPlan: source e obrigatorio e deve ser um objeto');
  }

  return {
    contractVersion: input.contractVersion === 2 ? 2 : undefined,
    kind,
    source: { ...input.source },
    requestContext: createRequestContext(input.requestContext || {}),
    selectedFormat: normalizeOptionalObject(
      input.selectedFormat,
      'createDownloadPlan: selectedFormat deve ser um objeto ou null',
    ),
    capabilities: createProviderCapabilities(input.capabilities || {}),
    strategyHints: createStrategyHints(input.strategyHints || {}),
    output: normalizeOptionalObject(input.output, 'createDownloadPlan: output deve ser um objeto ou null'),
    providerState: normalizeOptionalObject(
      input.providerState,
      'createDownloadPlan: providerState deve ser um objeto ou null',
    ),
    refreshState: normalizeOptionalObject(
      input.refreshState,
      'createDownloadPlan: refreshState deve ser um objeto ou null',
    ),
  };
}

export function isValidDownloadPlan(value) {
  if (!isPlainObject(value)) return false;
  if (!DOWNLOAD_PLAN_KINDS.includes(value.kind)) return false;
  if (!isPlainObject(value.source)) return false;
  if (!isValidRequestContext(value.requestContext)) return false;
  if (!isPlainObject(value.capabilities)) return false;
  if (!isPlainObject(value.strategyHints)) return false;
  if (!(value.selectedFormat === null || value.selectedFormat === undefined || isPlainObject(value.selectedFormat))) return false;
  if (!(value.output === null || value.output === undefined || isPlainObject(value.output))) return false;
  if (!(value.providerState === null || value.providerState === undefined || isPlainObject(value.providerState))) return false;
  if (!(value.refreshState === null || value.refreshState === undefined || isPlainObject(value.refreshState))) return false;
  return true;
}
