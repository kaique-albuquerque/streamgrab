import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getMacFfmpegUrl } from '../../scripts/ffmpeg-downloads.mjs';

test('getMacFfmpegUrl selects the static binary for each supported macOS architecture', () => {
  assert.equal(
    getMacFfmpegUrl('arm64'),
    'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64'
  );
  assert.equal(
    getMacFfmpegUrl('x64'),
    'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-x64'
  );
});

test('getMacFfmpegUrl rejects unsupported macOS architectures', () => {
  assert.throws(() => getMacFfmpegUrl('ia32'), /Unsupported macOS FFmpeg architecture: ia32/);
});
