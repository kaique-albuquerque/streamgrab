/** SPEC-03: diálogo de download em lote. */

import { createBatchDialog } from '../batch-dialog.js';

export function setupBatchDialog({ appState, getPanels }) {
  const batchDialog = createBatchDialog({
    api: window.api,
    getDefaultOutputDir: () => appState.defaultOutputDir || '',
    onEnqueued: () => {
      getPanels()?.refreshQueuePanel();
    },
  });

  const batchBtn = document.getElementById('batchBtn');
  if (batchBtn) {
    batchBtn.addEventListener('click', () => batchDialog.open());
  }
  return batchDialog;
}
