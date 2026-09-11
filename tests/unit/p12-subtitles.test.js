/**
 * P12 — Testes de multi-audio e legendas
 *
 * Cobertura:
 *  - HLS: parse #EXT-X-MEDIA (audio + subtitles)
 *  - DASH: lang attribute em AdaptationSets
 *  - yt-dlp runner: subtitle flags
 *  - Engine: wiring de subtitleLanguages/embedSubs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePlaylistText } from '../../src/hls.js';
import { parseDashManifest } from '../../src/dash.js';

// ---------------------------------------------------------------------------
// HLS — #EXT-X-MEDIA parsing
// ---------------------------------------------------------------------------

test('HLS: parse audio tracks from #EXT-X-MEDIA', () => {
  const text = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"
stream_720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2",AUDIO="audio"
stream_360.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Portugues",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="pt",URI="audio_pt.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="en",URI="audio_en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Legendas PT",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="pt",URI="subs_pt.vtt"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English subs",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="en",URI="subs_en.vtt"`;

  const result = parsePlaylistText(text, 'https://example.com/master.m3u8');
  assert.equal(result.kind, 'master');
  assert.equal(result.variants.length, 2);

  // Audio tracks
  assert.ok(Array.isArray(result.audioTracks), 'audioTracks should be an array');
  assert.equal(result.audioTracks.length, 2);
  assert.equal(result.audioTracks[0].language, 'pt');
  assert.equal(result.audioTracks[0].name, 'Portugues');
  assert.equal(result.audioTracks[0].default, true);
  assert.equal(result.audioTracks[0].uri, 'audio_pt.m3u8');
  assert.equal(result.audioTracks[1].language, 'en');
  assert.equal(result.audioTracks[1].name, 'English');
  assert.equal(result.audioTracks[1].default, false);

  // Subtitle tracks
  assert.ok(Array.isArray(result.subtitleTracks), 'subtitleTracks should be an array');
  assert.equal(result.subtitleTracks.length, 2);
  assert.equal(result.subtitleTracks[0].language, 'pt');
  assert.equal(result.subtitleTracks[0].name, 'Legendas PT');
  assert.equal(result.subtitleTracks[0].default, true);
  assert.equal(result.subtitleTracks[0].uri, 'subs_pt.vtt');
  assert.equal(result.subtitleTracks[1].language, 'en');
  assert.equal(result.subtitleTracks[1].uri, 'subs_en.vtt');
});

test('HLS: no #EXT-X-MEDIA returns empty audioTracks/subtitleTracks', () => {
  const text = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720
stream_720.m3u8`;

  const result = parsePlaylistText(text);
  assert.equal(result.kind, 'master');
  assert.deepEqual(result.audioTracks, []);
  assert.deepEqual(result.subtitleTracks, []);
});

test('HLS: #EXT-X-MEDIA without URI attribute still captured', () => {
  const text = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720,AUDIO="audio"
stream_720.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Default",DEFAULT=YES,LANGUAGE="und"`;

  const result = parsePlaylistText(text);
  assert.equal(result.audioTracks.length, 1);
  assert.equal(result.audioTracks[0].uri, null);
  assert.equal(result.audioTracks[0].language, 'und');
});

test('HLS: media playlist returns empty arrays', () => {
  const text = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment001.ts`;

  const result = parsePlaylistText(text);
  assert.equal(result.kind, 'media');
  assert.deepEqual(result.audioTracks, []);
  assert.deepEqual(result.subtitleTracks, []);
});

// ---------------------------------------------------------------------------
// DASH — @lang extraction
// ---------------------------------------------------------------------------

test('DASH: extract lang from AdaptationSet', () => {
  const text = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet id="1" contentType="video" mimeType="video/mp4" codecs="avc1.640028">
      <Representation id="v1" bandwidth="1000000" width="1280" height="720"></Representation>
    </AdaptationSet>
    <AdaptationSet id="2" contentType="audio" mimeType="audio/mp4" codecs="mp4a.40.2" lang="pt">
      <Representation id="a1" bandwidth="128000"></Representation>
    </AdaptationSet>
    <AdaptationSet id="3" contentType="audio" mimeType="audio/mp4" codecs="mp4a.40.2" lang="en">
      <Representation id="a2" bandwidth="128000"></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

  const result = parseDashManifest(text);
  assert.equal(result.kind, 'dash');
  assert.equal(result.videoRepresentations.length, 1);
  assert.equal(result.audioRepresentations.length, 2);
  assert.equal(result.audioRepresentations[0].lang, 'pt');
  assert.equal(result.audioRepresentations[1].lang, 'en');
  // Video should have empty lang (not specified)
  assert.equal(result.videoRepresentations[0].lang, '');
});

test('DASH: audio without lang attribute gets empty string', () => {
  const text = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet id="1" contentType="audio" mimeType="audio/mp4">
      <Representation id="a1" bandwidth="128000"></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

  const result = parseDashManifest(text);
  assert.equal(result.audioRepresentations.length, 1);
  assert.equal(result.audioRepresentations[0].lang, '');
});

// ---------------------------------------------------------------------------
// yt-dlp runner — subtitle flags
// ---------------------------------------------------------------------------

test('yt-dlp runner: accepts subtitleLanguages and embedSubs params', async () => {
  const { runYtDlpDownload } = await import('../../src/transports/ytdlp-runner.js');

  // Should throw about missing url (not about unexpected params)
  await assert.rejects(
    () => runYtDlpDownload({ output: '/tmp/test.mp4', subtitleLanguages: ['pt', 'en'], embedSubs: true }),
    (err) => {
      assert.ok(err instanceof TypeError);
      assert.ok(err.message.includes('url e obrigatoria'));
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Engine wiring — subtitleLanguages/embedSubs in _runJob
// ---------------------------------------------------------------------------

test('Engine: _runJob passes subtitleLanguages and embedSubs to prepare', async () => {
  const { DownloadEngine } = await import('../../src/core/engine/index.js');

  let capturedPrepareArgs = null;
  const mockExecutor = {
    analyze: async () => ({ kind: 'master', variants: [], audioTracks: [], subtitleTracks: [] }),
    prepare: async (adapter, args) => {
      capturedPrepareArgs = args;
      return { strategy: 'stream', downloadUrl: 'https://example.com/video.mp4', totalBytes: 0 };
    },
    run: async () => ({ ok: true }),
  };

  const engine = new DownloadEngine({
    executor: mockExecutor,
    resolveAdapter: async () => ({ id: 'hls', analyze: mockExecutor.analyze, prepareDownload: mockExecutor.prepare }),
  });

  const job = engine.enqueue('https://example.com/master.m3u8', {
    meta: { subtitleLanguages: ['pt', 'en'], embedSubs: true, audioLanguage: 'pt', allAudio: false },
  });

  await engine.run(job.id, { subtitleLanguages: ['pt', 'en'], embedSubs: true, audioLanguage: 'pt', allAudio: false });

  assert.ok(capturedPrepareArgs, 'prepare should have been called');
  assert.deepEqual(capturedPrepareArgs.subtitleLanguages, ['pt', 'en']);
  assert.equal(capturedPrepareArgs.embedSubs, true);
  assert.equal(capturedPrepareArgs.audioLanguage, 'pt');
  assert.equal(capturedPrepareArgs.allAudio, false);
});

test('Engine: _runJob defaults subtitleLanguages to empty array', async () => {
  const { DownloadEngine } = await import('../../src/core/engine/index.js');

  let capturedPrepareArgs = null;
  const mockExecutor = {
    analyze: async () => ({ kind: 'master', variants: [], audioTracks: [], subtitleTracks: [] }),
    prepare: async (adapter, args) => {
      capturedPrepareArgs = args;
      return { strategy: 'stream', downloadUrl: 'https://example.com/video.mp4', totalBytes: 0 };
    },
    run: async () => ({ ok: true }),
  };

  const engine = new DownloadEngine({
    executor: mockExecutor,
    resolveAdapter: async () => ({ id: 'hls', analyze: mockExecutor.analyze, prepareDownload: mockExecutor.prepare }),
  });

  const job = engine.enqueue('https://example.com/master.m3u8', { meta: {} });
  await engine.run(job.id);

  assert.ok(capturedPrepareArgs, 'prepare should have been called');
  assert.deepEqual(capturedPrepareArgs.subtitleLanguages, []);
  assert.equal(capturedPrepareArgs.embedSubs, false);
});
