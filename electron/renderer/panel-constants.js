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
export const VIEWS = ['videos', 'queue', 'history', 'settings'];
