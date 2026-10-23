/**
 * Barrel do contrato de provider. A implementacao vive em ./base/.
 */

export {
  defineProvider,
  getProviderContractVersion,
  isLegacyProvider,
  isProviderV2,
} from './base/contract.js';
export { prepareProviderDownload, resolveProvider } from './base/index.js';
