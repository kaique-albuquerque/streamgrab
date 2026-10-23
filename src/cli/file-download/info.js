import { formatBytes } from '../../utils.js';

/** Loga os metadados detectados antes do download. */
export function logFileMetadata({ io, resolvedName, remote, output }) {
  io.log(`\nArquivo detectado: ${resolvedName}`);
  if (remote.totalBytes > 0) io.log(`Tamanho: ${formatBytes(remote.totalBytes)}`);
  if (remote.contentType) io.log(`Content-Type: ${remote.contentType}`);
  if (remote.probeMethod) io.log(`Probe: ${remote.probeMethod}`);
  if (remote.capability) io.log(`Capability: ${remote.capability}`);
  io.log(`Saida: ${output}`);
}
