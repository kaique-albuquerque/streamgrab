/**
 * Tutorial — Definições dos passos do tour.
 */

export const STEPS = [
  {
    target: '[data-field="url"]',
    position: 'bottom',
    title: 'Passo 1 de 4',
    text: '📋 Cole a URL do vídeo\n\nAbra o vídeo no navegador, aperte F12 → Network, filtre por "m3u8", copie a URL do request e cole aqui.',
  },
  {
    target: '[data-action="analyze"]',
    position: 'top',
    title: 'Passo 2 de 4',
    text: '🔍 Analise o conteúdo\n\nClique em "Analisar playlist" para descobrir as qualidades de vídeo disponíveis.',
  },
  {
    target: '[data-field="qualities"]',
    position: 'bottom',
    title: 'Passo 3 de 4',
    text: '🎬 Escolha a qualidade\n\nSelecione a qualidade desejada. A melhor disponível é usada automaticamente se você não escolher nenhuma.',
  },
  {
    target: '[data-action="download"]',
    position: 'top',
    title: 'Passo 4 de 4',
    text: '⬇️ Baixe o vídeo\n\nClique em "Baixar agora" e aguarde. O arquivo será salvo na pasta Downloads.\n\nAcompanhe o progresso na aba "Fila".',
  },
];
