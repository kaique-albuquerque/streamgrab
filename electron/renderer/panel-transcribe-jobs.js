/**
 * panel-transcribe-jobs.js — Renderização da lista de jobs de transcrição
 * (barrel).
 *
 * Implementação em ./panel-transcribe-jobs/:
 *  - head.js    → título, status e descrição do job
 *  - details.js → progresso, erro e chips de arquivos
 *  - actions.js → botões de ação
 *  - item.js    → item completo
 *  - index.js   → createJobListRenderer
 */

export { createJobListRenderer } from './panel-transcribe-jobs/index.js';
