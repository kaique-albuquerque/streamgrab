/** Trava de controles durante operações e liberação de saída da fila. */

export function lockTab(state, busy) {
  state.busy = busy;
  state.fields.analyzeBtn.disabled = busy;
  state.fields.downloadBtn.disabled = busy;
  state.fields.enqueueBtn.disabled = busy;
  state.fields.url.disabled = busy;
  state.fields.filename.disabled = busy;
  state.fields.outputDir.disabled = busy;
  state.fields.pickDirBtn.disabled = busy;
  // SPEC-06: preview também trava durante o download
  if (state.fields.previewBtn) state.fields.previewBtn.disabled = busy;
  state.fields.qualities.querySelectorAll('button').forEach((btn) => {
    btn.disabled = busy;
  });
  const cancelable = busy || state.jobState === 'active' || state.jobState === 'queued';
  state.fields.cancelBtn.disabled = !cancelable;
  state.closeBtn.disabled = busy || state.jobState === 'active';
}

export function releaseOutput(activeOutputs, output, taskId) {
  if (!output) return;
  const owner = activeOutputs.get(output);
  if (owner === taskId) activeOutputs.delete(output);
}
