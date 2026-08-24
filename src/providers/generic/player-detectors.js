export function detectKnownPlayers(html) {
  const text = String(html || '').toLowerCase();
  const players = [];

  if (text.includes('hls.js')) players.push({ player: 'hls.js', confidence: 'medium' });
  if (text.includes('dashjs') || text.includes('dash.all.min.js')) players.push({ player: 'dash.js', confidence: 'medium' });
  if (text.includes('jwplayer')) players.push({ player: 'jwplayer', confidence: 'medium' });
  if (text.includes('videojs')) players.push({ player: 'video.js', confidence: 'medium' });
  if (text.includes('shaka-player') || text.includes('shaka.')) players.push({ player: 'shaka', confidence: 'medium' });

  return players;
}

export default { detectKnownPlayers };
