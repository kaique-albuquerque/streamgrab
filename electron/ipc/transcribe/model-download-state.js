/**
 * Estado compartilhado do download de modelo (um por vez).
 */

/** Download de modelo em andamento (promise) e o modelo em questão. */
let modelDownloadPromise = null;
let modelDownloadAbort = null;
let modelDownloadId = null;

export function getModelDownloadId() {
  return modelDownloadId;
}

export function isModelDownloading() {
  return Boolean(modelDownloadPromise);
}

/** Inicia o controle do download; guarda a promise e o AbortController. */
export function beginModelDownload(model, promise, abort) {
  modelDownloadId = model;
  modelDownloadAbort = abort;
  modelDownloadPromise = promise;
}

/** Limpa o estado ao final (sucesso, erro ou cancelamento). */
export function endModelDownload() {
  modelDownloadPromise = null;
  modelDownloadAbort = null;
  modelDownloadId = null;
}

/** Aborta o download em andamento; false se não há nenhum. */
export function abortModelDownload() {
  if (!modelDownloadPromise) return false;
  modelDownloadAbort?.abort();
  return true;
}

/** true se o download atual foi abortado. */
export function isCurrentDownloadAborted() {
  return Boolean(modelDownloadAbort?.signal?.aborted);
}

/** O modelo em questão é o que está sendo baixado agora? */
export function isDownloadingModel(model) {
  return Boolean(modelDownloadId) && modelDownloadId === model;
}
