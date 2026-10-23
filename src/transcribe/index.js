/**
 * Modulo de transcricao de video/audio via Whisper.
 *
 * API publica para transcricao de videos baixados pelo StreamGrab.
 * Suporta dois engines:
 * - whisper.cpp (recomendado, mais rapido)
 * - @xenova/transformers (fallback, Node.js puro)
 *
 * Uso:
 *   import { transcribeVideo } from './transcribe/index.js';
 *
 *   const result = await transcribeVideo({
 *     videoPath: '/path/to/video.mp4',
 *     language: 'pt',
 *   });
 *
 *   console.log(result.files); // [{ path, format, size }]
 */
export { checkTranscriptionAvailable } from './api/availability.js';
export { transcribeAudio } from './api/audio.js';
export { transcribeVideo } from './api/video.js';

export { checkWhisperCpp } from './whisper-cpp.js';
export { checkTransformers } from './whisper-transformers.js';
export { extractAudio, hasAudio, getAudioDuration } from './audio-extract.js';
export { formatTxt, formatMd, formatSrt, writeTranscription, titleFromVideoPath } from './format.js';
export {
  getModelStatus,
  getModelStatusFor,
  listModels,
  listModelsFor,
  modelSearchDirs,
  setModelsDirResolver,
  getModelsDir,
  deleteModel,
  isKnownModel,
  listModelIds,
  downloadModel,
  MODEL_CATALOG,
  DEFAULT_MODEL as DEFAULT_WHISPER_MODEL,
} from './model-manager.js';
export { createTranscriptionJobManager, createJsonJobStorage, JOB_STATUS } from './job-manager.js';

export { transcribeVideo as default } from './api/video.js';
