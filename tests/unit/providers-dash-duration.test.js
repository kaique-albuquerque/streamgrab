// DASH (MPD) declara a duracao em `mediaPresentationDuration` (formato ISO
// 8601). Sem ela o FFmpeg usa estimativa por bytes e a barra fica imprecisa
// — mesmo problema ja corrigido no HLS.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDashManifest } from '../../src/dash.js';
import { dashProvider } from '../../src/providers/dash/index.js';

const MPD = [
  '<?xml version="1.0"?>',
  '<MPD type="static" mediaPresentationDuration="PT1M2.5S">',
  '  <Period>',
  '    <AdaptationSet mimeType="video/mp4" contentType="video">',
  '      <Representation id="v1" bandwidth="1000" width="1280" height="720">',
  '        <BaseURL>video.mp4</BaseURL>',
  '      </Representation>',
  '    </AdaptationSet>',
  '  </Period>',
  '</MPD>',
].join('\n');

test('dash: parseDashManifest expoe durationSeconds de mediaPresentationDuration', () => {
  const parsed = parseDashManifest(MPD, 'https://cdn.example.com/');
  assert.equal(parsed.durationSeconds, 62.5, 'PT1M2.5S = 62.5s');
});

test('dash: o plano de download carrega durationMs do analisado', async () => {
  const media = dashProvider.getFormats({ videoRepresentations: [] });
  assert.equal(media.length, 0);

  const plan = await dashProvider.prepareDownloadPlan({
    url: 'https://cdn.example.com/manifest.mpd',
    headers: {},
    analysis: { durationSeconds: 62.5 },
  });

  assert.equal(plan.kind, 'dash');
  assert.equal(plan.source.durationMs, 62500);
});
