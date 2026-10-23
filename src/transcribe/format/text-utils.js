/** Limpeza de texto bruto retornado pelo Whisper. */

export function cleanTranscriptionText(text) {
  if (!text) return '';
  return text
    .replace(/\[(?:Musica|Music|Musica de fundo|Background music)\]/gi, '')
    .replace(/\[(?:Risadas|Laughter|Laughing)\]/gi, '')
    .replace(/\[(?:Aplausos|Applause)\]/gi, '')
    .replace(/\[(?:Silencio|Silence)\]/gi, '')
    .replace(/\[(?:Apito|Whistle)\]/gi, '')
    .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanSegmentText(text) {
  if (!text) return '';
  return text
    .replace(/\[(?:Musica|Music)\]/gi, '')
    .replace(/\[(?:Risadas|Laughter)\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
