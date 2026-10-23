/**
 * Prepara o download a partir da variante escolhida no CLI/Electron.
 */

import { ADAPTIVE_URI_PREFIX, YTDLP_FORMAT_UNAVAILABLE } from './constants.js';

/** Cria o plano de download de todas as faixas de audio (mux-multi). */
function planAllAudio({ analysis, video, formatId }) {
  const audioFormats = analysis.adaptiveAudioFormats.filter((f) => f.url);
  const videoBytes = video.contentLength || undefined;
  const totalAudioBytes = audioFormats.reduce((sum, f) => sum + (f.contentLength || 0), 0);
  return {
    strategy: 'mux-multi',
    videoUrl: video.url,
    audioUrls: audioFormats.map((f) => f.url),
    audioLabels: audioFormats.map((f) => f.label || f.language || ''),
    audioLanguages: audioFormats.map((f) => f.language || 'und'),
    chosenFormat: { sourceKind: 'adaptive', formatId, height: video.height },
    videoBytes,
    totalBytes: videoBytes ? videoBytes + totalAudioBytes : undefined,
    durationMs: (analysis?.durationSeconds || 0) * 1000,
  };
}

/** Escolhe a faixa de audio pelo idioma pedido, com fallback para a melhor. */
function pickAudioFormat(analysis, audioLanguage) {
  if (audioLanguage && analysis?.adaptiveAudioFormats) {
    const preferred = analysis.adaptiveAudioFormats.find((f) => f.language === audioLanguage) || null;
    if (preferred?.url) return preferred;
    // Fallback to best available if requested language not found
  }
  return analysis?.adaptiveAudioFormats?.[0] || null;
}

/**
 * Prepara o download a partir da variante escolhida no CLI/Electron.
 * - "ytdlp-format:<formatId>" -> mux (video + melhor audio) via FFmpeg
 * - URL direta (progressivo)    -> download unico
 *
 * P12.1: accepts `audioLanguage` and `allAudio` options.
 */
export async function prepareYtDlpDownload({ analysis, selectedUrl, headers = {}, auth = {}, audioLanguage, allAudio } = {}) {
  if (selectedUrl?.startsWith(ADAPTIVE_URI_PREFIX)) {
    const formatId = selectedUrl.slice(ADAPTIVE_URI_PREFIX.length);
    const video = analysis?.adaptiveVideoFormats?.find((format) => format.formatId === formatId) || null;
    if (!video || !video.url) {
      const err = new Error(`Formato adaptativo ${formatId} nao encontrado na analise.`);
      err.code = YTDLP_FORMAT_UNAVAILABLE;
      throw err;
    }

    // P12.1: all-audio mode — download all audio tracks as mux-multi
    if (allAudio && analysis?.adaptiveAudioFormats?.length > 1) {
      const audioFormats = analysis.adaptiveAudioFormats.filter((f) => f.url);
      if (audioFormats.length > 1) {
        return planAllAudio({ analysis, video, formatId });
      }
    }

    // P12.1: select audio by language if specified, otherwise best available
    const bestAudio = pickAudioFormat(analysis, audioLanguage);
    if (!bestAudio?.url) {
      // Sem audio disponivel: entrega apenas o video (fallback gracioso).
      return {
        strategy: 'single',
        downloadUrl: video.url,
        chosenFormat: { sourceKind: 'adaptive', formatId, height: video.height },
        totalBytes: video.contentLength || undefined,
        durationMs: (analysis?.durationSeconds || 0) * 1000,
      };
    }

    const videoBytes = video.contentLength || undefined;
    const audioBytes = bestAudio.contentLength || undefined;
    return {
      strategy: 'mux',
      videoUrl: video.url,
      audioUrl: bestAudio.url,
      chosenFormat: { sourceKind: 'adaptive', formatId, height: video.height },
      videoBytes,
      audioBytes,
      totalBytes: videoBytes && audioBytes ? videoBytes + audioBytes : undefined,
      durationMs: (analysis?.durationSeconds || 0) * 1000,
    };
  }

  const progressive = analysis?.progressiveFormats?.find((format) => format.url === selectedUrl) || null;
  if (progressive?.url) {
    return {
      strategy: 'single',
      downloadUrl: progressive.url,
      chosenFormat: { sourceKind: 'progressive', formatId: progressive.formatId, height: progressive.height },
      totalBytes: progressive.contentLength || undefined,
      durationMs: (analysis?.durationSeconds || 0) * 1000,
    };
  }

  if (selectedUrl) {
    return { strategy: 'single', downloadUrl: selectedUrl };
  }

  const err = new Error('Nenhuma variante de download selecionada.');
  err.code = YTDLP_FORMAT_UNAVAILABLE;
  throw err;
}
