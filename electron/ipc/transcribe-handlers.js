/**
 * Handlers IPC de transcrição — módulo src/transcribe.
 *
 * Canais:
 *  - transcribe:check          → disponibilidade (engine + binário)
 *  - transcribe:start          → enfileira transcrição no job manager
 *  - transcribe:cancel         → cancela job (running → abort; queued → remove)
 *  - transcribe:retry          → re-enfileira job cancelado/erro
 *  - transcribe:remove         → remove job terminal da lista (done/error/cancelled)
 *  - transcribe:job-list       → jobs da sessão (com persistência em userData)
 *  - transcribe:models         → status de todos os modelos do catálogo
 *  - transcribe:model-status   → status de um modelo GGML em userData
 *  - transcribe:model-download → baixa um modelo (com progresso/retomada)
 *  - transcribe:model-cancel   → cancela download em andamento
 *  - transcribe:model-delete   → exclui os arquivos de um modelo baixado
 *
 * Eventos broadcast para o renderer:
 *  - transcribe:progress       → { jobId, stage, percent, ... }
 *  - transcribe:log            → { jobId, line }
 *  - transcribe:done           → { jobId, files, engine, ... }
 *  - transcribe:error          → { jobId, cancelled, error, ... }
 *  - transcribe:job-updated    → snapshot do job (added/started/retry)
 *  - transcribe:model-progress → { model, percent, downloaded, total, ... }
 *
 * A implementação vive em `./transcribe/`, um arquivo por responsabilidade.
 */

import {
  registerCancelHandler,
  registerJobListHandler,
  registerRemoveHandler,
  registerRetryHandler,
} from './transcribe/job-control-handlers.js';
import { registerCheckHandler, registerStartHandler } from './transcribe/job-handlers.js';
import {
  registerModelCancelHandler,
  registerModelDownloadHandler,
} from './transcribe/model-download-handlers.js';
import { registerModelDeleteHandler } from './transcribe/model-delete-handler.js';
import { registerModelsHandler, registerModelStatusHandler } from './transcribe/model-handlers.js';

/** Registra todos os canais IPC de transcrição. */
export function registerTranscribeHandlers() {
  registerCheckHandler();
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
