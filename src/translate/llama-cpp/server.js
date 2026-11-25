/**
 * Ciclo de vida do `llama-server` local.
 *
 * Sobe o processo em `127.0.0.1` com porta efêmera (`--port 0`), espera o
 * `/health` responder 200 e devolve `{ baseUrl, apiKey, stop() }`. O processo
 * é encerrado no `stop()`, no abort do `signal` e no `dispose()` do manager.
 *
 * `llama-server` é um stub fino: as bibliotecas precisam estar na mesma pasta
 * do binário (ver `scripts/install-llama.mjs`).
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

/** Timeout padrão para o servidor ficar saudável. */
export const SERVER_START_TIMEOUT_MS = 120_000;

/** Intervalo entre tentativas de `/health`. */
const HEALTH_POLL_MS = 250;

/** Contexto de embedding: 8192 tokens. */
const CONTEXT_SIZE = 8192;

/**
 * Sobe o `llama-server` e espera ele ficar saudável.
 *
 * @param {object} params
 * @param {string} params.binPath - Caminho do `llama-server`
 * @param {string} params.modelPath - Caminho do modelo GGUF
 * @param {AbortSignal} [params.signal] - Cancela o start e derruba o processo
 * @param {Function} [params.onLog] - Callback de log (linha)
 * @param {typeof fetch} [params.fetchImpl] - fetch injetável (testes)
 * @param {number} [params.startTimeoutMs] - Sobrescreve o timeout de start
 * @returns {Promise<{ baseUrl: string, apiKey: string, stop: () => Promise<void> }>}
 */
export async function startServer({
  binPath,
  modelPath,
  signal,
  onLog,
  fetchImpl = globalThis.fetch,
  startTimeoutMs = SERVER_START_TIMEOUT_MS,
} = {}) {
  const apiKey = randomBytes(32).toString('hex');
  const args = [
    '--host', '127.0.0.1',
    '--port', '0',
    '--no-webui',
    '--no-warmup',
    '--api-key', apiKey,
    '-m', modelPath,
    '-c', String(CONTEXT_SIZE),
  ];

  onLog?.(`[llama-server] ${binPath} ${args.join(' ')}`);

  const child = spawn(binPath, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let port = 0;
  let exited = false;
  let exitInfo = '';

  const portFrom = (chunk) => {
    const match = /(?:listening|port)[^\d]*(\d{2,5})/i.exec(chunk);
    if (match) port = Number(match[1]);
  };

  child.stdout?.on('data', (d) => {
    const chunk = d.toString();
    portFrom(chunk);
    onLog?.(chunk.trim());
  });
  child.stderr?.on('data', (d) => {
    const chunk = d.toString();
    portFrom(chunk);
    exitInfo = (exitInfo + chunk).slice(-4000);
    onLog?.(chunk.trim());
  });

  const exitedPromise = new Promise((resolve) => {
    child.on('error', (err) => {
      exited = true;
      exitInfo = err.message;
      resolve(err);
    });
    child.on('close', (code) => {
      exited = true;
      exitInfo = exitInfo || `código ${code}`;
      resolve(code);
    });
  });

  const stop = async () => {
    if (exited) return;
    try {
      child.kill('SIGKILL');
    } catch {
      /* já morreu */
    }
    await Promise.race([exitedPromise, new Promise((r) => setTimeout(r, 3000))]);
  };

  const onAbort = () => {
    stop().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) {
      await stop();
      throw new Error('Operação cancelada antes de iniciar o llama-server.');
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  const deadline = Date.now() + startTimeoutMs;
  try {
    while (Date.now() < deadline) {
      if (exited) {
        throw new Error(`llama-server encerrou antes de ficar saudável: ${exitInfo}`);
      }
      if (port > 0) {
        const healthy = await pingHealth(fetchImpl, port, apiKey);
        if (healthy) {
          return { baseUrl: `http://127.0.0.1:${port}`, apiKey, stop };
        }
      }
      await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
    }
    throw new Error(
      `llama-server nao iniciou em ${Math.round(startTimeoutMs / 1000)}s. ` +
        'Verifique se o binário e as bibliotecas estão em vendor/llama e se o modelo GGUF é válido.',
    );
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/** GET /health com a api-key; true quando responde 200. */
async function pingHealth(fetchImpl, port, apiKey) {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/health`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}