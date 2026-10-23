export const MODAL_HTML = `
  <div class="batch-modal">
    <div class="batch-header">
      <h2>📦 Download em Lote</h2>
      <button class="button button-ghost" data-action="close" type="button">✕</button>
    </div>
    <div class="batch-body">
      <label class="batch-field">
        <span class="batch-label">Cole as URLs (uma por linha):</span>
        <textarea class="batch-textarea" data-field="urls"
          placeholder="https://youtube.com/watch?v=abc&#10;https://exemplo.com/video.m3u8&#10;https://instagram.com/reel/xyz"></textarea>
      </label>

      <div class="batch-options">
        <div class="batch-option-row">
          <label class="batch-field batch-field-inline">
            <span class="batch-label">Pasta de saída:</span>
            <div class="inline-row">
              <input data-field="outputDir" placeholder="Downloads" />
              <button class="button button-ghost" data-action="pickDir" type="button">Escolher</button>
            </div>
          </label>
        </div>
        <label class="toggle">
          <input data-field="turbo" type="checkbox" />
          <span>⚡ Turbo — download paralelo por partes</span>
        </label>
      </div>

      <div class="batch-summary" data-field="summary">
        Cole as URLs acima. Cada vídeo será analisado e adicionado à fila.
      </div>

      <div class="batch-progress" data-field="progress" hidden></div>
    </div>
    <div class="batch-footer">
      <button class="button button-ghost" data-action="cancel" type="button">Cancelar</button>
      <button class="button button-accent" data-action="start" type="button">Analisar e enfileirar</button>
    </div>
  </div>
`;
