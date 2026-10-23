/**
 * Execução do processo whisper-cli com cancelamento e progresso.
 */

import { spawn } from 'node:child_process';
import { handleTimeProgress, handleWhisperOutput } from './output-parsing.js';

/**
 * Inicia o whisper-cli.
 *
 * @returns {{ promise: Promise<object>, stop: () => void }}
 */
export function spawnWhisper(binPath, args, { signal, onProgress, onLog }) {
  let child;
  try {
    child = spawn(binPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    return {
      promise: Promise.resolve({ ok: false, code: -1, error: err, stderr: '', interrupted: false }),
      stop: () => {},
    };
  }

  let stderr = '';
  let stdout = '';
  let interrupted = false;
  let lastProgress = 0;

  child.stdout?.on('data', (d) => {
    const chunk = d.toString();
    stdout += chunk;
    lastProgress = handleWhisperOutput(chunk, lastProgress, onProgress);
  });

  child.stderr?.on('data', (d) => {
    const chunk = d.toString();
    stderr = (stderr + chunk).slice(-60000);

    lastProgress = handleTimeProgress(chunk, lastProgress, onProgress);
    lastProgress = handleWhisperOutput(chunk, lastProgress, onProgress);

    if (chunk.includes('whisper_init_from_file')) {
      onLog?.(`[whisper-cpp] ${chunk.trim()}`);
    }
  });

  const stop = () => {
    interrupted = true;
    try {
      if (child.stdin && child.stdin.writable) child.stdin.write('q');
    } catch {
      // Ignorar
    }
    const killer = setTimeout(() => {
      try {
        if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
      } catch {
        // Ignorar
      }
    }, 6000);
    killer.unref();
  };

  const onAbort = () => stop();
  let removeAbort = null;
  if (signal) {
    if (signal.aborted) {
      stop();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbort = () => signal.removeEventListener('abort', onAbort);
    }
  }

  const done = (result) => {
    removeAbort?.();
    return result;
  };

  const promise = new Promise((resolve) => {
    child.on('error', (err) => resolve(done({ ok: false, code: -1, error: err, stderr, interrupted })));
    child.on('close', (code) => {
      resolve(done({ ok: !interrupted && (code === 0 || code === 1), code, stderr, stdout, interrupted }));
    });
  });

  return { promise, stop, child };
}
