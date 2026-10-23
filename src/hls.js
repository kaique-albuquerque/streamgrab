/**
 * Parser e fetcher de playlists HLS (master, media e segmentos).
 * A implementacao vive em ./hls/ (um modulo por responsabilidade).
 */

export { parseAttributes } from './hls/attributes.js';
export { parsePlaylistText } from './hls/playlist.js';
export { fetchPlaylistText, fetchPlaylist } from './hls/fetch.js';
export { parseSegmentPlaylist } from './hls/segments.js';
