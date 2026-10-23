import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_API_LATEST,
  PROFILE_BAT_RE,
  DLL_RE,
  defaultInstallDir,
  selectWindowsAsset,
} from './assets.js';
import { fileExists, ensureDir, copyDirectoryContents, findBinaryDir } from './fs-helpers.js';
import { extractZip, extractTar } from './extract.js';
import { downloadBuffer } from './download.js';

export async function installCurlImpersonate({
  projectRoot = process.cwd(),
  installDir = defaultInstallDir(projectRoot),
  io = console,
  force = false,
} = {}) {
  if (process.platform !== 'win32') {
    return { ok: false, installed: false, reason: 'unsupported-platform' };
  }

  const exePath = path.join(installDir, 'curl-impersonate.exe');
  if (!force && fileExists(exePath)) {
    return { ok: true, installed: false, exePath, installDir };
  }

  ensureDir(installDir);
  const extractDir = path.join(os.tmpdir(), `curl-impersonate-extract-${Date.now()}`);
  let archivePath = '';

  try {
    io?.log?.('[curl-impersonate] Buscando release para Windows...');
    const releaseRes = await fetch(REPO_API_LATEST, {
      headers: {
        'User-Agent': 'StreamGrab/auto-installer',
        Accept: 'application/vnd.github+json',
      },
      redirect: 'follow',
    });
    if (!releaseRes.ok) {
      throw new Error(`Falha ao consultar releases: HTTP ${releaseRes.status} ${releaseRes.statusText}`);
    }
    const release = await releaseRes.json();
    const asset = selectWindowsAsset(release?.assets || []);
    if (!asset?.browser_download_url) {
      throw new Error('Nenhum asset ZIP para Windows x64 foi encontrado na release atual.');
    }

    io?.log?.(`[curl-impersonate] Baixando ${asset.name}...`);
    const zip = await downloadBuffer(asset.browser_download_url, {
      headers: { 'User-Agent': 'StreamGrab/auto-installer' },
      io,
    });
    archivePath = path.join(os.tmpdir(), `curl-impersonate-${Date.now()}-${asset.name}`);
    fs.writeFileSync(archivePath, zip);

    ensureDir(extractDir);
    io?.log?.('[curl-impersonate] Extraindo arquivos...');
    const lowerName = String(asset.name || '').toLowerCase();
    if (lowerName.endsWith('.zip')) extractZip(archivePath, extractDir);
    else extractTar(archivePath, extractDir);

    const binaryDir = findBinaryDir(extractDir);
    if (!binaryDir) throw new Error('curl-impersonate.exe não foi encontrado no arquivo baixado.');

    io?.log?.('[curl-impersonate] Instalando em tools/...');
    copyDirectoryContents(binaryDir, installDir);

    const installedExe = path.join(installDir, 'curl-impersonate.exe');
    if (!fileExists(installedExe)) throw new Error('A instalação terminou sem o executável esperado.');

    const profiles = fs.readdirSync(installDir).filter((name) => PROFILE_BAT_RE.test(name));
    const dlls = fs.readdirSync(installDir).filter((name) => DLL_RE.test(name));
    fs.writeFileSync(
      path.join(installDir, '.curl-impersonate-installed.json'),
      JSON.stringify(
        {
          installedAt: new Date().toISOString(),
          source: asset.browser_download_url,
          assetName: asset.name,
          profiles,
          dlls,
        },
        null,
        2
      )
    );

    io?.log?.(`[curl-impersonate] Pronto: ${installedExe}`);
    return { ok: true, installed: true, exePath: installedExe, installDir, profiles };
  } finally {
    try {
      if (archivePath) fs.rmSync(archivePath, { force: true });
    } catch {}
    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch {}
  }
}
