/**
 * YouTube — default request headers.
 */

export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: '*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: 'https://www.youtube.com',
  Referer: 'https://www.youtube.com/',
};

export function buildYouTubeRequestHeaders(headers = {}) {
  return { ...DEFAULT_HEADERS, ...headers };
}
