import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CSV_HEADERS,
  exportHistoryAsCsv,
  exportHistoryAsJson,
  escapeCsvValue,
  serializeHistory,
  exportHistoryToFile,
  suggestExportFilename,
} from '../../src/core/history-export.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-export-test-'));
}

function entry(overrides = {}) {
  return {
    id: 'hist-1',
    title: 'Curso JavaScript',
    url: 'https://exemplo.com/a.m3u8',
    provider: 'hls',
    format: 'mp4',
    destination: '/Downloads/curso.mp4',
    status: 'completed',
    size: 524288000,
    durationMs: 3600000,
    date: '2026-09-10T14:30:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

test('exportHistoryAsJson gera array JSON válido', () => {
  const json = exportHistoryAsJson([entry()]);
  const parsed = JSON.parse(json);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Curso JavaScript');
});

test('exportHistoryAsJson com lista vazia gera []', () => {
  assert.equal(exportHistoryAsJson([]), '[]');
});

test('exportHistoryAsJson lida com entrada inválida → []', () => {
  assert.equal(exportHistoryAsJson(null), '[]');
  assert.equal(exportHistoryAsJson(undefined), '[]');
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

test('exportHistoryAsCsv inclui BOM UTF-8', () => {
  const csv = exportHistoryAsCsv([entry()]);
  assert.equal(csv.startsWith('\uFEFF'), true);
});

test('exportHistoryAsCsv inclui cabeçalhos na ordem definida', () => {
  const csv = exportHistoryAsCsv([]);
  const headerLine = csv.replace('\uFEFF', '').split('\n')[0];
  assert.equal(headerLine, CSV_HEADERS.join(','));
});

test('exportHistoryAsCsv escreve uma linha por entrada', () => {
  const csv = exportHistoryAsCsv([entry(), entry({ id: 'hist-2' })]);
  const lines = csv.replace('\uFEFF', '').split('\n');
  assert.equal(lines.length, 3); // header + 2 entradas
});

test('exportHistoryAsCsv escapa vírgulas e aspas (RFC 4180)', () => {
  const csv = exportHistoryAsCsv([entry({ title: 'Aula 1, "Introdução"' })]);
  assert.ok(csv.includes('"Aula 1, ""Introdução"""'));
});

test('exportHistoryAsCsv preserva acentos', () => {
  const csv = exportHistoryAsCsv([entry({ title: 'Introdução à Programação' })]);
  assert.ok(csv.includes('Introdução à Programação'));
});

test('escapeCsvValue cobre aspas, vírgula, quebra de linha e valores nulos', () => {
  assert.equal(escapeCsvValue('simples'), 'simples');
  assert.equal(escapeCsvValue('a,b'), '"a,b"');
  assert.equal(escapeCsvValue('a"b'), '"a""b"');
  assert.equal(escapeCsvValue('a\nb'), '"a\nb"');
  assert.equal(escapeCsvValue(null), '');
  assert.equal(escapeCsvValue(undefined), '');
  assert.equal(escapeCsvValue(0), '0');
});

// ---------------------------------------------------------------------------
// serializeHistory
// ---------------------------------------------------------------------------

test('serializeHistory escolhe o formato correto', () => {
  assert.equal(serializeHistory([entry()], 'csv').startsWith('\uFEFF'), true);
  assert.equal(serializeHistory([entry()], 'json').startsWith('['), true);
  // formato desconhecido cai no JSON
  assert.equal(serializeHistory([entry()], 'xml').startsWith('['), true);
});

// ---------------------------------------------------------------------------
// exportHistoryToFile
// ---------------------------------------------------------------------------

test('exportHistoryToFile escreve CSV no disco', () => {
  const file = path.join(makeTempDir(), 'hist.csv');
  const result = exportHistoryToFile({ entries: [entry()], format: 'csv', filePath: file });

  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.ok(result.size > 0);
  const content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('Curso JavaScript'));
});

test('exportHistoryToFile escreve JSON no disco', () => {
  const file = path.join(makeTempDir(), 'hist.json');
  const result = exportHistoryToFile({ entries: [entry()], format: 'json', filePath: file });

  assert.equal(result.ok, true);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  assert.equal(parsed.length, 1);
});

test('exportHistoryToFile sem filePath retorna erro', () => {
  const result = exportHistoryToFile({ entries: [], format: 'json' });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('exportHistoryToFile com caminho inválido retorna erro (não lança)', () => {
  const result = exportHistoryToFile({
    entries: [],
    format: 'json',
    filePath: path.join(makeTempDir(), 'nao-existe', 'x.json'),
  });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

// ---------------------------------------------------------------------------
// suggestExportFilename
// ---------------------------------------------------------------------------

test('suggestExportFilename usa data ISO e extensão correta', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');
  assert.equal(suggestExportFilename('csv', now), 'streamgrab-historico-2026-09-10.csv');
  assert.equal(suggestExportFilename('json', now), 'streamgrab-historico-2026-09-10.json');
  assert.equal(suggestExportFilename(undefined, now), 'streamgrab-historico-2026-09-10.json');
});
