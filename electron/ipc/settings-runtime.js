/**
 * Efeitos de `settings:update` sobre servicos vivos do processo main.
 *
 * Alguns settings controlam recursos que ja estao rodando (o clipboard
 * watcher, por exemplo); sem isso a mudanca so valeria apos reiniciar.
 */

/** Liga/desliga o clipboard watcher quando `clipboardWatch` muda. */
export function applyRuntimeSettings(clean = {}, { clipboardWatcher } = {}) {
  if (!clean || !('clipboardWatch' in clean)) return;
  if (!clipboardWatcher || typeof clipboardWatcher.setEnabled !== 'function') return;
  clipboardWatcher.setEnabled(clean.clipboardWatch !== false);
}
