/**
 * HLS segments — download de chaves, init maps e escrita da playlist local.
 */

import fs from 'node:fs';
import path from 'node:path';

import { rewritePlaylist, extForUri } from '../../../curl/index.js';
import { fetchBinary } from '../fetch.js';

/** Baixa as chaves AES e devolve o mapa URL → arquivo local. */
export async function downloadKeyFiles({ parsed, mediaBase, headers, signal, workDir }) {
  const keyFiles = new Map();
  for (const key of parsed.keys) {
    const keyUrl = new URL(key.uri, mediaBase).toString();
    const local = path.join(workDir, `key_${keyFiles.size}.bin`);
    const r = await fetchBinary(keyUrl, headers, signal);
    fs.writeFileSync(local, r.data);
    keyFiles.set(keyUrl, local);
  }
  return keyFiles;
}

/** Baixa os init maps (fMP4) e devolve o mapa URL → arquivo local. */
export async function downloadMapFiles({ parsed, mediaBase, headers, signal, workDir }) {
  const mapFiles = new Map();
  for (const map of parsed.maps) {
    const mapUrl = new URL(map.uri, mediaBase).toString();
    const local = path.join(workDir, `init_${mapFiles.size}.${extForUri(map.uri, 'mp4')}`);
    const r = await fetchBinary(mapUrl, headers, signal);
    fs.writeFileSync(local, r.data);
    mapFiles.set(mapUrl, local);
  }
  return mapFiles;
}

/** Escreve a playlist com as referências locais e devolve o caminho. */
export function writeLocalPlaylist({
  workDir, mediaText, segMap, keyFiles, mapFiles, mediaBase,
}) {
  const localPlaylist = path.join(workDir, 'local.m3u8');
  fs.writeFileSync(
    localPlaylist,
    rewritePlaylist(mediaText, segMap, keyFiles, mapFiles, mediaBase),
    'utf8'
  );
  return localPlaylist;
}
