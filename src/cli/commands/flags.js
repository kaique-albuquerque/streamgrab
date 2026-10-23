/**
 * Flags aceitas pelos subcomandos `analyze` e `download`.
 */

import { parseCliHeaders, parseCliAuth } from '../config.js';

export function parseAnalyzeFlags(rest = []) {
  return {
    argv: rest,
    json: rest.includes('--json'),
    headers: parseCliHeaders(rest),
    auth: parseCliAuth(rest),
  };
}

export function parseDownloadFlags(rest = []) {
  const flags = {
    outputDir: '',
    filename: '',
    format: '',
    audioOnly: false,
    audioLanguage: '',
    allAudio: false,
    subLanguages: [],
    embedSubs: false,
    turbo: false,
    chunks: 0,
    noResume: false,
    forceCurl: false,
    cookiesFile: '',
    cookiesFromBrowser: '',
    headers: {},
    argv: rest,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--output' || arg === '-o') flags.outputDir = rest[++i] || '';
    else if (arg === '--filename') flags.filename = rest[++i] || '';
    else if (arg === '--format' || arg === '-f') flags.format = rest[++i] || '';
    else if (arg === '--audio-only') flags.audioOnly = true;
    else if (arg === '--audio-lang') flags.audioLanguage = rest[++i] || '';
    else if (arg === '--all-audio') flags.allAudio = true;
    else if (arg === '--subs') {
      const val = rest[++i] || '';
      flags.subLanguages = val === 'all' ? ['all'] : val.split(',').map((s) => s.trim()).filter(Boolean);
    }
    else if (arg === '--embed-subs') flags.embedSubs = true;
    else if (arg === '--turbo') flags.turbo = true;
    else if (arg === '--chunks') flags.chunks = Number(rest[++i]) || 0;
    else if (arg === '--no-resume') flags.noResume = true;
    else if (arg === '--curl-impersonate' || arg === '--ci') flags.forceCurl = true;
    else if (arg === '--cookies') flags.cookiesFile = rest[++i] || '';
    else if (arg === '--cookies-from-browser') flags.cookiesFromBrowser = rest[++i] || '';
  }
  flags.headers = parseCliHeaders(rest);
  return flags;
}
