/**
 * YouTube signature — cipher resolution and n-transform application.
 */

import { findDecipherFunctionName, findNTransformFunctionName } from './finders.js';
import { runPlayerFunction } from './player.js';

/**
 * Deciphers a YouTube signature using the player JS.
 */
export function decipherYouTubeSignature(signature, playerJsText) {
  const functionName = findDecipherFunctionName(playerJsText);
  if (!functionName) {
    throw new Error('Nao foi possivel localizar a funcao de decipher no player JS do YouTube.');
  }
  return runPlayerFunction(playerJsText, functionName, signature);
}

/**
 * Transforms the YouTube n-parameter using the player JS.
 */
export function transformYouTubeNParam(nValue, playerJsText) {
  const functionName = findNTransformFunctionName(playerJsText);
  if (!functionName) {
    throw new Error(
      'Nao foi possivel localizar a funcao de transformacao do parametro n no player JS do YouTube.'
    );
  }
  return runPlayerFunction(playerJsText, functionName, nValue);
}

/**
 * Applies the n-transform to a URL (replaces the `n` search param).
 */
export function applyNTransform(url, playerJsText) {
  const finalUrl = new URL(url);
  const n = finalUrl.searchParams.get('n');
  if (!n) return finalUrl.toString();
  finalUrl.searchParams.set('n', transformYouTubeNParam(n, playerJsText));
  return finalUrl.toString();
}

/**
 * Applies signatureCipher: deciphers `s`, appends to URL, then applies n-transform.
 */
export function applySignatureCipher(cipherText, playerJsText) {
  const params = new URLSearchParams(String(cipherText || ''));
  const rawUrl = params.get('url') || '';
  const signature = params.get('s') || '';
  const signatureParam = params.get('sp') || 'signature';

  if (!rawUrl || !signature) {
    throw new Error('signatureCipher invalido: faltando url ou s.');
  }

  const deciphered = decipherYouTubeSignature(signature, playerJsText);
  const finalUrl = new URL(rawUrl);
  finalUrl.searchParams.set(signatureParam, deciphered);
  return applyNTransform(finalUrl.toString(), playerJsText);
}

/**
 * Resolves an array of formats: applies n-transform to direct URLs,
 * or deciphers signatureCipher to produce direct URLs.
 */
export function resolveCipherFormats(formats, playerJsText) {
  return (formats || []).map((format) => {
    if (format.url) {
      try {
        return { ...format, url: applyNTransform(format.url, playerJsText) };
      } catch { return format; }
    }
    if (!(format.signatureCipher || format.cipher)) return format;
    try {
      return {
        ...format,
        url: applySignatureCipher(format.signatureCipher || format.cipher, playerJsText),
      };
    } catch { return format; }
  });
}
