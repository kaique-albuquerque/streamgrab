/**
 * Notifier — Notificações nativas do sistema para eventos de download (barrel).
 *
 * Usa a Notification API do Electron para notificar o usuário mesmo com
 * o aplicativo minimizado. Agrega múltiplos eventos em uma janela de 5s
 * para evitar spam de notificações.
 *
 * Implementação em ./notifications/:
 *  - should-notify.js → decide se deve notificar (settings + foco)
 *  - messages.js      → título/corpo/clique por tipo de evento
 *  - show.js          → instancia e exibe a Notification
 *  - window.js        → foco/restauração da janela
 *  - controller.js    → createNotifier
 *
 * SPEC-05: docs/specs/05-notificacoes-nativas.md
 */

export { createNotifier } from './notifications/controller.js';
