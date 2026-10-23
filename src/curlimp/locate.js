import fs from 'node:fs';
import path from 'node:path';
import { getPackagedResourcesPath } from '../core/binaries.js';
import {
  PROJECT_ROOT,
  PROFILE_ORDER,
  chromeVersion,
} from './profiles.js';

const STANDALONE_EXE_RE = /^curl_(chrome|edge|safari|firefox)\d+(?:_\w+)?\.exe$/i;
const PROFILE_BAT_RE = /^curl_(chrome|edge|safari|firefox)\d+(?:_\w+)?\.bat$/i;

/**
 * Localiza um binário do curl-impersonate instalado em:
 *  - PATH do sistema
 *  - pasta tools/ dentro do projeto
 *  - <resourcesPath>/bin (produção empacotada, extraResources)
 *  - %LOCALAPPDATA%\curl-impersonate e %USERPROFILE%\curl-impersonate
 *
 * Formatos suportados:
 *  - v1.x: curl_chromeNNN.exe / curl_edgeNNN.exe (binário standalone)
 *  - v2.x: curl-impersonate.exe + perfis --impersonate (ex.: chrome146)
 *
 * Retorna { cmd, name, profile } (profile é undefined para binários v1.x)
 * ou null.
 */
export function findCurlImpersonate({ platform = process.platform } = {}) {
  const dirs = new Set();
  for (const p of (process.env.PATH || '').split(path.delimiter)) {
    if (p.trim()) dirs.add(p.trim());
  }
  dirs.add(path.join(PROJECT_ROOT, 'tools'));
  const packagedRoot = getPackagedResourcesPath();
  if (packagedRoot) dirs.add(path.join(packagedRoot, 'bin'));
  if (process.env.LOCALAPPDATA) dirs.add(path.join(process.env.LOCALAPPDATA, 'curl-impersonate'));
  if (process.env.USERPROFILE) dirs.add(path.join(process.env.USERPROFILE, 'curl-impersonate'));

  const standalone = []; // v1.x: curl_chromeNNN.exe
  let mainExe = null; // v2.x: curl-impersonate.exe
  const profiles = new Set(); // v2.x: perfis disponíveis (curl_chromeNNN.bat etc.)

  for (const dir of dirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue; // diretório não existe
    }
    for (const name of entries) {
      const lower = name.toLowerCase();
      if (platform === 'win32' && lower === 'curl-impersonate.exe') {
        mainExe = path.join(dir, name);
      } else if (platform === 'win32' && STANDALONE_EXE_RE.test(name)) {
        standalone.push(path.join(dir, name));
      } else if (platform === 'win32' && PROFILE_BAT_RE.test(name)) {
        const profile = name.replace(/^curl_/i, '').replace(/\.bat$/i, '');
        if (PROFILE_ORDER.includes(profile)) profiles.add(profile);
      }
    }
  }

  // v2.x (preferido): curl-impersonate.exe + melhor perfil disponível.
  if (mainExe) {
    const profile = PROFILE_ORDER.find((p) => profiles.has(p));
    return { cmd: mainExe, name: 'curl-impersonate.exe', profile };
  }

  // v1.x: binário standalone com a versão do Chrome mais recente.
  standalone.sort((a, b) => {
    const va = chromeVersion(path.basename(a));
    const vb = chromeVersion(path.basename(b));
    return vb - va;
  });

  return standalone.length ? { cmd: standalone[0], name: path.basename(standalone[0]) } : null;
}
