/**
 * Integracao com o curl-impersonate (localizar binario, criar cliente, matar processos).
 * A implementacao vive em ./curlimp/ (um modulo por responsabilidade).
 */

export { killAllCurl } from './curlimp/active.js';
export { findCurlImpersonate } from './curlimp/locate.js';
export { createCurlClient } from './curlimp/client.js';
