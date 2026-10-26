import { normalizeHeaders, normalizeUrl } from '../../utils.js';
import { parseFileFlags, promptFileDownloadOptions } from '../file-download-prompt.js';

import { probeRemote } from './probe.js';
import { resolveOutputPath } from './output.js';
import { logFileMetadata } from './info.js';
import { tryTurboDownload } from './turbo.js';
import { downloadSequential } from './sequential.js';

export { parseFileFlags, promptFileDownloadOptions };

export async function runFileDownloadCommand({ url, io = console, flags = {} }) {
  const target = normalizeUrl(url);
  if (!target) {
    io.error('\n[ERRO] URL invalida. Uso: streamgrab file <url>');
    return { code: 1, ok: false };
  }

  const headers = normalizeHeaders(flags.headers || {});
  const ask = typeof flags.ask === 'function' ? flags.ask : null;

  const probed = await probeRemote({ target, headers, ask, io, flags });
  if (!probed.ok) return { code: probed.code, ok: false, error: probed.error };
  const remote = probed.remote;

  const resolved = await resolveOutputPath({ flags, remote, ask, io });
  if (!resolved.ok) {
    return resolved.cancelled
      ? { code: 0, ok: false, cancelled: true }
      : { code: resolved.code, ok: false, error: resolved.error };
  }
  const { output, resolvedName } = resolved;

  logFileMetadata({ io, resolvedName, remote, output });

  if (flags.turbo) {
    const turbo = await tryTurboDownload({ flags, remote, headers, output, io });
    if (turbo.handled) return turbo.result;
  }

  return downloadSequential({ remote, headers, output, io });
}
