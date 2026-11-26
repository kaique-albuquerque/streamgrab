/**
 * Subcomando `convert`: converte um vídeo local para MKV.
 */

import path from 'node:path';

/**
 * Interpreta as flags do `convert`.
 *
 * @param {string[]} rest - Argumentos após o caminho do arquivo
 * @returns {{outputDir: string}}
 */
export function parseConvertFlags(rest = []) {
  let outputDir = '';
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--output' && rest[i + 1]) outputDir = rest[++i];
  }
  return { outputDir };
}

/**
 * Executa o subcomando `convert`.
 *
 * @param {object} params
 * @param {string} params.srtPath - Caminho do vídeo de entrada
 * @param {object} [params.io] - Console-like (default: console)
 * @param {object} [params.flags] - Saída de `parseConvertFlags`
 * @returns {Promise<{code: number}>}
 */
export async function runConvertCommand({ srtPath, io = console, flags = {} } = {}) {
  const { outputDir } = { outputDir: '', ...flags };

  io.log('');
  io.log(`📁 Convertendo para MKV: ${srtPath}`);

  try {
    const { convertToMkv } = await import('../../convert/index.js');
    const result = await convertToMkv({
      inputPath: srtPath,
      outputPath: outputDir ? path.join(outputDir, path.basename(srtPath, path.extname(srtPath)) + '.mkv') : undefined,
      onProgress: (p) => {
        if (p.percent > 0) io.log(`   ${p.percent}%`);
      },
    });

    if (result.alreadyMkv) {
      io.log('ℹ️  O arquivo já é MKV — nada a fazer.');
      return { code: 0 };
    }

    io.log('✅ Conversão concluída:');
    io.log(`   📝 ${result.outputPath}`);
    return { code: 0 };
  } catch (err) {
    io.error(`❌ Falha na conversão: ${err?.message || err}`);
    return { code: 1 };
  }
}