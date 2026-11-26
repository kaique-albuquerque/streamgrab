/**
 * Subcomando `translate`: traduz um `.srt` localmente.
 */

import { DEFAULT_TRANSLATE_MODEL } from '../../translate/model-manager.js';

/**
 * Interpreta as flags do `translate`.
 *
 * @param {string[]} rest - Argumentos após o caminho do `.srt`
 * @returns {{ model: string, targetLang: string }}
 */
export function parseTranslateFlags(rest = []) {
  let model = DEFAULT_TRANSLATE_MODEL;
  let targetLang = 'pt';

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--model' && rest[i + 1]) model = rest[++i];
    else if (arg === '--target-lang' && rest[i + 1]) targetLang = rest[++i];
  }

  return { model, targetLang };
}

/**
 * Executa o subcomando `translate`.
 *
 * @param {object} params
 * @param {string} params.srtPath - Caminho do `.srt`
 * @param {object} [params.io] - Console-like (default: console)
 * @param {object} [params.flags] - Saída de `parseTranslateFlags`
 * @returns {Promise<{ code: number }>}
 */
export async function runTranslateCommand({ srtPath, io = console, flags = {} } = {}) {
  const { model, targetLang } = { model: DEFAULT_TRANSLATE_MODEL, targetLang: 'pt', ...flags };

  io.log('');
  io.log(`🌐 Traduzindo legendas: ${srtPath}`);
  io.log(`   Modelo: ${model}`);

  try {
    const { translateSubtitle } = await import('../../translate/index.js');
    const result = await translateSubtitle({
      srtPath,
      model,
      targetLang,
      onProgress: (p) => {
        if (p.stage === 'translating') {
          io.log(`   Bloco ${p.block}/${p.totalBlocks} (${p.percent}%)`);
        } else if (p.stage === 'shortening') {
          io.log('   Encurtando segmentos acima do alvo...');
        }
      },
    });

    io.log('✅ Tradução salva:');
    io.log(`   📝 ${result.outputPath}`);
    if (result.overTarget.length > 0) {
      io.log(`   ⚠ ${result.overTarget.length} segmento(s) ficaram acima do alvo de leitura (ver log)`);
    }
    return { code: 0 };
  } catch (err) {
    io.error(`❌ Falha na tradução: ${err?.message || err}`);
    return { code: 1 };
  }
}