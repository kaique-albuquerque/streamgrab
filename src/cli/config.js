/**
 * Configuracao do CLI: config legado, settings store (P7), headers de
 * providers e parsers de flags. A implementacao vive em ./config/.
 */

export { loadConfig, mergeConfigWithSettings } from './config/load.js';
export {
  isHotmartUrl,
  hasHotmartFlag,
  getHotmartEmbedHeaders,
  applyProviderHeaders,
} from './config/hotmart.js';
export {
  parseCliHeaders,
  parseCliAuth,
  isGoogleVideoPlaybackUrl,
  collectDevtoolsHeaders,
} from './config/cli-auth.js';
