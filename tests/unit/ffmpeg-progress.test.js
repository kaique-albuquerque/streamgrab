// Progresso do FFmpeg (HLS/DASH): sem `durationMs` o percentual precisa
// avancar. O parser usa `-progress pipe:1`, que nao informa o total antes do
// fim, entao o percentual e estimado pela taxa de bytes.

import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

import { makeFfmpegProgress } from '../../src/core/engine/helpers/ffmpeg-progress.js';

/** Envia `total_size` a cada segundo, com o tamanho informado. */
function feedSizes(fn, sizes, stepMs = 1000) {
  for (let i = 0; i < sizes.length; i++) {
    fn({ key: 'total_size', value: sizes[i] });
    if (i < sizes.length - 1) mock.timers.tick(stepMs);
  }
}

test('makeFfmpegProgress: sem duracao conhecida o percentual avanca (nao fica em 0)', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const percents = [];
    const fn = makeFfmpegProgress((u) => percents.push(u.percent), 0);
    feedSizes(fn, [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]);

    assert.ok(
      percents.some((p) => p > 0),
      `percentual ficou travado em 0: ${percents.join(',')}`
    );
    assert.ok(Math.max(...percents) < 100, 'sem duracao o percentual nao deve chegar a 100 antes do fim');
  } finally {
    mock.timers.reset();
  }
});

test('makeFfmpegProgress: percentual estimado nunca regride', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const percents = [];
    const fn = makeFfmpegProgress((u) => percents.push(u.percent), 0);
    feedSizes(fn, [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000]);

    const firstPositive = percents.findIndex((p) => p > 0);
    assert.ok(firstPositive !== -1, 'nenhum percentual positivo emitido');
    for (let i = firstPositive + 1; i < percents.length; i++) {
      assert.ok(percents[i] >= percents[i - 1], `regressao: ${percents.join(',')}`);
    }
  } finally {
    mock.timers.reset();
  }
});

test('makeFfmpegProgress: minPercent desloca o progresso (merge nao volta a 0%)', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const percents = [];
    const fn = makeFfmpegProgress((u) => percents.push(u.percent), 0, { minPercent: 90 });
    feedSizes(fn, [0, 1000, 2000, 3000, 4000, 5000]);

    assert.ok(
      percents.every((p) => p >= 90),
      `percentual abaixo do piso 90: ${percents.join(',')}`
    );
    assert.ok(
      percents.every((p) => p <= 100),
      `percentual acima de 100: ${percents.join(',')}`
    );
  } finally {
    mock.timers.reset();
  }
});

test('makeFfmpegProgress: com duracao conhecida usa out_time (determinado)', () => {
  const percents = [];
  const fn = makeFfmpegProgress((u) => percents.push(u.percent), 10_000);
  fn({ key: 'out_time_us', value: 2_500_000 });

  assert.equal(percents.at(-1), 25);
});

// O FFmpeg emite `out_time_us` e `out_time_ms` com o MESMO valor em
// microssegundos (o nome `_ms` e historico). Tratar `out_time_ms` como
// milissegundos fazia 1.1s virar 1.1 milhao de ms -> percentual saturado em
// 100%. Ambos precisam ser divididos por 1000.
test('makeFfmpegProgress: out_time_ms e microssegundos (nao satura em 100%)', () => {
  const percents = [];
  const fn = makeFfmpegProgress((u) => percents.push(u.percent), 12_000);
  fn({ key: 'out_time_ms', value: 1_143_222 });

  assert.equal(percents.at(-1), 9.5, '1143222us = 1.143s de 12s');
});

test('makeFfmpegProgress: out_time_us e out_time_ms nao se sobrescrevem errado', () => {
  const percents = [];
  const fn = makeFfmpegProgress((u) => percents.push(u.percent), 12_000);
  // Ordem real de emissao do FFmpeg.
  fn({ key: 'out_time_us', value: 4_017_052 });
  const afterUs = percents.at(-1);
  fn({ key: 'out_time_ms', value: 4_017_052 });

  assert.equal(afterUs, 33.5);
  assert.equal(percents.at(-1), 33.5, 'mesmo instante nao deve mudar o percentual');
});
