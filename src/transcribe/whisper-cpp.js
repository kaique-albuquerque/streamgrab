/**
 * Wrapper do whisper.cpp para transcricao de audio.
 *
 * Detecta o binario do whisper.cpp (vendor/whisper ou WHISPER_CPP_PATH)
 * e executa a transcricao via subprocesso.
 *
 * Uso:
 *   const result = await transcribeWithCpp({ audioPath, language: 'pt', model: 'small' });
 *   console.log(result.text); // Texto transcrito
 *
 * A implementação vive em `./whisper-cpp/`, um arquivo por responsabilidade.
 */

export { checkWhisperCpp } from './whisper-cpp/detect.js';
export { transcribeWithCpp, transcribeWithCpp as default } from './whisper-cpp/transcribe.js';
