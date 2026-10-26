/** Análise de fontes baseadas em adapter (youtube/social). */

import { chooseVariant, describeSourceType } from '../../cli/ui.js';
import { sourceLooksLikeYouTubeWatch } from '../../cli/context.js';

export async function analyzeAdapterSource({ url, headers, adapter, sourceType, forceYouTube, answerFn, safeIo, core }) {
  safeIo.onState?.({ state: 'analyzing' });
  safeIo.log(`\nAnalisando ${describeSourceType(sourceType)}...`);
  try {
    const analysis = await core.analyze(url, {
      headers, auth: undefined,
      forceYouTube: forceYouTube && sourceLooksLikeYouTubeWatch(url),
    });
    adapter = analysis.adapter;
    const info = analysis.info;
    safeIo.log(`Video detectado: ${info.title}`);
    if (info.progressiveFormats?.length) {
      safeIo.log(`Formatos progressivos disponiveis: ${info.progressiveFormats.length}`);
    }
    if (info.adaptiveVideoFormats?.length && info.adaptiveAudioFormats?.length) {
      safeIo.log(`Formatos adaptativos disponiveis: ${info.adaptiveVideoFormats.length} videos + ${info.adaptiveAudioFormats.length} audios`);
    }
    const chosen = await chooseVariant(answerFn, safeIo, info.variants, '');
    if (!chosen) {
      safeIo.log('\nCancelado.');
      return { earlyReturn: { code: 0, ok: false, cancelled: true } };
    }
    safeIo.log(`Formato escolhido: ${chosen}`);
    return { adapter, info, targetUrl: chosen };
  } catch (err) {
    safeIo.error(`\n[ERRO] ${err.message}`);
    if (err.needsAuth) {
      safeIo.error('\nDica: o conteudo parece exigir login.');
      safeIo.error('  1. Instale a extensao "Get cookies.txt LOCALLY" no Chrome/Edge/Firefox e exporte os cookies do site.');
      safeIo.error('  2. Rode:  node src/index.js --cookies cookies.txt');
      safeIo.error('  3. Ou extraia direto do navegador:  node src/index.js --cookies-from-browser chrome');
    }
    return { earlyReturn: { code: 1, ok: false, error: err.code || sourceType } };
  }
}
