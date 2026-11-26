/**
 * Detecção do container real de um arquivo baixado.
 *
 * O setting `videoContainer` diz o que o usuário **pediu**; o magic bytes diz
 * o que a fonte **entregou**. Quando divergem (URL direta apontando para MP4
 * com o setting em MKV), o app não renomeia o arquivo para o formato pedido —
   isso produziria um `.mkv` que na verdade é MP4 e não abre em players que
 * confiam na extensão. Em vez disso, mantém a extensão real e avisa.
 */

import fs from 'node:fs';

/** Primeiros bytes de um arquivo (suficiente para identificar o container). */
const HEADER_BYTES = 32;

/**
 * Identifica o container pelos magic bytes.
 *
 * - MKV/WebM: EBML header `1A 45 DF A3`.
 * - MP4/MOV: 4 bytes de tamanho + `ftyp` no offset 4.
 *
 * @param {string} filePath
 * @returns {'mkv'|'mp4'|''} Container detectado, ou '' quando desconhecido
 */
export function detectContainerFromFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(HEADER_BYTES);
    const read = fs.readSync(fd, buf, 0, HEADER_BYTES, 0);
    if (read < 8) return '';

    // EBML (Matroska/WebM).
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
      return 'mkv';
    }

    // ISO BMFF (MP4/MOV): 'ftyp' no offset 4.
    if (buf.toString('ascii', 4, 8) === 'ftyp') {
      return 'mp4';
    }

    return '';
  } catch {
    return '';
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignora */
      }
    }
  }
}

/**
 * Compara o container pedido com o detectado.
 *
 * @param {string} requested - Container pedido (setting/flag)
 * @param {string} actual - Container detectado no arquivo
 * @returns {{requested: string, actual: string, message: string}|null}
 *   Divergência, ou null quando não há (inclui container desconhecido)
 */
export function containerMismatch(requested, actual) {
  if (!requested || !actual || requested === actual) return null;
  return {
    requested,
    actual,
    message: `Você pediu ${requested.toUpperCase()}, mas a fonte entregou ${actual.toUpperCase()}. Salvo como .${actual}.`,
  };
}