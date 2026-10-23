/**
 * Concatenação das partes no arquivo final.
 */

import fs from 'node:fs';
import { StreamGrabError } from '../../core/errors.js';
import { createPartPath } from './paths.js';

/** Copia as partes na ordem dos ranges, validando o tamanho de cada uma. */
export async function mergePartFiles(partsDir, ranges, output) {
  const out = await fs.promises.open(output, 'w');
  try {
    for (const range of ranges) {
      const partPath = createPartPath(partsDir, range.index);
      const input = await fs.promises.open(partPath, 'r');
      try {
        const stat = await input.stat();
        const expected = range.end - range.start + 1;
        if (stat.size !== expected) {
          throw new StreamGrabError(`Parte ${range.index} incompleta no merge.`, { code: 'INCOMPLETE_RANGE' });
        }
        let position = 0;
        while (position < stat.size) {
          const remaining = stat.size - position;
          const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, remaining));
          const { bytesRead } = await input.read(buffer, 0, buffer.length, position);
          if (!bytesRead) break;
          await out.write(buffer.subarray(0, bytesRead), 0, bytesRead);
          position += bytesRead;
        }
      } finally {
        await input.close().catch(() => {});
      }
    }
  } finally {
    await out.close().catch(() => {});
  }
}
