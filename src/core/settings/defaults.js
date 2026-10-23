/**
 * Defaults e schema de validação dos settings.
 *
 * Nota de privacidade: settings não contém URLs/cookies — apenas preferências.
 */

/** Defaults de configuração. `defaultDir: ''` = diretorio do sistema. */
export const DEFAULT_SETTINGS = Object.freeze({
  defaultDir: '',
  maxConcurrentDownloads: 3,
  turbo: false,
  turboChunks: 8,
  smartTurbo: false,
  defaultQuality: 'best',
  audio: 'original',
  notifications: true,
  clipboardWatch: true,
  tutorialCompleted: false, // SPEC-02: tour interativo na primeira execução
  theme: 'system',
  onComplete: '',
  historyRetentionDays: 0,
  // SPEC-09: Transcrição de vídeo
  transcribe: false,
  transcribeLang: 'pt',
  transcribeModel: 'small',
  transcribeTimestamps: true,
});

/** Tipo e limites de cada chave conhecida. */
export const SCHEMA = {
  defaultDir: { type: 'string', clamp: null },
  maxConcurrentDownloads: { type: 'number', clamp: [1, 16] },
  turbo: { type: 'boolean', clamp: null },
  turboChunks: { type: 'number', clamp: [1, 32] },
  smartTurbo: { type: 'json', clamp: null },
  defaultQuality: { type: 'string', clamp: null },
  audio: { type: 'string', clamp: null },
  notifications: { type: 'boolean', clamp: null },
  clipboardWatch: { type: 'boolean', clamp: null },
  tutorialCompleted: { type: 'boolean', clamp: null },
  theme: { type: 'string', clamp: null },
  onComplete: { type: 'string', clamp: null },
  historyRetentionDays: { type: 'number', clamp: [0, 3650] },
  // SPEC-09: Transcrição de vídeo
  transcribe: { type: 'boolean', clamp: null },
  transcribeLang: { type: 'string', clamp: null },
  transcribeModel: { type: 'string', clamp: null },
  transcribeTimestamps: { type: 'boolean', clamp: null },
};
