/**
 * Testes dos args de mux por contêiner (MP4 x MKV).
 *
 * Existem quatro emissores independentes de `-movflags`: buildMuxArgs e
 * MODES[2] (ffmpeg/muxer.js), runMuxMultiDownload (engine) e
 * buildMuxMultiArgs (CLI). Os testes cobrem os puros; o inline é coberto
 * pela verificação manual da Task 7 e pelo comportamento de resolveOutput.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMuxArgs, MODES } from '../../src/ffmpeg/muxer.js';
import { buildMuxMultiArgs } from '../../src/cli/download/mux-multi-args.js';

test('buildMuxArgs com .mp4 mantem -movflags +faststart', () => {
  const args = buildMuxArgs({ videoInput: 'v.mp4', audioInput: 'a.m4a', output: '/out/x.mp4' });
  assert.ok(args.includes('-movflags'));
  assert.equal(args[args.indexOf('-movflags') + 1], '+faststart');
});

test('buildMuxArgs com .mkv NAO emite -movflags', () => {
  const args = buildMuxArgs({ videoInput: 'v.mp4', audioInput: 'a.m4a', output: '/out/x.mkv' });
  assert.equal(args.includes('-movflags'), false, args.join(' '));
});

test('buildMuxArgs preserva -c copy nos dois', () => {
  for (const out of ['/out/x.mp4', '/out/x.mkv']) {
    const args = buildMuxArgs({ videoInput: 'v.mp4', audioInput: 'a.m4a', output: out });
    assert.equal(args[args.indexOf('-c:v') + 1], 'copy');
    assert.equal(args[args.indexOf('-c:a') + 1], 'copy');
  }
});

test('MODES nao carrega -movflags fixo (entra por buildDownloadArgs)', () => {
  for (const mode of MODES) {
    assert.equal(mode.args.includes('-movflags'), false, `${mode.name} tem -movflags fixo`);
  }
});

test('buildMuxMultiArgs com .mkv NAO emite -movflags', () => {
  const args = buildMuxMultiArgs({
    videoTmp: 'v.mp4',
    audioTmps: ['a0.m4a'],
    audioLanguages: ['pt'],
    output: '/out/x.mkv',
  });
  assert.equal(args.includes('-movflags'), false, args.join(' '));
});

test('buildMuxMultiArgs com .mp4 mantem -movflags', () => {
  const args = buildMuxMultiArgs({ videoTmp: 'v.mp4', audioTmps: ['a0.m4a'], output: '/out/x.mp4' });
  assert.ok(args.includes('-movflags'));
});