/**
 * YouTube — DASH/HLS manifest variant builder.
 */

import { fetchDashManifest } from '../../dash.js';
import { fetchPlaylist } from '../../hls.js';
import { buildYouTubeRequestHeaders } from './headers.js';
import { sortVariants } from './formats.js';

function makeVariant(uri, rep, sourceKind) {
  return {
    uri,
    resolution: rep.height ? `${rep.height}p` : rep.resolution || 'auto',
    width: rep.width || 0,
    height: rep.height || 0,
    bandwidth: rep.bandwidth || 0,
    codecs: rep.codecs || '',
    sourceKind,
  };
}

const FALLBACK_AUTO = (kind) => ({
  uri: `youtube-manifest:${kind}:auto`,
  resolution: `Auto (${kind.toUpperCase()})`,
  width: 0, height: 0, bandwidth: 0, codecs: '',
  sourceKind: `manifest-${kind}`,
});

export async function buildManifestVariants(streamingData, headers) {
  const variants = [];
  const seen = new Set();
  const pushVariant = (v) => {
    if (!v?.uri || seen.has(v.uri)) return;
    seen.add(v.uri);
    variants.push(v);
  };

  if (streamingData?.dashManifestUrl) {
    try {
      const dashInfo = await fetchDashManifest(
        streamingData.dashManifestUrl, buildYouTubeRequestHeaders(headers)
      );
      for (const rep of dashInfo.videoRepresentations || []) {
        pushVariant(makeVariant(
          `youtube-manifest:dash:${rep.id || rep.height || rep.bandwidth || 'auto'}`,
          rep, 'manifest-dash'
        ));
      }
    } catch {
      pushVariant(FALLBACK_AUTO('dash'));
    }
  }

  if (streamingData?.hlsManifestUrl) {
    try {
      const hlsInfo = await fetchPlaylist(
        streamingData.hlsManifestUrl, buildYouTubeRequestHeaders(headers)
      );
      if (hlsInfo?.kind === 'master') {
        for (const v of hlsInfo.variants || []) {
          pushVariant(makeVariant(
            `youtube-manifest:hls:${v.height || v.bandwidth || 'auto'}`,
            v, 'manifest-hls'
          ));
        }
      } else {
        pushVariant(FALLBACK_AUTO('hls'));
      }
    } catch {
      pushVariant(FALLBACK_AUTO('hls'));
    }
  }

  return variants.sort(sortVariants);
}
