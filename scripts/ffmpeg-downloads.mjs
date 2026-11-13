const MAC_FFMPEG_RELEASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1';

const MAC_FFMPEG_ASSETS = {
  arm64: 'ffmpeg-darwin-arm64',
  x64: 'ffmpeg-darwin-x64',
};

export function getMacFfmpegUrl(arch) {
  if (!Object.hasOwn(MAC_FFMPEG_ASSETS, arch)) {
    throw new Error(`Unsupported macOS FFmpeg architecture: ${arch}`);
  }
  const asset = MAC_FFMPEG_ASSETS[arch];
  return `${MAC_FFMPEG_RELEASE}/${asset}`;
}
