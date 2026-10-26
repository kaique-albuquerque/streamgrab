/**
 * CurlImpersonateTransport — transporte de download via curl-impersonate.
 */

import path from 'node:path';
import { createCurlClient, findCurlImpersonate, killAllCurl as killAllCurlGlobal } from '../../../curlimp.js';
import { abortError } from './errors.js';
import { downloadSegments } from './segments.js';

/**
 * Transporte de download via curl-impersonate.
 */
export class CurlImpersonateTransport {
  /**
   * @param {object} opts
   * @param {string} opts.cmd — binario curl-impersonate.
   * @param {string} [opts.name] — nome amigavel do binario.
   * @param {string} [opts.profile] — perfil --impersonate (v2.x).
   * @param {object} [opts.headers] — headers autorizados (User-Agent, Referer, cookies...).
   */
  constructor({ cmd, name, profile, headers = {} } = {}) {
    if (!cmd) throw new TypeError('CurlImpersonateTransport: cmd e obrigatorio');
    this.cmd = cmd;
    this.name = name || path.basename(cmd);
    this.profile = profile;
    this.headers = headers;
    this._activeProcesses = new Set();
    this._client = createCurlClient({ cmd, headers, profile, registerActive: this._activeProcesses });
    this._active = true;
  }

  /** Localiza o curl-impersonate instalado; retorna um transporte ou null. */
  static resolve({ headers } = {}) {
    const found = findCurlImpersonate();
    if (!found) return null;
    return new CurlImpersonateTransport({ ...found, headers });
  }

  /** Mata TODOS os processos curl-impersonate ativos (shutdown global). */
  static killAll() {
    killAllCurlGlobal();
  }

  get client() {
    return this._client;
  }

  /** Mata os processos curl ativos DESTE transporte (cancelamento/cleanup). */
  kill() {
    for (const child of this._activeProcesses) {
      try { child.kill(); } catch { /* ignora */ }
    }
  }

  dispose() {
    this._active = false;
    this.kill();
  }

  /**
   * Baixa `url` para `output`. Cancela (mata o processo) no abort do signal.
   * @returns {Promise<{ok: boolean, code: number, httpCode: string, finalUrl: string, stderr: string}>}
   */
  async fetch(url, output, { signal, timeoutMs = 90000 } = {}) {
    const stop = () => this.kill();
    if (signal) {
      if (signal.aborted) return { ok: false, code: -1, httpCode: '', finalUrl: '', stderr: 'cancelado' };
      signal.addEventListener('abort', stop, { once: true });
    }
    try {
      const result = await this._client.fetch(url, output, { timeoutMs });
      if (signal?.aborted) return { ok: false, code: -1, httpCode: '', finalUrl: '', stderr: 'cancelado' };
      return result;
    } finally {
      signal?.removeEventListener('abort', stop);
    }
  }

  /**
   * Baixa e le um texto (playlist). Lanca erro com `.status` HTTP quando 4xx.
   * @returns {Promise<{text: string, finalUrl: string}>}
   */
  async getText(url, { signal, timeoutMs = 90000 } = {}) {
    const stop = () => this.kill();
    if (signal) {
      if (signal.aborted) throw abortError();
      signal.addEventListener('abort', stop, { once: true });
    }
    try {
      const result = await this._client.getText(url, { timeoutMs });
      if (signal?.aborted) throw abortError();
      return result;
    } finally {
      signal?.removeEventListener('abort', stop);
    }
  }

  /**
   * Baixa chaves, maps e segmentos de uma playlist media e gera a playlist
   * local apontando para os arquivos.
   *
   * @returns {Promise<{ok: true, localPlaylist: string, extraArgs: string[], keyCount: number, totalBytes: number}>}
   *   ou `{ok: false, error: 'chave'|'init'|'segmentos'|'interrupted'}`.
   */
  async downloadSegments(params = {}) {
    return downloadSegments(this, params);
  }
}

/** Factory de conveniencia. */
export function createCurlTransport(opts) {
  return new CurlImpersonateTransport(opts);
}
