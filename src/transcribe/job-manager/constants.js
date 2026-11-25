/**
 * Runner padrão do gerenciador de transcrição.
 *
 * `JOB_STATUS` vive no núcleo genérico (`src/core/job-queue/constants.js`) e é
 * reexportado por `src/transcribe/job-manager.js`.
 */

/** Runner padrão: transcribeVideo (import dinâmico para testabilidade). */
export async function defaultRunner(params) {
  const { transcribeVideo } = await import('../index.js');
  return transcribeVideo(params);
}