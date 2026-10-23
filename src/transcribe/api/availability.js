/**
 * Detecção de engines de transcrição disponíveis no ambiente.
 */

import { checkWhisperCpp } from '../whisper-cpp.js';
import { checkTransformers } from '../whisper-transformers.js';
import { DEFAULT_MODEL, getModelStatusFor } from '../model-manager.js';

/**
 * Verifica se a transcricao e possivel no ambiente atual.
 *
 * `available` refere-se ao MOTOR (binario presente). Quando `model` e
 * informado, `modelInstalled` diz se o modelo escolhido ja foi baixado —
 * são coisas independentes de propósito.
 *
 * @param {object} [params]
 * @param {string} [params.model='small'] - Id do modelo no catalogo
 * @returns {Promise<{ available: boolean, engine: string, reason?: string,
 *                     model: string, modelInstalled: boolean }>}
 */
export async function checkTranscriptionAvailable({ model = DEFAULT_MODEL } = {}) {
  const cpp = checkWhisperCpp();
  if (cpp.available) {
    const status = getModelStatusFor(model, cpp.modelsDir);
    return {
      available: true,
      engine: 'whisper-cpp',
      model,
      modelInstalled: status.installed,
      reason: status.installed
        ? ''
        : `Modelo ${model} ainda nao foi baixado. Abra Transcrever > Modelos Whisper.`,
    };
  }

  const transformers = await checkTransformers();
  if (transformers) {
    return { available: true, engine: 'whisper-transformers', model, modelInstalled: true };
  }

  return {
    available: false,
    engine: '',
    model,
    modelInstalled: false,
    reason:
      'Nenhum engine de transcricao encontrado.\n' +
      'Opcao 1: Execute npm run whisper:install\n' +
      'Opcao 2: Execute npm install @xenova/transformers',
  };
}
