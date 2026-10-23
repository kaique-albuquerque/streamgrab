import path from 'node:path';

export const REPO_API_LATEST = 'https://api.github.com/repos/lexiforest/curl-impersonate/releases/latest';
export const PROFILE_BAT_RE = /^curl_(chrome|edge|safari|firefox)\d+(?:_\w+)?\.bat$/i;
export const DLL_RE = /\.dll$/i;

export function defaultInstallDir(projectRoot = process.cwd()) {
  return path.join(projectRoot, 'tools');
}

function isSupportedArchive(name) {
  return (
    name.endsWith('.zip') ||
    name.endsWith('.tar.gz') ||
    name.endsWith('.tgz') ||
    name.endsWith('.tar.xz')
  );
}

export function selectWindowsAsset(assets = []) {
  const ranked = assets
    .filter((asset) => {
      const name = String(asset?.name || '').toLowerCase();
      return (
        isSupportedArchive(name) &&
        /(win|windows|mingw|msvc)/.test(name) &&
        /(x64|win64|amd64|x86_64)/.test(name) &&
        !/(arm|aarch|i686|x86(?!_64))/i.test(name)
      );
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return ranked[0] || null;
}
