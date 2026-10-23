/**
 * Regras de proteção para exclusão de modelos de transcrição.
 */

import path from 'node:path';
import { getJobManager } from './job-manager-provider.js';
import { JOB_MANAGER_MODULE, MODEL_MANAGER_MODULE } from './shared.js';

/** Algum job ativo (em execução ou na fila) está usando este modelo? */
export async function isModelInUseByActiveJob(model) {
  const { JOB_STATUS } = await import(JOB_MANAGER_MODULE);
  const { DEFAULT_MODEL } = await import(MODEL_MANAGER_MODULE);
  return Boolean(
    getJobManager()
      ?.list()
      .some(
        (job) =>
          [JOB_STATUS.RUNNING, JOB_STATUS.QUEUED].includes(job.status) &&
          (job.model || DEFAULT_MODEL) === model,
      ),
  );
}

/** Mensagem de bloqueio quando o modelo está fora do diretório do app ('' se pode excluir). */
export function externalInstallMessage(model, modelDir, modelsDir) {
  if (!modelDir || path.resolve(modelDir) === path.resolve(modelsDir)) return '';
  return `O modelo "${model}" está instalado fora do diretório do aplicativo (${modelDir}).`;
}
