/**
 * Resolução da escolha de qualidade/formatId informada em `--format`.
 */

import { createStreamGrabCore } from '../../core/index.js';
import { fetchPlaylist } from '../../hls.js';
import { resolveSourceAdapterAsync } from '../../source-adapters.js';
import { ADAPTIVE_URI_PREFIX } from '../../adapters/ytdlp.js';

/** Encontra o índice da variante correspondente ao formatId informado. */
function findVariantIndex(variants, format) {
  return variants.findIndex((v) => {
    if (v.formatId && String(v.formatId) === format) return true;
    if (v.uri === `${ADAPTIVE_URI_PREFIX}${format}`) return true;
    if (v.itag && String(v.itag) === format) return true;
    if (v.height && String(v.height) === format) return true;
    if (v.bandwidth && String(v.bandwidth) === format) return true;
    return false;
  });
}

export async function resolveQualityChoice({ target, headers, auth = {}, format = '', io = console }) {
  if (!format) return { qualityChoice: '', error: null };

  const core = createStreamGrabCore();
  const adapter = await resolveSourceAdapterAsync(target, headers);
  let info = null;
  if (adapter.id === 'youtube' || adapter.id === 'social') {
    const analysis = await core.analyze(target, { headers, auth });
    info = analysis.info;
  } else if (adapter.id === 'hls') {
    info = await fetchPlaylist(target, headers);
  }

  const variants = info?.variants || [];
  const byId = findVariantIndex(variants, format);
  if (byId !== -1) return { qualityChoice: String(byId + 1), error: null };

  const numeric = Number(format);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= variants.length) {
    return { qualityChoice: String(numeric), error: null };
  }

  io.error(`\n[ERRO] Formato "${format}" nao encontrado. Use um indice (1..${variants.length}) ou um formatId da analise.`);
  return { qualityChoice: '', error: 'formato-nao-encontrado' };
}
