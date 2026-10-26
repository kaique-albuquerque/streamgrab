// Unit: executor do yt-dlp sem shell (src/core/ytdlp-exec.js).
//
// Regressao do bug de links do YouTube com query multipla
// (`watch?v=X&list=Y&start_radio=1`): o `youtube-dl-exec` liga `shell: true` no
// Windows quando o caminho do binario tem espacos, e o cmd.exe trata `&` como
// separador de comandos — a URL chegava truncada no yt-dlp. Aqui o `spawn` do
// node:child_process e mockado para congelar o contrato: argv em array e
// `shell: false` sempre.

import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { EventEmitter } from 'node:events';

const spawnCalls = [];
let nextResult = { stdout: '', stderr: '', code: 0, error: null };

function fakeSpawn(bin, argv, opts) {
  spawnCalls.push({ bin, argv, opts });
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  setImmediate(() => {
    if (nextResult.stdout) child.stdout.emit('data', nextResult.stdout);
    if (nextResult.stderr) child.stderr.emit('data', nextResult.stderr);
    if (nextResult.error) child.emit('error', nextResult.error);
    else child.emit('close', nextResult.code);
  });
  return child;
}

mock.module('node:child_process', { namedExports: { spawn: fakeSpawn } });

const { createYtDlpExec } = await import('../../src/core/ytdlp-exec.js');

// caminho real do binario empacotado: tem espaco no perfil do usuario, que e o
// gatilho do `shell: true` no youtube-dl-exec.
const BIN = 'C:\\Users\\Kaique Dias\\AppData\\Local\\Programs\\streamgrab\\resources\\bin\\yt-dlp.exe';
const URL_WITH_PLAYLIST = 'https://www.youtube.com/watch?v=RCnrr3himSc&list=RDRCnrr3himSc&start_radio=1';

const buildArgs = (flags) => Object.entries(flags).map(([key, value]) => `--${key}=${value}`);

function reset() {
  spawnCalls.length = 0;
  nextResult = { stdout: '', stderr: '', code: 0, error: null };
}

test('createYtDlpExec: exige binPath e buildArgs', () => {
  assert.throws(() => createYtDlpExec('', { buildArgs }), TypeError);
  assert.throws(() => createYtDlpExec(BIN, {}), TypeError);
});

test('createYtDlpExec: URL com & chega como um unico argv e sem shell', async () => {
  reset();
  nextResult.stdout = '{"id":"RCnrr3himSc"}';

  const ytDlp = createYtDlpExec(BIN, { buildArgs });
  const info = await ytDlp(URL_WITH_PLAYLIST, { noPlaylist: true, dumpSingleJson: true });

  assert.equal(spawnCalls.length, 1);
  const [call] = spawnCalls;
  assert.equal(call.bin, BIN);
  assert.equal(call.opts.shell, false, 'com shell o cmd.exe corta a URL no &');
  assert.equal(call.opts.windowsHide, true);
  assert.deepEqual(call.argv, [
    URL_WITH_PLAYLIST,
    '--noPlaylist=true',
    '--dumpSingleJson=true',
  ]);
  assert.equal(info.id, 'RCnrr3himSc');
});

test('createYtDlpExec: stdout JSON vira objeto e texto vira string', async () => {
  const ytDlp = createYtDlpExec(BIN, { buildArgs });

  reset();
  nextResult.stdout = '{"id":"abc"}';
  assert.deepEqual(await ytDlp('https://x/1', {}), { id: 'abc' });

  reset();
  nextResult.stdout = 'https://cdn.example.com/v.mp4\n';
  assert.equal(await ytDlp('https://x/2', {}), 'https://cdn.example.com/v.mp4\n');
});

test('createYtDlpExec: exit != 0 rejeita com stderr e exitCode', async () => {
  reset();
  nextResult.code = 2;
  nextResult.stderr = "ERROR: 'list' nao e reconhecido como um comando interno";

  const ytDlp = createYtDlpExec(BIN, { buildArgs });
  await assert.rejects(ytDlp(URL_WITH_PLAYLIST, {}), (err) => {
    assert.equal(err.exitCode, 2);
    assert.match(err.stderr, /list/);
    return true;
  });
});

test('createYtDlpExec: erro de spawn vira rejeicao com stderr', async () => {
  reset();
  nextResult.error = new Error('spawn ENOENT');

  const ytDlp = createYtDlpExec(BIN, { buildArgs });
  await assert.rejects(ytDlp('https://x/3', {}), (err) => {
    assert.match(err.stderr, /ENOENT/);
    return true;
  });
});

test('createYtDlpExec: .exec expoe o child para cancelamento', async () => {
  reset();

  const ytDlp = createYtDlpExec(BIN, { buildArgs });
  const promise = ytDlp.exec('https://x/4', {});
  assert.equal(typeof promise.child.kill, 'function');

  promise.child.kill();
  assert.equal(promise.child.killed, true);
  await promise;
});
