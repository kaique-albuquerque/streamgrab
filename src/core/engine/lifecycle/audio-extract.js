/**
 * Extração de áudio pós-download (P13).
 *
 * Converte o arquivo baixado para M4A/MP3 (formatos que o OneDrive/Drive
 * reproduzem nativamente) e passa a apontar `job.meta.output` para o áudio.
 */

import fs from 'node:fs';
import path from 'node:path';
import { extractAudioFile, normalizeExtractProfile } from '../../../ffmpeg/audio-extract.js';

/**
 * Executa a extração quando habilitada. Falhas nunca derrubam o download:
 * o arquivo original é preservado e o job segue concluído.
 */
export async function processAudioExtract(engine, job, { audioExtract, extract = extractAudioFile } = {}) {
  const profile = normalizeExtractProfile(
    audioExtract ?? engine.settings?.get?.('audioExtract'),
  );
  if (!profile) return;

  const input = job.meta?.output;
  if (!input || !fs.existsSync(input)) return;

  const log = (message) => engine._emit('log', { jobId: job.id, message });
  log(`[audio] Extraindo audio (${profile})...`);

  try {
    const { audioPath, transcoded } = await extract({
      input,
      profile,
      signal: engine._active.get(job.id)?.attempt?.signal,
      onLog: log,
    });
    try {
      fs.unlinkSync(input);
    } catch {
      /* mantém o original apenas se não puder remover */
    }
    job.meta.output = audioPath;
    log(`[audio] ${transcoded ? 'Transcodificado' : 'Remux'} para ${path.basename(audioPath)} (original removido).`);
  } catch (err) {
    log(`[audio] Falha ao extrair audio: ${err.message} — mantendo o arquivo original.`);
  }
}
