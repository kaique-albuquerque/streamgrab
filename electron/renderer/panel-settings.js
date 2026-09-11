/**
 * Painel de configurações — formulário de settings, salvar/restaurar.
 */

import { applyTheme } from './shared.js';

export function createSettingsPanel({ dom, onRefreshQueue }) {
  async function renderSettingsPanel() {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    let settings;
    try {
      settings = await window.api.settingsGet();
    } catch {
      return;
    }
    for (const input of form.querySelectorAll('[data-setting]')) {
      const key = input.dataset.setting;
      const value = settings[key];
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else if (input.type === 'number') input.value = value == null ? '' : String(value);
      else input.value = value == null ? '' : String(value);
    }
  }

  function collectSettingsForm() {
    const form = document.getElementById('settingsForm');
    const partial = {};
    for (const input of form.querySelectorAll('[data-setting]')) {
      const key = input.dataset.setting;
      if (input.type === 'checkbox') partial[key] = input.checked;
      else if (input.type === 'number') {
        const n = Number(input.value);
        partial[key] = Number.isFinite(n) ? n : null;
      } else {
        partial[key] = input.value.trim();
      }
    }
    return partial;
  }

  function settingsStatus(text, ok = true) {
    const el = document.querySelector('[data-field="settingsStatus"]');
    if (el) {
      el.textContent = text;
      el.style.color = ok ? 'var(--accent)' : 'var(--danger)';
    }
  }

  async function saveSettings() {
    const partial = collectSettingsForm();
    const res = await window.api.settingsUpdate(partial);
    if (res?.ok) {
      settingsStatus('Configuracoes salvas.');
      if (partial.theme === 'light' || partial.theme === 'dark') {
        localStorage.setItem('vd-theme', partial.theme);
        applyTheme(partial.theme, dom.themeLabel);
      }
      onRefreshQueue?.();
    } else {
      settingsStatus(res?.error || 'Falha ao salvar.', false);
    }
  }

  async function resetSettings() {
    await window.api.settingsReset();
    await renderSettingsPanel();
    settingsStatus('Configuracoes restauradas para o padrao.');
  }

  async function pickDir() {
    const picked = await window.api.pickOutputDir();
    if (picked) {
      const input = document.querySelector('[data-setting="defaultDir"]');
      if (input) input.value = picked;
    }
  }

  return { renderSettingsPanel, saveSettings, resetSettings, pickDir };
}
