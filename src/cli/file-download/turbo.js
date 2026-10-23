import { planFileDownload } from '../file-planner.js';
import { downloadPartFiles } from '../file-download-parts.js';
import {
  DEFAULT_TURBO_CHUNKS,
  MAX_FILE_TURBO_CHUNKS,
  normalizeChunkCount,
} from '../file-download-shared.js';

/**
 * Executa o download turbo quando possível.
 *
 * @returns {Promise<{ handled: boolean, result?: object }>} `handled:false`
 *          significa que o chamador deve seguir com o download sequencial.
 */
export async function tryTurboDownload({ flags, remote, headers, output, io }) {
  const requestedConcurrency = flags.concurrency > 0 ? flags.concurrency : DEFAULT_TURBO_CHUNKS;
  const concurrency = normalizeChunkCount(requestedConcurrency);
  const plan = planFileDownload({
    totalBytes: remote.totalBytes,
    capability: remote.capability || 'NO_RANGE',
    userConcurrency: concurrency,
    userBlockCount: flags.blockCount || 0,
    preset: flags.preset || 'auto',
  });

  if (requestedConcurrency !== concurrency) {
    io.log(`[turbo] Quantidade ajustada para ${concurrency} conexoes (maximo configurado: ${MAX_FILE_TURBO_CHUNKS}).`);
  }
  io.log(`[plan] Mode: ${plan.mode}`);
  io.log(`[plan] Preset: ${flags.preset || 'auto'}`);
  for (const reason of plan.rationale || []) io.log(`[plan] ${reason}`);

  if (plan.mode !== 'multipart') {
    io.log('[AVISO] Turbo por partes foi desativado para este download.');
    io.log('[AVISO] Continuando com download sequencial.');
    return { handled: false };
  }

  io.log(`[turbo] Download por partes ativado (${plan.concurrency} conexoes, ${plan.blockCount} arquivos temporarios).`);
  try {
    const result = await downloadPartFiles({
      url: remote.url,
      output,
      headers,
      totalBytes: remote.totalBytes,
      etag: remote.etag || '',
      lastModified: remote.lastModified || '',
      concurrency: plan.concurrency,
      blockCount: plan.blockCount,
      io,
    });
    io.log('\nDownload concluido!');
    io.log(`Arquivo salvo em: ${result.output}`);
    return { handled: true, result: { code: 0, ok: true, output: result.output } };
  } catch (err) {
    io.error(`\n[ERRO] Falha ao baixar arquivo em partes: ${err.message}`);
    return { handled: true, result: { code: 1, ok: false, error: err } };
  }
}
