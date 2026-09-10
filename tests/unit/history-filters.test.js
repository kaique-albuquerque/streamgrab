import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterEntries,
  matchesSearch,
  matchesPeriod,
  matchesStatus,
  sortEntries,
} from '../../electron/renderer/history-filters.js';

function entry(overrides = {}) {
  return {
    id: 'hist-1',
    title: 'Curso JavaScript',
    url: 'https://exemplo.com/a.m3u8',
    provider: 'hls',
    format: 'mp4',
    destination: '/Downloads/curso.mp4',
    status: 'completed',
    size: 1000,
    date: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// matchesSearch
// ---------------------------------------------------------------------------

test('matchesSearch encontra por título (case-insensitive)', () => {
  assert.equal(matchesSearch(entry(), 'JAVASCRIPT'), true);
  assert.equal(matchesSearch(entry(), 'python'), false);
});

test('matchesSearch encontra por url, provider, format e destination', () => {
  assert.equal(matchesSearch(entry(), 'a.m3u8'), true);
  assert.equal(matchesSearch(entry(), 'hls'), true);
  assert.equal(matchesSearch(entry(), 'mp4'), true);
  assert.equal(matchesSearch(entry(), 'curso.mp4'), true);
});

test('matchesSearch com termo vazio aceita tudo', () => {
  assert.equal(matchesSearch(entry(), ''), true);
  assert.equal(matchesSearch(entry(), '   '), true);
});

test('matchesSearch lida com campos ausentes sem lançar', () => {
  assert.equal(matchesSearch({}, 'x'), false);
  assert.equal(matchesSearch(null, 'x'), false);
});

// ---------------------------------------------------------------------------
// matchesPeriod
// ---------------------------------------------------------------------------

test('matchesPeriod "all" aceita qualquer data', () => {
  assert.equal(matchesPeriod(entry({ date: '2000-01-01T00:00:00.000Z' }), 'all'), true);
});

test('matchesPeriod "24h" aceita recentes e rejeita antigos', () => {
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  assert.equal(matchesPeriod(entry({ date: now }), '24h'), true);
  assert.equal(matchesPeriod(entry({ date: old }), '24h'), false);
});

test('matchesPeriod "7d" e "30d" respeitam a janela', () => {
  const in3d = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const in10d = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
  const in60d = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();

  assert.equal(matchesPeriod(entry({ date: in3d }), '7d'), true);
  assert.equal(matchesPeriod(entry({ date: in10d }), '7d'), false);
  assert.equal(matchesPeriod(entry({ date: in10d }), '30d'), true);
  assert.equal(matchesPeriod(entry({ date: in60d }), '30d'), false);
});

test('matchesPeriod com data inválida não exclui a entrada', () => {
  assert.equal(matchesPeriod(entry({ date: 'not-a-date' }), '24h'), true);
});

// ---------------------------------------------------------------------------
// matchesStatus
// ---------------------------------------------------------------------------

test('matchesStatus filtra por status exato', () => {
  assert.equal(matchesStatus(entry({ status: 'failed' }), 'failed'), true);
  assert.equal(matchesStatus(entry({ status: 'failed' }), 'completed'), false);
});

test('matchesStatus "all" aceita qualquer status', () => {
  assert.equal(matchesStatus(entry({ status: 'cancelled' }), 'all'), true);
  assert.equal(matchesStatus(entry({ status: '' }), 'all'), true);
});

// ---------------------------------------------------------------------------
// sortEntries
// ---------------------------------------------------------------------------

test('sortEntries ordena por data desc por padrão', () => {
  const older = entry({ id: 'a', date: '2024-01-01T00:00:00.000Z' });
  const newer = entry({ id: 'b', date: '2025-01-01T00:00:00.000Z' });
  const sorted = sortEntries([older, newer], 'date', 'desc');
  assert.deepEqual(sorted.map((e) => e.id), ['b', 'a']);
});

test('sortEntries ordena por tamanho e título', () => {
  const small = entry({ id: 'a', size: 100, title: 'Zebra' });
  const big = entry({ id: 'b', size: 900, title: 'Abacaxi' });

  assert.deepEqual(sortEntries([small, big], 'size', 'desc').map((e) => e.id), ['b', 'a']);
  assert.deepEqual(sortEntries([small, big], 'title', 'asc').map((e) => e.id), ['b', 'a']);
});

test('sortEntries não muta o array original', () => {
  const list = [entry({ id: 'a', size: 1 }), entry({ id: 'b', size: 2 })];
  const copy = [...list];
  sortEntries(list, 'size', 'asc');
  assert.deepEqual(list.map((e) => e.id), copy.map((e) => e.id));
});

// ---------------------------------------------------------------------------
// filterEntries (integração dos filtros)
// ---------------------------------------------------------------------------

test('filterEntries combina busca + período + status', () => {
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  const list = [
    entry({ id: '1', title: 'Curso JS', status: 'failed', date: now }),
    entry({ id: '2', title: 'Curso Python', status: 'failed', date: now }),
    entry({ id: '3', title: 'Curso JS', status: 'completed', date: now }),
    entry({ id: '4', title: 'Curso JS', status: 'failed', date: old }),
  ];

  const result = filterEntries(list, { search: 'js', period: '7d', status: 'failed' });
  assert.deepEqual(result.map((e) => e.id), ['1']);
});

test('filterEntries sem filtros devolve tudo ordenado por data desc', () => {
  const list = [
    entry({ id: '1', date: '2024-01-01T00:00:00.000Z' }),
    entry({ id: '2', date: '2025-01-01T00:00:00.000Z' }),
  ];
  const result = filterEntries(list, {});
  assert.deepEqual(result.map((e) => e.id), ['2', '1']);
});

test('filterEntries com lista vazia ou inválida devolve []', () => {
  assert.deepEqual(filterEntries([], {}), []);
  assert.deepEqual(filterEntries(null, {}), []);
});
