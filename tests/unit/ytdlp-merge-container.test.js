/**
 * Testes do mergeOutputFormat do yt-dlp por contêiner.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Captura as opções passadas ao executor do yt-dlp (sem rede, sem processo).
// Mock completo: outros módulos importam binaries.js e precisam dos exports.
const captured = [];
mock.module('../../src/core/binaries.js', {
  namedExports: {
    PROJECT_ROOT: '/proj',
    RESOURCES_PATH_ENV: 'STREAMGRAB_RESOURCES_PATH',
    binName: (b) => b,
    getPackagedResourcesPath: () => '',
    packagedBinaryPath: () => '',
    hasPackagedBinary: () => false,
    getYtDlpExec: async () => async (_url, options) => {
      captured.push(options);
      return {};
    },
    resetYtDlpCache: () => {},
  },
});

test('output .mkv usa mergeOutputFormat mkv', async () => {
  captured.length = 0;
  const { runYtDlpDownload } = await import('../../src/transports/ytdlp-runner.js');
  await runYtDlpDownload({ url: 'https://x/v', formatId: 'best', output: '/out/x.mkv' });
  assert.equal(captured[0].mergeOutputFormat, 'mkv');
});

test('output .mp4 mantem mergeOutputFormat mp4', async () => {
  captured.length = 0;
  const { runYtDlpDownload } = await import('../../src/transports/ytdlp-runner.js');
  await runYtDlpDownload({ url: 'https://x/v', formatId: 'best', output: '/out/x.mp4' });
  assert.equal(captured[0].mergeOutputFormat, 'mp4');
});

test('output sem extensao cai em mp4', async () => {
  captured.length = 0;
  const { runYtDlpDownload } = await import('../../src/transports/ytdlp-runner.js');
  await runYtDlpDownload({ url: 'https://x/v', formatId: 'best', output: '/out/x' });
  assert.equal(captured[0].mergeOutputFormat, 'mp4');
});