/** Feedback de estado na aba: status, log, métricas, progresso e steps. */

import { resolveDesiredFilename } from './filename.js';

export const STEP_ORDER = ['ffmpeg', 'url', 'variant', 'file', 'dir', 'download'];

export function setStatus(state, text) {
  state.fields.status.textContent = text;
}

export function appendLog(tab, line) {
  const content = [tab.fields.log.textContent, line].filter(Boolean).join('\n');
  const lines = content.split('\n').slice(-240);
  tab.fields.log.textContent = lines.join('\n');
  tab.fields.log.scrollTop = tab.fields.log.scrollHeight;
}

export function syncMetrics(state) {
  state.fields.timeValue.textContent = state.metrics.time;
  state.fields.sizeValue.textContent = state.metrics.size;
  state.fields.speedValue.textContent = state.metrics.speed;
}

export function resetProgress(state) {
  state.metrics = {
    time: '--:--:--',
    size: '0 B',
    speed: 'N/A',
  };
  state.fields.progress.style.width = '0%';
  state.fields.percent.textContent = '0%';
  syncMetrics(state);
}

export function setActiveStep(state, activeStep) {
  STEP_ORDER.forEach((step) => {
    const node = state.steps[step];
    if (!node) return;
    node.classList.toggle('active', step === activeStep);
  });
}

export function markAllPreviousAsDone(state, currentStep) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  STEP_ORDER.forEach((step, index) => {
    const node = state.steps[step];
    if (!node) return;
    node.classList.toggle('done', index < currentIndex);
  });
}

export function refreshResolvedOutput(state, defaultOutputDir) {
  const dir = state.fields.outputDir.value.trim() || defaultOutputDir || '';
  const outputName = resolveDesiredFilename(state);
  const output = dir ? `${dir}/${outputName}` : outputName;
  state.fields.resolvedOutput.textContent = output || 'Ainda nao definida';
}
