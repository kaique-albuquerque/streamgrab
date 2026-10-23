/**
 * Montagem dos argumentos do FFmpeg para mux de vídeo + N faixas de áudio.
 */

export function buildMuxMultiArgs({ videoTmp, audioTmps, audioLanguages = [], audioLabels = [], output }) {
  const ffmpegArgs = [
    '-hide_banner', '-loglevel', 'error', '-nostats', '-y',
    '-i', videoTmp,
  ];

  // Audio inputs
  for (const audioTmp of audioTmps) {
    ffmpegArgs.push('-i', audioTmp);
  }

  ffmpegArgs.push('-progress', 'pipe:1');

  // Maps: video from input 0, audio from each subsequent input
  ffmpegArgs.push('-map', '0:v:0');
  for (let i = 0; i < audioTmps.length; i++) {
    ffmpegArgs.push('-map', `${i + 1}:a:0`);
  }

  // Copy all streams
  ffmpegArgs.push('-c:v', 'copy', '-c:a', 'copy');

  // Metadata for each audio track
  for (let i = 0; i < audioTmps.length; i++) {
    const lang = audioLanguages[i] || 'und';
    const label = audioLabels[i] || '';
    ffmpegArgs.push('-metadata:s:a:' + i, `language=${lang}`);
    if (label) ffmpegArgs.push('-metadata:s:a:' + i, `title=${label}`);
  }

  ffmpegArgs.push('-movflags', '+faststart', output);
  return ffmpegArgs;
}
