import fs from 'node:fs';

import { StreamGrabError } from '../../core/errors.js';
import { createProgressReporter } from '../progress.js';
import { cleanupPartial } from '../download.js';

/** Baixa o arquivo em fluxo único, com progresso e limpeza em caso de falha. */
export async function downloadSequential({ remote, headers, output, io }) {
  const progress = createProgressReporter(io, { totalBytes: remote.totalBytes, label: 'Arquivo' });
  try {
    const res = await fetch(remote.url, { method: 'GET', headers, redirect: 'follow' });
    if (!res.ok || !res.body) {
      throw new StreamGrabError(`HTTP ${res.status} ao baixar arquivo.`, { code: 'HTTP_ERROR', status: res.status });
    }
    const out = await fs.promises.open(output, 'w');
    try {
      const reader = res.body.getReader();
      let downloaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          await out.write(value, 0, value.byteLength, downloaded);
          downloaded += value.byteLength;
          progress.update({ key: 'total_size', value: downloaded });
        }
      }
    } finally {
      await out.close().catch(() => {});
    }
    progress.finish(true);
    io.log('\nDownload concluido!');
    io.log(`Arquivo salvo em: ${output}`);
    return { code: 0, ok: true, output };
  } catch (err) {
    progress.finish(false);
    cleanupPartial(output);
    io.error(`\n[ERRO] Falha ao baixar arquivo: ${err.message}`);
    return { code: 1, ok: false, error: err };
  }
}
