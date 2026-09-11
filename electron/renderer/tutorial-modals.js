/**
 * Tutorial — Modais auxiliares (URL Help e Quick Tips).
 */

export function showUrlHelp() {
  const modal = document.createElement('div');
  modal.className = 'tour-modal-overlay';
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  modal.innerHTML = `
    <div class="tour-modal">
      <div class="tour-modal-header">
        <h2>❓ Como obter a URL do vídeo</h2>
        <button class="button button-ghost tour-modal-close" type="button">✕</button>
      </div>
      <div class="tour-modal-body">
        <ol class="tour-steps-list">
          <li><strong>Abra o vídeo</strong> no navegador e <strong>dê play</strong> para garantir que está carregando.</li>
          <li>Pressione <kbd>F12</kbd> para abrir o <strong>DevTools</strong> (ferramentas do desenvolvedor).</li>
          <li>Vá na aba <strong>Network</strong> (Rede).</li>
          <li>Digite <kbd>m3u8</kbd> no filtro (ou <kbd>media</kbd> — varia por plataforma).</li>
          <li>Clique no request que aparece na lista.</li>
          <li>Clique com o <strong>botão direito</strong> → <strong>Copy</strong> → <strong>Copy Request URL</strong>.</li>
          <li><strong>Cole a URL</strong> no StreamGrab e clique em <strong>Analisar</strong>.</li>
        </ol>
        <div class="tour-modal-tip">
          💡 Dica: para YouTube, Instagram, Facebook e TikTok, basta copiar o link do vídeo da barra de endereços!
        </div>
      </div>
      <div class="tour-modal-footer">
        <button class="button button-accent tour-modal-close-btn" type="button">Entendi!</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('.tour-modal-close').addEventListener('click', () => modal.remove());
  modal.querySelector('.tour-modal-close-btn').addEventListener('click', () => modal.remove());
}

export function showQuickTips() {
  const modal = document.createElement('div');
  modal.className = 'tour-modal-overlay';
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  modal.innerHTML = `
    <div class="tour-modal">
      <div class="tour-modal-header">
        <h2>💡 Dicas rápidas</h2>
        <button class="button button-ghost tour-modal-close" type="button">✕</button>
      </div>
      <div class="tour-modal-body">
        <ul class="tour-tips">
          <li>🚀 Use o <strong>modo Turbo</strong> para downloads mais rápidos em arquivos diretos e YouTube.</li>
          <li>📋 Ative a <strong>detecção automática de URL</strong> nas Configurações.</li>
          <li>📦 Use <strong>Download em lote</strong> para baixar vários vídeos de uma vez.</li>
          <li>⏸️ Downloads em andamento podem ser <strong>pausados e retomados</strong> na aba Fila.</li>
          <li>🔍 Use a <strong>busca no Histórico</strong> para encontrar downloads antigos.</li>
          <li>📤 <strong>Exporte seu histórico</strong> em CSV ou JSON para backup.</li>
        </ul>
      </div>
      <div class="tour-modal-footer">
        <button class="button button-accent tour-modal-close-btn" type="button">Legal!</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('.tour-modal-close').addEventListener('click', () => modal.remove());
  modal.querySelector('.tour-modal-close-btn').addEventListener('click', () => modal.remove());
}
