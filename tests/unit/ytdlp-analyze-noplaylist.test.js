// Regressao: links do YouTube com parametros de playlist/radio
// (`&list=...`, `?list=...`, `start_radio=1`) faziam o yt-dlp enumerar a
// playlist inteira no `--dump-single-json`, entao a analise nunca terminava
// (radio mix e praticamente infinita). O fix e `--no-playlist` na analise,
// igual ao que o runner de download ja fazia.
//
// Sem rede: o executor do yt-dlp (src/core/binaries.js) e mockado e expoe as
// opcoes recebidas.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIXTURE = {
  id: 'RCnrr3himSc',
  title: 'Forever Young',
  duration: 200,
  formats: [
    { format_id: '18', vcodec: 'avc1', acodec: 'mp4a', url: 'https://example.com/prog.mp4', height: 360 },
    { format_id: '137', vcodec: 'avc1', acodec: 'none', url: 'https://example.com/v.mp4', height: 1080 },
    { format_id: '140', vcodec: 'none', acodec: 'mp4a', url: 'https://example.com/a.m4a' },
  ],
};

let lastCall = null;

const BINARIES_URL = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'core', 'binaries.js')
).href;
const realBinaries = await import(BINARIES_URL);

const fakeYtDlp = async (...args) => {
  lastCall = args;
  return FIXTURE;
};

mock.module(BINARIES_URL, {
  namedExports: { ...realBinaries, getYtDlpExec: async () => fakeYtDlp },
});

const WATCH_WITH_PLAYLIST = 'https://www.youtube.com/watch?v=RCnrr3himSc&list=RDRCnrr3himSc&start_radio=1';
const SHORT_WITH_PLAYLIST = 'https://youtu.be/RCnrr3himSc?list=RDRCnrr3himSc';

test('ytdlp analyze: sempre desativa enumeracao de playlist (evita enumerar radio mix)', async () => {
  const mod = await import(`../../src/adapters/ytdlp.js?noplaylist=${Date.now()}`);

  lastCall = null;
  await mod.analyzeYtDlpUrl(WATCH_WITH_PLAYLIST);

  assert.ok(lastCall, 'yt-dlp deveria ter sido chamado');
  const [url, options] = lastCall;
  assert.equal(url, WATCH_WITH_PLAYLIST);
  assert.equal(options.noPlaylist, true, 'falta --no-playlist: o yt-dlp enumera a playlist e a analise nao termina');
});

test('ytdlp analyze: link curto youtu.be com ?list= tambem desativa playlist', async () => {
  const mod = await import(`../../src/adapters/ytdlp.js?noplaylist-curto=${Date.now()}`);

  lastCall = null;
  await mod.analyzeYtDlpUrl(SHORT_WITH_PLAYLIST);

  assert.ok(lastCall, 'yt-dlp deveria ter sido chamado');
  assert.equal(lastCall[1].noPlaylist, true);
  assert.equal(lastCall[1].dumpSingleJson, true);
});
