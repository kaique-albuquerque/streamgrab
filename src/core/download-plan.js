/**
 * Modelos normalizados de ProviderResolution/DownloadPlan da Provider V2.
 *
 * Esta etapa nao muda o runtime legado; apenas oferece contratos e helpers
 * puros para a migracao incremental descrita na arquitetura.
 *
 * Implementacao em ./download-plan/:
 *  - constants.js    → listas aceitas (kinds, matchers, transports)
 *  - validation.js   → helpers de objeto
 *  - capabilities.js → createProviderCapabilities/createStrategyHints
 *  - resolution.js   → createProviderResolution/isValidProviderResolution
 *  - plan.js         → createDownloadPlan/isValidDownloadPlan
 */

export {
  DOWNLOAD_PLAN_KINDS,
  PREFERRED_TRANSPORTS,
  PROVIDER_RESOLUTION_CONFIDENCE,
  PROVIDER_RESOLUTION_MATCHERS,
} from './download-plan/constants.js';
export { createProviderCapabilities, createStrategyHints } from './download-plan/capabilities.js';
export { createProviderResolution, isValidProviderResolution } from './download-plan/resolution.js';
export { createDownloadPlan, isValidDownloadPlan } from './download-plan/plan.js';
