/**
 * Testes da formatação de transcrição (src/transcribe/format.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  formatTxt,
  formatMd,
  formatSrt,
  writeTranscription,
  titleFromVideoPath,
} from '../../src/transcribe/format.js';

const SEGMENTS = [
  { index: 1, startMs: 0, endMs: 2500, text: 'Olá, mundo' },
  { index: 2, startMs: 2500, endMs: 61_000, text: 'Bem-vindo ao StreamGrab' },
  { index: 3, startMs: 61_000, endMs: 95_000, text: '[Musica] Transcrição automática' },
];

test('formatTxt: título + texto limpo sem marcações de música', () => {
  const out = formatTxt({ text: 'Fala [Musica] galera [Risadas] tudo bem?', title: 'Aula 1' });
  assert.match(out, /^Aula 1\n/);
  assert.match(out, /Fala galera tudo bem\?/);
  assert.doesNotMatch(out, /\[Musica\]/);
  assert.doesNotMatch(out, /\[Risadas\]/);
});

test('formatMd: parágrafos com timestamp por minuto', () => {
  const out = formatMd({ segments: SEGMENTS, title: 'Aula 1' });
  assert.match(out, /^# Aula 1\n/);
  assert.match(out, /\*\*\[00:00\]\*\* Olá, mundo/);
  // segmento do minuto 1 agrupa sob novo timestamp
  assert.match(out, /\*\*\[01:01\]\*\*/);
  // marcação de música removida
  assert.doesNotMatch(out, /\[Musica\]/);
});

test('formatMd: sem segmentos gera nota informativa', () => {
  const out = formatMd({ segments: [], title: 'X' });
  assert.match(out, /Nenhum segmento/);
});

test('formatSrt: timestamps no padrão SRT', () => {
  const out = formatSrt({ segments: SEGMENTS });
  assert.match(out, /1\n00:00:00,000 --> 00:00:02,500\nOlá, mundo/);
  assert.match(out, /00:01:01,000 --> 00:01:35,000/);
});

test('titleFromVideoPath: normaliza underscores e hífens', () => {
  assert.equal(titleFromVideoPath('/videos/aula_01-whisper.mp4'), 'aula 01 whisper');
});

test('writeTranscription: gera txt/md/srt ao lado do vídeo', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-transcribe-'));
  try {
    const videoPath = path.join(tmp, 'meu-video.mp4');
    fs.writeFileSync(videoPath, 'fake');

    const { files } = await writeTranscription({
      videoPath,
      text: 'Conteúdo da transcrição',
      segments: SEGMENTS,
      title: 'Meu Vídeo',
      formats: ['txt', 'md', 'srt'],
    });

    assert.equal(files.length, 3);
    for (const file of files) {
      assert.ok(fs.existsSync(file.path), `arquivo deveria existir: ${file.path}`);
      assert.ok(file.size > 0);
    }
    const txt = fs.readFileSync(path.join(tmp, 'meu-video.transcription.txt'), 'utf8');
    assert.match(txt, /Conteúdo da transcrição/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
