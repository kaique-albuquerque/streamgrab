/**
 * CLI flow — extração de áudio pós-download (P13).
 *
 * Converte o arquivo baixado para M4A/MP3 e remove o original. Em caso de
 * falha, mantém o arquivo original e apenas avisa no log.
 */

import fs from 'node:fs';
import { extractAudioFile, normalizeExtractProfile } from '../ffmpeg/audio-extract.js';

/**
 * Retorna o caminho final do download: o áudio extraído quando a opção está
 * ligada e a conversão funciona, ou o próprio `output` caso contrário.
 */
export async function maybeExtractAudio({ output, profile, safeIo = console, signal, extract = extractAudioFile }) {
  const profileId = normalizeExtractProfile(profile);
  if (!profileId || !output || !fs.existsSync(output)) return output;

  safeIo.log(`\n[audio] Extraindo audio (${profileId})...`);
  try {
    const { audioPath, transcoded } = await extract({
      input: output,
      profile: profileId,
      signal,
      onLog: (message) => safeIo.log(message),
    });
    try {
      fs.unlinkSync(output);
    } catch {
      /* mantém o original apenas se não puder remover */
    }
    safeIo.log(`[audio] ${transcoded ? 'Transcodificado' : 'Remux'} para: ${audioPath}`);
    return audioPath;
  } catch (err) {
    safeIo.log(`[audio] Falha ao extrair audio: ${err.message} (mantendo o arquivo original)`);
    return output;
  }
}
