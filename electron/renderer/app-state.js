export function createAppState() {
  return {
    tabs: new Map(),
    activeOutputs: new Map(),
    counter: 1,
    defaultOutputDir: '',
    activeTabId: '',
  };
}

export function getRendererDom() {
  return {
    tabBar: document.getElementById('tabBar'),
    tabPanels: document.getElementById('tabPanels'),
    // Lazy getter: o template é carregado via fetch() pelo loadTemplates()
    // e inserido no DOM DEPOIS que getRendererDom() já foi chamado no topo
    // do renderer.js. Sem o getter, dom.tabTemplate ficaria permanentemente null.
    get tabTemplate() { return document.getElementById('tabTemplate'); },
    newTabBtn: document.getElementById('newTabBtn'),
    themeToggle: document.getElementById('themeToggle'),
    themeLabel: document.querySelector('[data-theme-label]'),
  };
}
