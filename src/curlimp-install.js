/**
 * Instalador automatico do curl-impersonate para Windows.
 * A implementacao vive em ./curlimp-install/ (um modulo por responsabilidade).
 */

export { defaultInstallDir, selectWindowsAsset } from './curlimp-install/assets.js';
export { installCurlImpersonate } from './curlimp-install/install.js';
