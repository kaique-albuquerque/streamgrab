/**
 * Formato de contêiner do arquivo final (MP4 / MKV).
 *
 * O contêiner é escolhido no download (setting `videoContainer` ou flag
 * `--container`); não há conversão posterior. Este módulo centraliza a
 * allowlist, a extensão e os args de FFmpeg que dependem do contêiner, para
 * que GUI e CLI usem a mesma fonte de verdade.
 *
 * MKV permite legenda como faixa selecionável (soft subs) sem re-encode;
 * MP4 exige `-movflags +faststart` para tocar progressivamente na web.
 */

/** Contêineres aceitos (ordem de exibição na UI). */
export const CONTAINERS = ['mp4', 'mkv'];

/** Contêiner usado quando o usuário não escolheu outro. */
export const DEFAULT_CONTAINER = 'mp4';

/** Extensão do arquivo final por contêiner. */
const EXTENSIONS = {
  mp4: '.mp4',
  mkv: '.mkv',
};

/**
 * Normaliza o valor do setting/flag para um contêiner válido.
 *
 * Qualquer coisa fora da allowlist — string desconhecida, vazio, `null`,
 * número, caminho — cai no default. O `Set` de propósito: um id como
 * `constructor` ou `__proto__` não pode herdar nada de Object.prototype.
 *
 * @param {unknown} value
 * @returns {'mp4'|'mkv'}
 */
export function normalizeContainer(value) {
  if (typeof value !== 'string') return DEFAULT_CONTAINER;
  const id = value.trim().toLowerCase();
  return CONTAINERS.includes(id) ? id : DEFAULT_CONTAINER;
}

/**
 * Extensão (com ponto) do contêiner.
 *
 * @param {'mp4'|'mkv'} container
 * @returns {'.mp4'|'.mkv'}
 */
export function extensionForContainer(container) {
  return EXTENSIONS[normalizeContainer(container)];
}

/**
 * Args do FFmpeg específicos do contêiner.
 *
 * `-movflags +faststart` só faz sentido em MP4; em MKV é ignorado pelo
 * FFmpeg e só polui o log. Devolve a lista vazia para MKV.
 *
 * @param {'mp4'|'mkv'} container
 * @returns {string[]}
 */
export function containerOutputArgs(container) {
  return normalizeContainer(container) === 'mp4' ? ['-movflags', '+faststart'] : [];
}