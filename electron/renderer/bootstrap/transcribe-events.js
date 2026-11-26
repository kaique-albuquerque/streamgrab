/** Assinatura dos eventos de transcrição emitidos pelo main process. */

export function setupTranscribeEvents(getPanels) {
  const handle = (type) => (data) => getPanels()?.handleTranscribeEvent(type, data);

  window.api.onTranscribeProgress(handle('progress'));
  window.api.onTranscribeLog(() => {}); // logs ficam no terminal/main
  window.api.onTranscribeDone(handle('done'));
  window.api.onTranscribeError(handle('error'));
  window.api.onTranscribeJobUpdated(handle('job-updated'));
  window.api.onTranscribeRemoved(handle('removed'));
  window.api.onTranscribeModelProgress(handle('model-progress'));

  // SPEC-12: conversão de vídeo para MKV
  const handleConvert = (type) => (data) => getPanels()?.handleConvertEvent?.(type, data);
  window.api.onConvertProgress?.(handleConvert('progress'));
  window.api.onConvertLog?.(() => {});
  window.api.onConvertDone?.(handleConvert('done'));
  window.api.onConvertError?.(handleConvert('error'));
}
