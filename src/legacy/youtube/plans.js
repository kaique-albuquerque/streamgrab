/**
 * YouTube — candidate download plan builder.
 */

function findMatchingProgressiveFormat(analysis, selectedUrl) {
  return analysis?.progressiveFormats?.find((f) => f.url === selectedUrl) || null;
}

function findMatchingAdaptiveFormat(analysis, selectedUrl) {
  const match = String(selectedUrl || '').match(/^youtube-adaptive:(\d+)$/);
  if (match) {
    return analysis?.adaptiveVideoFormats?.find((f) => f.itag === Number(match[1])) || null;
  }
  return null;
}

function parseManifestSelection(selectedUrl) {
  const match = String(selectedUrl || '').match(/^youtube-manifest:(dash|hls):/);
  return match ? match[1] : '';
}

export function buildCandidatePlans(analysis, selectedUrl) {
  const candidates = [];
  const seen = new Set();
  const pushPlan = (plan) => {
    if (!plan) return;
    const key = JSON.stringify({
      strategy: plan.strategy,
      downloadUrl: plan.downloadUrl || '',
      videoUrl: plan.videoUrl || '',
      audioUrl: plan.audioUrl || '',
    });
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(plan);
  };

  const selectedProgressive = findMatchingProgressiveFormat(analysis, selectedUrl);
  const selectedAdaptive = findMatchingAdaptiveFormat(analysis, selectedUrl);
  const bestAudio = analysis?.adaptiveAudioFormats?.[0] || null;

  if (selectedAdaptive?.url && bestAudio?.url) {
    pushPlan({
      strategy: 'mux',
      videoUrl: selectedAdaptive.url,
      audioUrl: bestAudio.url,
      chosenVideoFormat: selectedAdaptive,
      chosenAudioFormat: bestAudio,
    });
  }

  if (selectedProgressive?.url) {
    pushPlan({
      strategy: 'single',
      downloadUrl: selectedProgressive.url,
      chosenFormat: selectedProgressive,
    });
  }

  for (const fmt of analysis?.adaptiveVideoFormats || []) {
    if (!fmt?.url || !bestAudio?.url) continue;
    pushPlan({
      strategy: 'mux',
      videoUrl: fmt.url,
      audioUrl: bestAudio.url,
      chosenVideoFormat: fmt,
      chosenAudioFormat: bestAudio,
    });
  }

  for (const fmt of analysis?.progressiveFormats || []) {
    if (!fmt?.url) continue;
    pushPlan({ strategy: 'single', downloadUrl: fmt.url, chosenFormat: fmt });
  }

  if (analysis?.dashManifestUrl) {
    pushPlan({ strategy: 'manifest', manifestType: 'dash', downloadUrl: analysis.dashManifestUrl });
  }
  if (analysis?.hlsManifestUrl) {
    pushPlan({ strategy: 'manifest', manifestType: 'hls', downloadUrl: analysis.hlsManifestUrl });
  }

  return candidates;
}

export { parseManifestSelection };
