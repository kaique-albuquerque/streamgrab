/**
 * Video Tab — DOM helpers e factory de estado.
 *
 * Funções puras de query/criação de DOM e fábrica de estado de aba.
 * Sem dependências de outros módulos video-tab.
 */

/** Fontes elegíveis para preview (espelha src/preview.js e o main). */
export function canPreviewSource(sourceType) {
  return ['hls', 'dash', 'direct', 'youtube', 'social', 'ytdlp'].includes(String(sourceType || '').toLowerCase());
}

export function collectTabFields(panel) {
  return {
    url: panel.querySelector('[data-field="url"]'),
    filename: panel.querySelector('[data-field="filename"]'),
    outputDir: panel.querySelector('[data-field="outputDir"]'),
    qualities: panel.querySelector('[data-field="qualities"]'),
    progress: panel.querySelector('[data-field="progressBar"]'),
    status: panel.querySelector('[data-field="status"]'),
    log: panel.querySelector('[data-field="log"]'),
    percent: panel.querySelector('[data-field="percent"]'),
    modeLabel: panel.querySelector('[data-field="modeLabel"]'),
    resolvedOutput: panel.querySelector('[data-field="resolvedOutput"]'),
    timeValue: panel.querySelector('[data-field="timeValue"]'),
    sizeValue: panel.querySelector('[data-field="sizeValue"]'),
    speedValue: panel.querySelector('[data-field="speedValue"]'),
    analyzeBtn: panel.querySelector('[data-action="analyze"]'),
    previewBtn: panel.querySelector('[data-action="preview"]'),
    downloadBtn: panel.querySelector('[data-action="download"]'),
    enqueueBtn: panel.querySelector('[data-action="enqueue"]'),
    cancelBtn: panel.querySelector('[data-action="cancel"]'),
    pickDirBtn: panel.querySelector('[data-action="pickDir"]'),
    openFileBtn: panel.querySelector('[data-action="openFile"]'),
    showInFolderBtn: panel.querySelector('[data-action="showInFolder"]'),
    revealRow: panel.querySelector('[data-field="revealRow"]'),
    metadata: panel.querySelector('[data-field="metadata"]'),
    thumbnail: panel.querySelector('[data-field="thumbnail"]'),
    metaTitle: panel.querySelector('[data-field="metaTitle"]'),
    metaDuration: panel.querySelector('[data-field="metaDuration"]'),
    metaProvider: panel.querySelector('[data-field="metaProvider"]'),
    metaCodec: panel.querySelector('[data-field="metaCodec"]'),
    metaBitrate: panel.querySelector('[data-field="metaBitrate"]'),
    metaSize: panel.querySelector('[data-field="metaSize"]'),
    turbo: panel.querySelector('[data-field="turbo"]'),
    audioSubtitleSection: panel.querySelector('[data-field="audioSubtitleSection"]'),
    audioTracksContainer: panel.querySelector('[data-field="audioTracksContainer"]'),
    audioTrackSelect: panel.querySelector('[data-field="audioTrackSelect"]'),
    allAudio: panel.querySelector('[data-field="allAudio"]'),
    subtitleTracksContainer: panel.querySelector('[data-field="subtitleTracksContainer"]'),
    subtitleCheckboxes: panel.querySelector('[data-field="subtitleCheckboxes"]'),
    embedSubs: panel.querySelector('[data-field="embedSubs"]'),
    noTracksMessage: panel.querySelector('[data-field="noTracksMessage"]'),
  };
}

export function createTabState({ id, tabButton, closeBtn, panel, fields }) {
  return {
    id,
    taskId: id,
    tabButton,
    closeBtn,
    panel,
    fields,
    selectedQuality: null,
    selectedVariantUri: '',
    qualities: [],
    audioTracks: [],
    subtitleTracks: [],
    sourceUrl: '',
    analysisBaseUrl: '',
    media: null,
    busy: false,
    duration: 0,
    outputPath: '',
    jobId: '',
    jobState: '',
    metrics: {
      time: '--:--:--',
      size: '0 B',
      speed: 'N/A',
    },
    steps: Object.fromEntries(
      [...panel.querySelectorAll('[data-step]')].map((node) => [node.dataset.step, node])
    ),
  };
}
