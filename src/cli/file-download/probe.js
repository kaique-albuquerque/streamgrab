import { probeFileDownload } from '../../transports/file-probe.js';
import { buildFallbackRemote, sanitizePreservingExtension } from '../file-download-shared.js';

/**
 * Sonda o arquivo remoto; se falhar e houver `ask`, oferece continuar sem metadados.
 *
 * @returns {Promise<{ ok: boolean, remote?: object, code?: number, error?: Error }>}
 */
export async function probeRemote({ target, headers, ask, io, flags }) {
  try {
    const probed = await probeFileDownload(target, { headers });
    return {
      ok: true,
      remote: {
        url: probed.finalUrl,
        totalBytes: probed.totalBytes,
        contentType: probed.contentType,
        filename: sanitizePreservingExtension(probed.filename),
        capability: probed.capability,
        probeMethod: probed.probeMethod,
        metadataConfidence: probed.metadataConfidence,
        etag: probed.etag || '',
        lastModified: probed.lastModified || '',
      },
    };
  } catch (err) {
    io.error(`\n[ERRO] Nao foi possivel sondar o arquivo: ${err.message}`);
    if (!ask) return { ok: false, code: 1, error: err };

    const choice = (await ask('Continuar mesmo assim usando apenas a URL informada? (S/n): ')).trim().toUpperCase();
    if (choice.startsWith('N')) return { ok: false, code: 1, error: err };

    io.log('[probe] Continuando sem metadados completos do servidor.');
    return { ok: true, remote: buildFallbackRemote(target, flags.filename || '') };
  }
}
