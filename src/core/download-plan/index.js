/** API pública do pacote download-plan (barrel interno). */

export {
  DOWNLOAD_PLAN_KINDS,
  PREFERRED_TRANSPORTS,
  PROVIDER_RESOLUTION_CONFIDENCE,
  PROVIDER_RESOLUTION_MATCHERS,
} from './constants.js';
export { createProviderCapabilities, createStrategyHints } from './capabilities.js';
export { createProviderResolution, isValidProviderResolution } from './resolution.js';
export { createDownloadPlan, isValidDownloadPlan } from './plan.js';
