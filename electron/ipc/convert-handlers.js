/**
 * Handlers IPC de conversão de vídeo para MKV — módulo src/convert.
 *
 * Canais:
 *  - convert:start   → enfileira conversão (singleton, uma por vez)
 *  - convert:cancel  → cancela a conversão em andamento
 *
 * Eventos broadcast:
 *  - convert:progress → { jobId, percent }
 *  - convert:done     → { jobId, outputPath, size }
 *  - convert:error    → { jobId, cancelled, error }
 */

import path from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { friendlyReport } from '../../src/core/errors.js';
import { validateConvertJobPayload, validateConvertPayload } from '../security.js';
import { addRevealRoot } from './state.js';

/** Envia um evento para todas as janelas abertas. */
function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}

/** Resposta padrão de payload inválido. */
function invalidPayloadResponse(message, suggestedAction) {
  return { ok: false, error: { message, suggestedAction } };
}

/** Conversão em andamento (uma por vez). */
let current = null;

/** `convert:start` — converte um vídeo local para MKV. */
export function registerConvertStartHandler() {
  ipcMain.handle('convert:start', async (_event, rawPayload) => {
    const payload = validateConvertPayload(rawPayload);
    if (!payload) {
      return invalidPayloadResponse(
        'Arquivo de vídeo inválido.',
        'Selecione um vídeo (.mp4, .mkv, .webm, .mov…) do seu computador.',
      );
    }

    if (current) {
      return invalidPayloadResponse(
        'Já há uma conversão em andamento.',
        'Aguarde terminar ou cancele a conversão atual.',
      );
    }

    const jobId = `cv_${Date.now().toString(36)}`;
    const abort = new AbortController();
    current = { jobId, abort };

    // Permite "abrir pasta" no arquivo gerado.
    addRevealRoot(path.dirname(payload.inputPath));

    try {
      const { convertToMkv } = await import('../../src/convert/index.js');
      const result = await convertToMkv({
        inputPath: payload.inputPath,
        signal: abort.signal,
        onProgress: (p) => broadcast('convert:progress', { jobId, ...p }),
        onLog: (line) => broadcast('convert:log', { jobId, line }),
      });
      broadcast('convert:done', { jobId, ...result });
      return { ok: true, jobId, ...result };
    } catch (err) {
      const cancelled = err?.code === 'CANCELLED' || abort.signal.aborted;
      const report = friendlyReport(err);
      broadcast('convert:error', {
        jobId,
        cancelled,
        error: report.message || err?.message || 'Falha na conversão.',
      });
      return {
        ok: false,
        cancelled,
        jobId,
        error: {
          message: report.message || err?.message || 'Falha na conversão.',
          suggestedAction: cancelled
            ? 'Conversão cancelada.'
            : report.suggestedAction || 'Verifique o arquivo e tente novamente.',
        },
      };
    } finally {
      current = null;
    }
  });
}

/** `convert:cancel` — cancela a conversão em andamento. */
export function registerConvertCancelHandler() {
  ipcMain.handle('convert:cancel', async (_event, rawPayload) => {
    const payload = validateConvertJobPayload(rawPayload);
    if (!payload) return invalidPayloadResponse('Pedido de cancelamento inválido.', 'Tente novamente.');
    if (!current) {
      return invalidPayloadResponse('Nenhuma conversão em andamento.', 'Atualize a lista.');
    }
    current.abort.abort();
    return { ok: true };
  });
}