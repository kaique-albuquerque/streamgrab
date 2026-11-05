// P13 — Extração de áudio (M4A/MP3) para formatos de nuvem. Unit, sem FFmpeg.
//
// Cobre: normalização do perfil, args de copy/transcode, caminho de saída
// derivado e o passo de pós-download do engine e do cli-flow (com extract
// injetado, sem binário real).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_EXTRACT_PROFILE,
  buildExtractArgs,
  defaultAudioOutput,
  normalizeExtractProfile,
} from '../../src/ffmpeg/audio-extract.js';
import { processAudioExtract } from '../../src/core/engine/lifecycle/audio-extract.js';
import { maybeExtractAudio } from '../../src/cli-flow/extract-audio.js';
import { parseDownloadFlags } from '../../src/cli/commands/flags.js';
import { buildDownloadArgv } from '../../src/cli/commands/download.js';

function tmpFile(name, content = 'ts-bytes') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-audio-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

function fakeEngine() {
  const logs = [];
  return { logs, settings: { get: () => 'off' }, _active: new Map(), _emit: (n, p) => logs.push(p.message) };
}

test('extract: normalizeExtractProfile mapeia valores ligados/desligados', () => {
  assert.equal(normalizeExtractProfile('off'), null);
  assert.equal(normalizeExtractProfile(''), null);
  assert.equal(normalizeExtractProfile(false), null);
  assert.equal(normalizeExtractProfile(true), DEFAULT_EXTRACT_PROFILE);
  assert.equal(normalizeExtractProfile('MP3'), 'mp3');
  assert.equal(normalizeExtractProfile('m4a'), 'm4a');
  assert.equal(normalizeExtractProfile('flac'), DEFAULT_EXTRACT_PROFILE);
});

test('extract: copy mantem codec e copy-bsf aplica aac_adtstoasc no M4A', () => {
  const copy = buildExtractArgs({ input: 'in.ts', output: 'out.m4a', profile: 'm4a', mode: 'copy' });
  assert.deepEqual(copy.slice(-6), ['-vn', '-c:a', 'copy', '-movflags', '+faststart', 'out.m4a']);
  assert.equal(copy.includes('aac_adtstoasc'), false);
  assert.equal(copy[copy.indexOf('-i') + 1], 'in.ts');

  const bsf = buildExtractArgs({ input: 'in.ts', output: 'out.m4a', profile: 'm4a', mode: 'copy-bsf' });
  assert.deepEqual(bsf.slice(-8), ['-vn', '-c:a', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', 'out.m4a']);
});

test('extract: transcode usa o codec do perfil', () => {
  const args = buildExtractArgs({ input: 'in.ts', output: 'out.mp3', profile: 'mp3', mode: 'transcode' });
  assert.equal(args.includes('libmp3lame'), true);
  assert.equal(args.includes('copy'), false);
  assert.equal(args.at(-1), 'out.mp3');
});

test('extract: defaultAudioOutput troca apenas a extensao', () => {
  assert.equal(defaultAudioOutput(path.join('a', 'b', 'aula01.ts'), 'm4a'), path.join('a', 'b', 'aula01.m4a'));
  assert.equal(defaultAudioOutput('aula01.ts', 'mp3'), 'aula01.mp3');
});

test('engine: processAudioExtract ignora quando desligado', async () => {
  const engine = fakeEngine();
  let called = false;
  const file = tmpFile('aula.ts');
  await processAudioExtract(engine, { id: '1', meta: { output: file } }, { audioExtract: 'off', extract: () => { called = true; } });
  assert.equal(called, false);
  assert.equal(fs.existsSync(file), true);
});

test('engine: processAudioExtract troca a saida e remove o original', async () => {
  const engine = fakeEngine();
  const file = tmpFile('aula.ts');
  const audio = file.replace(/\.ts$/, '.m4a');
  fs.writeFileSync(audio, 'm4a-bytes');
  const job = { id: '1', meta: { output: file } };
  await processAudioExtract(engine, job, {
    audioExtract: 'm4a',
    extract: async () => ({ audioPath: audio, transcoded: false }),
  });
  assert.equal(job.meta.output, audio);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(audio), true);
});

test('engine: falha na extracao preserva o original', async () => {
  const engine = fakeEngine();
  const file = tmpFile('aula.ts');
  const job = { id: '1', meta: { output: file } };
  await processAudioExtract(engine, job, {
    audioExtract: 'm4a',
    extract: async () => { throw new Error('boom'); },
  });
  assert.equal(job.meta.output, file);
  assert.equal(fs.existsSync(file), true);
  assert.equal(engine.logs.some((m) => m.includes('boom')), true);
});

test('cli-flow: maybeExtractAudio devolve o audio e remove o original', async () => {
  const file = tmpFile('aula.ts');
  const audio = file.replace(/\.ts$/, '.m4a');
  fs.writeFileSync(audio, 'm4a-bytes');
  const finalPath = await maybeExtractAudio({
    output: file,
    profile: 'm4a',
    safeIo: { log: () => {} },
    extract: async () => ({ audioPath: audio, transcoded: true }),
  });
  assert.equal(finalPath, audio);
  assert.equal(fs.existsSync(file), false);
});

test('cli: --extract-audio vira m4a por padrao e aceita mp3', () => {
  assert.equal(parseDownloadFlags(['--extract-audio']).extractAudio, 'm4a');
  assert.equal(parseDownloadFlags(['--extract-audio', 'mp3']).extractAudio, 'mp3');
  assert.equal(parseDownloadFlags(['--extract-audio', '--turbo']).extractAudio, 'm4a');
  assert.equal(parseDownloadFlags(['--turbo']).extractAudio, '');
});

test('cli: buildDownloadArgv repassa --extract-audio ao cli-flow', () => {
  const argv = buildDownloadArgv({ options: { extractAudio: 'mp3' } });
  assert.deepEqual(argv.slice(-2), ['--extract-audio', 'mp3']);
});

test('cli-flow: maybeExtractAudio mantem o original quando desligado', async () => {
  const file = tmpFile('aula.ts');
  const finalPath = await maybeExtractAudio({ output: file, profile: 'off', safeIo: { log: () => {} } });
  assert.equal(finalPath, file);
  assert.equal(fs.existsSync(file), true);
});
