import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Perfis imitados pelo curl-impersonate v2.x (curl-impersonate.exe --impersonate <perfil>).
export const PROFILE_ORDER = [
  'chrome146', 'chrome145', 'chrome142', 'chrome136', 'chrome133a', 'chrome131',
  'chrome124', 'chrome123', 'chrome120', 'chrome119', 'chrome116', 'chrome110',
  'chrome107', 'chrome104', 'chrome101', 'chrome100', 'chrome99',
  'edge101', 'edge99',
  'firefox147', 'firefox144', 'firefox135', 'firefox133',
  'safari260', 'safari184', 'safari180', 'safari172_ios', 'safari170', 'safari155', 'safari153',
];

export function chromeVersion(profile) {
  const m = String(profile || '').match(/chrome(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}
