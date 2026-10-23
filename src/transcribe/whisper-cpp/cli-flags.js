/**
 * Descoberta das flags de saída suportadas pela versão instalada do whisper.cpp.
 */

import { spawnSync } from 'node:child_process';

export function detectWhisperFlags(binPath) {
  const help = getWhisperHelp(binPath);
  const outputFile = pickFlag(help, ['-of', '--output-file']);
  const outputTxt = pickFlag(help, ['--output-txt', '-otxt']);
  const outputSrt = pickFlag(help, ['--output-srt', '-osrt']);
  const printProgress = pickFlag(help, ['--print-progress', '-pp'], { required: false });

  if (!outputFile || !outputTxt || !outputSrt) {
    throw new Error(
      'whisper.cpp instalado nao expoe flags de saida compativeis.\n' +
      'Atualize o whisper.cpp com: npm run whisper:install'
    );
  }

  return {
    outputFile,
    outputTxt,
    outputSrt,
    printProgress,
  };
}

function getWhisperHelp(binPath) {
  try {
    const result = spawnSync(binPath, ['--help'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    return `${result.stdout || ''}\n${result.stderr || ''}`;
  } catch {
    return '';
  }
}

function pickFlag(help, flags, { required = true } = {}) {
  for (const flag of flags) {
    if (help.includes(flag)) {
      return flag;
    }
  }

  return required ? flags[0] : '';
}
