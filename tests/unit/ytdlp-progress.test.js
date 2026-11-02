// Unit: parser de progresso do yt-dlp (src/transports/ytdlp-progress.js).
//
// Contexto: o caminho do YouTube usa o yt-dlp direto e o runner so chamava
// onProgress uma vez, no final (percent: 100) — por isso a barra ficava em 0%
// durante todo o download. O yt-dlp imprime progresso real no stdout
// (`[download]  53.3% of   30.00MiB at 997.60MiB/s ETA 00:00`); aqui fixamos o
// contrato do parser que transforma essas linhas em updates de progresso.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createYtDlpProgressReporter } from '../../src/transports/ytdlp-progress.js';

const MIB = 1024 ** 2;

function collect() {
  const events = [];
  const reporter = createYtDlpProgressReporter((update) => events.push(update));
  return { events, reporter };
}

// Sequencia real de um download adaptativo do YouTube (video + audio + merge).
const TWO_STREAMS = [
  '[youtube] Extracting URL: https://www.youtube.com/watch?v=abc',
  '[youtube] abc: Downloading webpage',
  '[info] abc: Downloading 1 format(s): 137+140',
  '[download] Destination: C:\\out\\video.f137.mp4',
  '[download]   0.0% of   30.00MiB at  Unknown B/s ETA Unknown',
  '[download]  50.0% of   30.00MiB at    5.00MiB/s ETA 00:03',
  '[download] 100% of   30.00MiB in 00:00:06 at 5.00MiB/s',
  '[download] Destination: C:\\out\\video.f140.m4a',
  '[download]   0.0% of    3.00MiB at  Unknown B/s ETA Unknown',
  '[download] 100% of    3.00MiB in 00:00:01 at 3.00MiB/s',
  '[Merger] Merging formats into "C:\\out\\video.mp4"',
  'Deleting original file C:\\out\\video.f137.mp4 (pass -k to keep)',
];

const percents = (events) => events.map((e) => e.percent).filter((p) => p != null);

test('createYtDlpProgressReporter: exige callback', () => {
  assert.throws(() => createYtDlpProgressReporter(), TypeError);
});

test('createYtDlpProgressReporter: emite progresso intermediario (nao so 100 no fim)', () => {
  const { events, reporter } = collect();
  reporter.push(`${TWO_STREAMS.join('\r\n')}\r\n`);

  const values = percents(events);
  assert.ok(values.some((p) => p > 0 && p < 100), 'deve haver percentual intermediario');
  assert.equal(values.at(-1), 100, 'ultimo percentual deve ser 100');

  const growing = values.every((p, i) => i === 0 || p >= values[i - 1]);
  assert.ok(growing, `percentual nunca deve regredir: ${values.join(', ')}`);
});

test('createYtDlpProgressReporter: agrega dois streams em um unico percentual', () => {
  const { events, reporter } = collect();
  reporter.push(`${TWO_STREAMS.join('\n')}\n`);

  // video (30MiB) a 50% => metade do 1o de 2 streams => 25% do total.
  const half = events.find((e) => e.percent === 25);
  assert.ok(half, 'metade do primeiro stream deve valer 25% do total');
  assert.equal(half.totalBytes, 30 * MIB);
  assert.equal(half.bytesDownloaded, 15 * MIB);
  assert.equal(half.speed, 5 * MIB, 'speed do yt-dlp vira bytes/s');
  assert.equal(half.etaSeconds, 3);
  assert.equal(half.stage, 'downloading');
});

test('createYtDlpProgressReporter: stream unico mapeia 0..100 direto', () => {
  const { events, reporter } = collect();
  reporter.push(`${[
    '[info] abc: Downloading 1 format(s): 18',
    '[download] Destination: C:\\out\\video.mp4',
    '[download]  10.0% of   10.00MiB at    1.00MiB/s ETA 00:09',
    '[download] 100% of   10.00MiB in 00:00:10 at 1.00MiB/s',
  ].join('\n')}\n`);

  assert.deepEqual(percents(events), [10, 100]);
});

test('createYtDlpProgressReporter: linha de merge vira stage=merging', () => {
  const { events, reporter } = collect();
  reporter.push(`${TWO_STREAMS.join('\n')}\n`);

  const merging = events.find((e) => e.stage === 'merging');
  assert.ok(merging, 'a linha [Merger] deve marcar a fase de merge');
  assert.equal(merging.percent, 100);
  assert.match(merging.message, /Juntando/i);
});

test('createYtDlpProgressReporter: avisa quando troca de stream', () => {
  const { events, reporter } = collect();
  reporter.push(`${TWO_STREAMS.join('\n')}\n`);

  const messages = events.filter((e) => e.stage === 'downloading' && e.message).map((e) => e.message);
  assert.equal(messages.length, 2, 'uma mensagem por stream, sem spam de log');
  assert.match(messages[0], /1 de 2/);
  assert.match(messages[1], /2 de 2/);
});

test('createYtDlpProgressReporter: chunk cortado no meio da linha nao quebra o parse', () => {
  const whole = `${TWO_STREAMS.join('\r\n')}\r\n`;
  const { events, reporter } = collect();
  for (let i = 0; i < whole.length; i += 7) reporter.push(whole.slice(i, i + 7));

  assert.deepEqual(percents(events), percents(collectFrom(whole)));
  assert.equal(percents(events).at(-1), 100);
});

test('createYtDlpProgressReporter: aceita updates separados por \\r (sem --newline)', () => {
  const { events, reporter } = collect();
  reporter.push(
    '[download]  10.0% of   10.00MiB at    1.00MiB/s ETA 00:09' +
    '\r[download]  20.0% of   10.00MiB at    1.00MiB/s ETA 00:08\r',
  );

  assert.deepEqual(percents(events), [10, 20]);
});

test('createYtDlpProgressReporter: tamanho desconhecido nao derruba o percentual', () => {
  const { events, reporter } = collect();
  reporter.push('[download]  12.3% of  Unknown at  Unknown B/s ETA Unknown\n');

  assert.deepEqual(percents(events), [12.3]);
  assert.equal(events[0].totalBytes, undefined);
  assert.equal(events[0].bytesDownloaded, undefined);
});

test('createYtDlpProgressReporter: fragmentos HLS/DASH com ~ no tamanho', () => {
  const { events, reporter } = collect();
  reporter.push('[download]  45.2% of ~  12.34MiB at    1.20MiB/s ETA 00:05 (frag 12/30)\n');

  assert.deepEqual(percents(events), [45.2]);
  assert.equal(events[0].totalBytes, Math.round(12.34 * MIB));
  assert.equal(events[0].speed, Math.round(1.2 * MIB));
});

test('createYtDlpProgressReporter: linhas irrelevantes sao ignoradas', () => {
  const { events, reporter } = collect();
  reporter.push('[youtube] abc: Downloading webpage\nDeleting original file x (pass -k to keep)\n');

  assert.deepEqual(events, []);
});

function collectFrom(text) {
  const events = [];
  const reporter = createYtDlpProgressReporter((update) => events.push(update));
  reporter.push(text);
  return events;
}
