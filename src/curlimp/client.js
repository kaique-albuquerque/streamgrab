import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { active } from './active.js';

/**
 * Cria um cliente curl-impersonate que já carrega os headers autorizados.
 *
 * Uso:
 *   const client = createCurlClient({ cmd, headers });
 *   const r = await client.fetch(url, outPath);            // baixa para arquivo
 *   const { text, finalUrl } = await client.getText(url);  // baixa e lê texto
 *
 * fetch retorna { ok, code, httpCode, finalUrl, stderr }.
 *
 * Opcoes:
 *  - registerActive: Set<ChildProcess> para registrar processos filhos.
 *    Quando fornecido, os processos sao adicionados a esse Set (em vez do
 *    Set global `active`), permitindo tracking per-instance no transport.
 */
export function createCurlClient({ cmd, headers = {}, profile, registerActive } = {}) {
  const headerArgs = [];
  for (const [k, v] of Object.entries(headers || {})) {
    if (v && String(v).trim()) headerArgs.push('-H', `${k}: ${String(v).trim()}`);
  }

  // v2.x: curl-impersonate.exe --impersonate <perfil> <url> ... --compressed
  const impersonateArgs = profile
    ? ['--impersonate', profile, '--compressed']
    : [];

  // Set alvo para tracking de processos: per-instance quando fornecido,
  // global (`active`) quando nao — preserva comportamento legado.
  const target = registerActive || active;

  function run(url, outPath, timeoutMs) {
    return new Promise((resolve) => {
      const args = [
        ...impersonateArgs,
        url,
        '-sS',
        '-L',
        '--connect-timeout', '15',
        '--max-time', String(Math.max(15, Math.ceil(timeoutMs / 1000))),
        '-w', '%{http_code}\n%{url_effective}',
        '-o', outPath,
        ...headerArgs,
      ];

      let child;
      try {
        child = spawn(cmd, args, { windowsHide: true });
      } catch (err) {
        resolve({ ok: false, code: -1, httpCode: '', finalUrl: '', stderr: String(err.message || err) });
        return;
      }

      target.add(child);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => {
        stdout = (stdout + d.toString()).slice(-4000);
      });
      child.stderr.on('data', (d) => {
        stderr = (stderr + d.toString()).slice(-20000);
      });
      child.on('error', (err) => {
        target.delete(child);
        resolve({ ok: false, code: -1, httpCode: '', finalUrl: '', stderr: String(err.message || err) });
      });
      child.on('close', (code) => {
        target.delete(child);
        const lines = stdout.split(/\r?\n/);
        const httpCode = (lines[0] || '').trim();
        const finalUrl = (lines[1] || '').trim();
        resolve({ ok: code === 0, code, httpCode, finalUrl, stderr });
      });
    });
  }

  return {
    cmd,
    fetch(url, outPath, { timeoutMs = 90000 } = {}) {
      return run(url, outPath, timeoutMs);
    },
    async getText(url, { timeoutMs = 90000 } = {}) {
      const tmp = path.join(os.tmpdir(), `vd-txt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      try {
        const r = await run(url, tmp, timeoutMs);
        if (!r.ok || (r.httpCode && r.httpCode.startsWith('4'))) {
          const err = new Error(`HTTP ${r.httpCode || r.code || 'erro de conexão'}${r.stderr ? ` — ${r.stderr.split('\n').filter(Boolean).slice(-2).join(' ')}` : ''}`);
          err.status = r.httpCode ? Number(r.httpCode) : 0;
          throw err;
        }
        return { text: fs.readFileSync(tmp, 'utf8'), finalUrl: r.finalUrl || url };
      } finally {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignora */
        }
      }
    },
  };
}
