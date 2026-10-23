import { probeRangeSupport } from '../../transports/range/index.js';
import { defaultStatePath, clearState } from '../../core/resume.js';
import { cleanupPartial } from '../download.js';

/** Remove o parcial E o sidecar de resume (`--no-resume`/fallback). */
export async function cleanupResumeArtifacts(output) {
  cleanupPartial(output);
  await clearState(defaultStatePath(output));
}

/**
 * Verifica se o servidor aceita Range (download por partes). Dispara uma
 * requisicao "bytes=0-0": se responder 206 com content-range, o turbo e valido.
 * (P4: delega ao transporte Range — `probeRangeSupport`.)
 */
export async function probeRange(url, headers, signal) {
  const probe = await probeRangeSupport(url, { headers, signal });
  return { ok: probe.ok, total: probe.total };
}
