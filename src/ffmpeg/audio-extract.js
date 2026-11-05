/**
 * P13 — Extração de áudio para formatos reproduzíveis na nuvem.
 *
 * MPEG-TS (.ts) e outros containers de streaming não são reconhecidos como
 * áudio pelo OneDrive/Drive. Este módulo converte o download para M4A (AAC)
 * ou MP3, preferindo stream copy (`-c:a copy`) e caindo para transcode
 * somente quando o codec de origem é incompatível.
 */

import fs from 'node:fs';
import path from 'node:path';
import { audioProfileToArgs } from './audio.js';
import { nextAvailableName } from '../core/filenames.js';
import { ffmpegService } from './service.js';

/** Formatos aceitos pela feature (ordem de exibição). */
export const EXTRACT_PROFILES = ['m4a', 'mp3'];

/** Formato usado quando o usuário apenas liga a opção. */
export const DEFAULT_EXTRACT_PROFILE = 'm4a';

const PROFILE_EXT = { m4a: 'm4a', mp3: 'mp3' };

/**
 * Normaliza o valor do setting/flag: `off`/vazio/false → null (desligado),
 * `true` → default, valor desconhecido → default.
 */
export function normalizeExtractProfile(value) {
  if (value === true) return DEFAULT_EXTRACT_PROFILE;
  if (value === false || value == null) return null;
  const id = String(value).trim().toLowerCase();
  if (!id || id === 'off' || id === 'none' || id === 'false') return null;
  return EXTRACT_PROFILES.includes(id) ? id : DEFAULT_EXTRACT_PROFILE;
}

/**
 * Args do FFmpeg para extrair áudio. Puro (sem I/O) — testável.
 * `mode: 'copy'` mantém o codec; `'copy-bsf'` adiciona `aac_adtstoasc`
 * (necessário ao sair de MPEG-TS); `'transcode'` recodifica para o perfil.
 */
export function buildExtractArgs({ input, output, profile = DEFAULT_EXTRACT_PROFILE, mode = 'copy' }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostats', '-y', '-i', input];
  if (mode === 'transcode') {
    args.push(...audioProfileToArgs(profile, { sourceCodec: '' }).args);
  } else {
    args.push('-vn', '-c:a', 'copy');
    if (mode === 'copy-bsf' && profile === 'm4a') args.push('-bsf:a', 'aac_adtstoasc');
  }
  if (profile === 'm4a') args.push('-movflags', '+faststart');
  args.push(output);
  return args;
}

/** Caminho de saída padrão: mesmo nome, extensão do perfil. */
export function defaultAudioOutput(input, profile = DEFAULT_EXTRACT_PROFILE) {
  const dir = path.dirname(input);
  const base = path.basename(input, path.extname(input));
  return path.join(dir, `${base}.${PROFILE_EXT[profile] || profile}`);
}

function isUsableFile(file) {
  try {
    return fs.existsSync(file) && fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

function removeQuietly(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignora */
  }
}

/**
 * Extrai o áudio de `input` para `output` (ou nome derivado — nunca
 * sobrescrevendo um áudio já existente na pasta).
 * Tenta copy e, se falhar, transcode. Retorna { audioPath, profile, transcoded }.
 * Lança erro quando nenhuma das tentativas produz um arquivo válido.
 */
export async function extractAudioFile({
  input, output, profile = DEFAULT_EXTRACT_PROFILE, signal, onLog,
}) {
  const profileId = normalizeExtractProfile(profile) || DEFAULT_EXTRACT_PROFILE;
  const source = String(input || '');
  if (!source || !fs.existsSync(source)) {
    throw new Error(`Arquivo de origem nao encontrado: ${source}`);
  }

  const target = output || nextAvailableName(defaultAudioOutput(source, profileId));
  if (path.resolve(target) === path.resolve(source)) {
    throw new Error('A saida da extracao nao pode sobrescrever o arquivo original.');
  }

  let firstError = '';
  const modes = profileId === 'm4a' ? ['copy', 'copy-bsf', 'transcode'] : ['copy', 'transcode'];
  for (const mode of modes) {
    onLog?.(`[audio-extract] ${path.basename(source)} -> .${PROFILE_EXT[profileId]} (${mode})`);
    const args = buildExtractArgs({ input: source, output: target, profile: profileId, mode });
    const result = await ffmpegService.run({ args, signal }).promise;
    if (result?.ok && isUsableFile(target)) {
      return { audioPath: target, profile: profileId, transcoded: mode === 'transcode' };
    }
    if (!firstError) firstError = String(result?.stderr || result?.error?.message || '').slice(-400);
    removeQuietly(target);
    if (signal?.aborted) break;
  }

  throw new Error(`FFmpeg nao conseguiu extrair o audio${firstError ? `: ${firstError}` : ''}`);
}
