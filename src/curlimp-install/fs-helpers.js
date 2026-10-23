import fs from 'node:fs';
import path from 'node:path';

export function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function copyDirectoryContents(srcDir, dstDir) {
  ensureDir(dstDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

export function findBinaryDir(rootDir) {
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const names = entries.map((e) => e.name.toLowerCase());
    if (names.includes('curl-impersonate.exe')) return dir;
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(dir, entry.name));
    }
  }
  return '';
}
