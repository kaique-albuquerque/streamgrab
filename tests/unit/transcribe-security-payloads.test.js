/**
 * Testes da validação de payloads de transcrição
 * (electron/security-payloads-transcribe.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateTranscribePayload,
  validateTranscribeJobPayload,
} from '../../electron/security-payloads-transcribe.js';

const WIN_PATH = 'C:\\Videos\\aula.mp4';
const POSIX_PATH = '/videos/aula.mp4';
const VIDEO_PATH = process.platform === 'win32' ? WIN_PATH : POSIX_PATH;

test('validateTranscribePayload: payload válido com defaults', () => {
  const out = validateTranscribePayload({ videoPath: VIDEO_PATH });
  assert.ok(out);
  assert.equal(out.videoPath, VIDEO_PATH);
  assert.equal(out.language, 'pt');
  assert.deepEqual(out.formats, ['txt', 'md']);
  assert.equal(out.title, '');
});

test('validateTranscribePayload: formatos e idioma customizados', () => {
  const out = validateTranscribePayload({
    videoPath: VIDEO_PATH,
    language: 'EN',
    formats: ['srt', 'txt', 'txt'],
    title: '  Minha aula  ',
  });
  assert.ok(out);
  assert.equal(out.language, 'en');
  assert.deepEqual(out.formats, ['srt', 'txt']); // deduplicado
  assert.equal(out.title, 'Minha aula');
});

test('validateTranscribePayload: idioma auto aceito', () => {
  const out = validateTranscribePayload({ videoPath: VIDEO_PATH, language: 'auto' });
  assert.ok(out);
  assert.equal(out.language, 'auto');
});

test('validateTranscribePayload: rejeita caminho relativo', () => {
  assert.equal(validateTranscribePayload({ videoPath: 'videos/aula.mp4' }), null);
});

test('validateTranscribePayload: rejeita traversal de path', () => {
  const evil = process.platform === 'win32' ? 'C:\\Videos\\..\\..\\evil.mp4' : '/videos/../../evil.mp4';
  assert.equal(validateTranscribePayload({ videoPath: evil }), null);
});

test('validateTranscribePayload: rejeita extensão não-mídia', () => {
  const exe = process.platform === 'win32' ? 'C:\\app\\setup.exe' : '/app/setup.exe';
  assert.equal(validateTranscribePayload({ videoPath: exe }), null);
});

test('validateTranscribePayload: rejeita idioma inválido', () => {
  assert.equal(validateTranscribePayload({ videoPath: VIDEO_PATH, language: 'pt-BR; rm -rf' }), null);
});

test('validateTranscribePayload: rejeita formatos desconhecidos (todos)', () => {
  assert.equal(validateTranscribePayload({ videoPath: VIDEO_PATH, formats: ['exe', 'php'] }), null);
});

test('validateTranscribePayload: formatações desconhecidas são filtradas', () => {
  const out = validateTranscribePayload({ videoPath: VIDEO_PATH, formats: ['txt', 'exe'] });
  assert.ok(out);
  assert.deepEqual(out.formats, ['txt']);
});

test('validateTranscribePayload: payload não-objeto retorna null', () => {
  assert.equal(validateTranscribePayload(null), null);
  assert.equal(validateTranscribePayload('x'), null);
  assert.equal(validateTranscribePayload(undefined), null);
});

test('validateTranscribeJobPayload: jobId válido', () => {
  assert.deepEqual(validateTranscribeJobPayload({ jobId: 'tr_abc_1' }), { jobId: 'tr_abc_1' });
});

test('validateTranscribeJobPayload: rejeita vazio/caractere inválido/longo demais', () => {
  assert.equal(validateTranscribeJobPayload({ jobId: '' }), null);
  assert.equal(validateTranscribeJobPayload({ jobId: 'abc def' }), null);
  assert.equal(validateTranscribeJobPayload({ jobId: 'a'.repeat(101) }), null);
  assert.equal(validateTranscribeJobPayload({}), null);
});
