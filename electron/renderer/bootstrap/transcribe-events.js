/** Assinatura dos eventos de transcrição e tradução emitidos pelo main process. */

export function setupTranscribeEvents(getPanels) {
  const handle = (type) => (data) => getPanels()?.handleTranscribeEvent(type, data);
  const handleTranslate = (type) => (data) => getPanels()?.handleTranslateEvent?.(type, data);

  window.api.onTranscribeProgress(handle('progress'));
  window.api.onTranscribeLog(() => {}); // logs ficam no terminal/main
  window.api.onTranscribeDone(handle('done'));
  window.api.onTranscribeError(handle('error'));
  window.api.onTranscribeJobUpdated(handle('job-updated'));
  window.api.onTranscribeRemoved(handle('removed'));
  window.api.onTranscribeModelProgress(handle('model-progress'));

  // SPEC-10: tradução local de legendas
  window.api.onTranslateProgress?.(handleTranslate('progress'));
  window.api.onTranslateLog?.(() => {});
  window.api.onTranslateDone?.(handleTranslate('done'));
  window.api.onTranslateError?.(handleTranslate('error'));
  window.api.onTranslateJobUpdated?.(handleTranslate('job-updated'));
  window.api.onTranslateRemoved?.(handleTranslate('removed'));
  window.api.onTranslateModelProgress?.(handleTranslate('model-progress'));
}
