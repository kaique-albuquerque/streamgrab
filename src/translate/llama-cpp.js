/**
 * Wrapper do llama.cpp para tradução local de legendas (barrel).
 *
 * Implementação em ./llama-cpp/:
 *  - paths.js   → binário vendorizado e marcador
 *  - detect.js  → checkLlamaCpp
 *  - server.js  → startServer, SERVER_START_TIMEOUT_MS
 */

export { checkLlamaCpp } from './llama-cpp/detect.js';
export { startServer, SERVER_START_TIMEOUT_MS } from './llama-cpp/server.js';
export { chatJson, ChatJsonError } from './llama-cpp/chat.js';