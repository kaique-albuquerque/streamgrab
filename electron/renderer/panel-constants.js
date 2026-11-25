/**
 * Constantes compartilhadas entre os módulos de painel.
 */

export const QUEUE_STATE_LABELS = {
  queued: 'Aguardando',
  analyzing: 'Analisando',
  preparing: 'Preparando',
  downloading: 'Baixando',
  paused: 'Pausado',
  merging: 'Mesclando',
  completed: 'Concluido',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

export const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
export const ACTIVE_STATES = new Set(['analyzing', 'preparing', 'downloading', 'merging']);
export const VIEWS = ['videos', 'queue', 'history', 'transcribe', 'settings'];

/** Estados dos jobs de transcrição (src/transcribe/job-manager.js). */
export const TRANSCRIBE_STATE_LABELS = {
  queued: 'Aguardando',
  running: 'Transcrevendo',
  done: 'Concluído',
  error: 'Falhou',
  cancelled: 'Cancelado',
};

export const TRANSCRIBE_STAGE_LABELS = {
  queued: 'Aguardando',
  preparing: 'Preparando',
  extracting: 'Extraindo áudio',
  transcribing: 'Transcrevendo',
  done: 'Concluído',
};

/** Estados dos jobs de tradução (src/translate/job-manager.js). */
export const TRANSLATE_STATE_LABELS = {
  queued: 'Aguardando',
  running: 'Traduzindo',
  done: 'Traduzido',
  error: 'Falhou',
  cancelled: 'Cancelado',
};

export const TRANSLATE_STAGE_LABELS = {
  queued: 'Aguardando',
  starting: 'Iniciando',
  translating: 'Traduzindo',
  shortening: 'Encurtando legendas',
  writing: 'Gravando',
  done: 'Concluído',
};
