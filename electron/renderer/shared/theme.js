/** Aplicação e persistência do tema claro/escuro. */

export function applyTheme(theme, themeLabel) {
  document.body.dataset.theme = theme;
  if (themeLabel) {
    themeLabel.textContent = theme === 'light' ? 'Modo claro' : 'Modo escuro';
  }
}

export function initializeTheme(themeToggle, themeLabel) {
  const savedTheme = localStorage.getItem('vd-theme') || 'dark';
  applyTheme(savedTheme, themeLabel);
  themeToggle.checked = savedTheme === 'light';
  themeToggle.addEventListener('change', () => {
    const nextTheme = themeToggle.checked ? 'light' : 'dark';
    applyTheme(nextTheme, themeLabel);
    localStorage.setItem('vd-theme', nextTheme);
  });
}
