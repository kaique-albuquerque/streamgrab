/**
 * P4 — Limites de recursos (plano §16 / §41) — barrel.
 *
 * Controla quantos recursos simultaneos o StreamGrab pode usar:
 *  - downloads simultaneos (semaforo global)
 *  - conexoes por download (usado pelo transporte Range / turbo)
 *  - processos FFmpeg simultaneos
 *  - diretorios temporarios ativos
 *
 * Uso tipico:
 *   const limiter = createDefaultResourceManager();
 *   const release = await limiter.acquireDownload();
 *   try { ... } finally { release(); }
 *
 * Implementação em ./resources/:
 *  - semaphore.js → Semaphore
 *  - manager.js   → ResourceManager e createDefaultResourceManager
 */

import { ResourceManager, createDefaultResourceManager } from './resources/manager.js';
import { Semaphore } from './resources/semaphore.js';

export { ResourceManager, createDefaultResourceManager } from './resources/manager.js';
export { Semaphore } from './resources/semaphore.js';

export default { ResourceManager, Semaphore, createDefaultResourceManager };
