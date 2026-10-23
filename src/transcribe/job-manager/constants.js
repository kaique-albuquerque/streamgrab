/**
 * Estados de job e runner padrão do gerenciador de transcrição.
 */

export const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
};

/** Runner padrão: transcribeVideo (import dinâmico para testabilidade). */
export async function defaultRunner(params) {
  const { transcribeVideo } = await import('../index.js');
  return transcribeVideo(params);
}
