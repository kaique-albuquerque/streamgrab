/**
 * Handlers IPC de tradução — módulo src/translate.
 *
 * Canais:
 *  - translate:start          → enfileira tradução no job manager
 *  - translate:cancel         → cancela job (running → abort; queued → remove)
 *  - translate:retry          → re-enfileira job cancelado/erro
 *  - translate:remove         → remove job terminal da lista
 *  - translate:job-list       → jobs da sessão (com persistência em userData)
 *  - translate:models         → status de todos os modelos do catálogo
 *  - translate:model-status   → status de um modelo GGUF
 *  - translate:model-download → baixa um modelo (com progresso/retomada)
 *  - translate:model-cancel   → cancela download em andamento
 *  - translate:model-delete   → exclui os arquivos de um modelo baixado
 *
 * Eventos broadcast para o renderer:
 *  - translate:progress       → { jobId, stage, percent, ... }
 *  - translate:log            → { jobId, line }
 *  - translate:done           → { jobId, files, ... }
 *  - translate:error          → { jobId, cancelled, error, ... }
 *  - translate:job-updated    → snapshot do job
 *  - translate:model-progress → progresso do download
 */

import {
  registerCancelHandler,
  registerJobListHandler,
  registerRemoveHandler,
  registerRetryHandler,
  registerStartHandler,
} from './translate/job-handlers.js';
import {
  registerModelCancelHandler,
  registerModelDeleteHandler,
  registerModelDownloadHandler,
} from './translate/model-download-handlers.js';
import { registerModelStatusHandler, registerModelsHandler } from './translate/model-handlers.js';

/** Registra todos os canais IPC de tradução. */
export function registerTranslateHandlers() {
  registerStartHandler();
  registerCancelHandler();
  registerRetryHandler();
  registerRemoveHandler();
  registerJobListHandler();
  registerModelsHandler();
  registerModelStatusHandler();
  registerModelDownloadHandler();
  registerModelCancelHandler();
  registerModelDeleteHandler();
}