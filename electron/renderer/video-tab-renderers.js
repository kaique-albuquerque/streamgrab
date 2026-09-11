/**
 * Video Tab — Funções de renderização DOM.
 *
 * Cada função recebe o estado da aba e muta o DOM correspondente.
 * Importa de shared.js para utilitários e de video-tab-dom.js para canPreviewSource.
 */

import { appendLog, formatKbps, markAllPreviousAsDone, setActiveStep, setStatus } from './shared.js';
import { canPreviewSource } from './video-tab-dom.js';

export function renderMediaInfo(state) {
  const media = state.media;
  const fields = state.fields;
  if (!media) {
    fields.metadata.hidden = true;
    return;
  }
  fields.metadata.hidden = false;
  fields.metaTitle.textContent = media.title || 'Video';
  fields.metaDuration.textContent = media.durationLabel || '—';
  const providerBits = [media.provider, media.protocol].filter(Boolean).join(' · ');
  fields.metaProvider.textContent = providerBits || '—';
  fields.metaCodec.textContent = [media.resolution, media.codecs].filter(Boolean).join(' · ') || '—';
  fields.metaBitrate.textContent = media.bitrateLabel || '—';
  fields.metaSize.textContent = media.estimatedSizeLabel || '—';
  if (media.thumbnail && /^https?:\/\//i.test(media.thumbnail)) {
    fields.thumbnail.src = media.thumbnail;
    fields.thumbnail.hidden = false;
  } else {
    fields.thumbnail.removeAttribute('src');
    fields.thumbnail.hidden = true;
  }
}

export function renderQualities(state, emptyLabel = 'Nenhuma URL analisada ainda.') {
  const el = state.fields.qualities;
  el.innerHTML = '';

  if (!state.qualities.length) {
    el.classList.add('empty');
    el.textContent = emptyLabel;
    return;
  }

  el.classList.remove('empty');
  state.qualities.forEach((q, idx) => {
    const resolved = new URL(q.uri, state.analysisBaseUrl || state.fields.url.value.trim()).toString();
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `quality ${state.selectedQuality === resolved ? 'selected' : ''}`;
    item.disabled = state.busy;
    // Sentinel Security: Use textContent & DOM nodes instead of innerHTML to prevent XSS from unescaped media metadata
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = q.resolution || `variante ${idx + 1}`;
    const small1 = document.createElement('small');
    small1.textContent = `${q.height ? `${q.height}p` : 'Resolucao nao informada'}${q.bandwidth ? `  ~ ${formatKbps(q.bandwidth)}` : ''}`;
    div.append(strong, small1);

    const small2 = document.createElement('small');
    small2.textContent = q.codecs || 'Sem codecs informados';

    item.append(div, small2);
    item.addEventListener('click', () => {
      if (state.busy) return;
      state.selectedVariantUri = q.uri;
      state.selectedQuality = resolved;
      setActiveStep(state, 'variant');
      markAllPreviousAsDone(state, 'variant');
      setStatus(state, `Variant escolhida: ${q.resolution || `variante ${idx + 1}`}`);
      appendLog(state, `Variant escolhida: ${resolved}`);
      renderQualities(state);
    });
    el.appendChild(item);
  });
}

export function renderAudioSubtitleTracks(state) {
  const { audioTracks, subtitleTracks } = state;
  const section = state.fields.audioSubtitleSection;
  const audioContainer = state.fields.audioTracksContainer;
  const subtitleContainer = state.fields.subtitleTracksContainer;
  const noTracksMsg = state.fields.noTracksMessage;
  const audioSelect = state.fields.audioTrackSelect;
  const subtitleBoxes = state.fields.subtitleCheckboxes;

  const hasAudio = audioTracks.length > 1;
  const hasSubs = subtitleTracks.length > 0;

  if (!hasAudio && !hasSubs) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  if (hasAudio) {
    audioContainer.hidden = false;
    noTracksMsg.hidden = true;
    audioSelect.innerHTML = '';
    audioTracks.forEach((track) => {
      const opt = document.createElement('option');
      opt.value = track.language;
      opt.textContent = `${track.label || track.language}${track.isDefault ? ' (padrao)' : ''}`;
      if (track.isDefault) opt.selected = true;
      audioSelect.appendChild(opt);
    });
    audioSelect.onchange = () => {
      state.selectedAudioLanguage = audioSelect.value;
    };
    state.selectedAudioLanguage = audioSelect.value;
  } else {
    audioContainer.hidden = true;
  }

  if (hasSubs) {
    subtitleContainer.hidden = false;
    noTracksMsg.hidden = true;
    subtitleBoxes.innerHTML = '';
    subtitleTracks.forEach((track) => {
      const label = document.createElement('label');
      label.className = 'checkbox-inline';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = track.language;
      cb.checked = track.isDefault;
      cb.addEventListener('change', () => {
        state.selectedSubtitleLanguages = [...subtitleBoxes.querySelectorAll('input:checked')].map((el) => el.value);
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(` ${track.label || track.language}${track.isAutoGenerated ? ' (auto)' : ''}`));
      subtitleBoxes.appendChild(label);
    });
    state.selectedSubtitleLanguages = [...subtitleBoxes.querySelectorAll('input:checked')].map((el) => el.value);
  } else {
    subtitleContainer.hidden = true;
  }
}

/** Habilita/desabilita o botão "Pré-visualizar" conforme a fonte analisada. */
export function syncPreviewButton(state) {
  const btn = state.fields.previewBtn;
  if (!btn) return;
  const supported = Boolean(state.media) && canPreviewSource(state.media.sourceType);
  btn.disabled = !supported || state.busy;
  btn.title = supported
    ? 'Reproduzir um trecho do vídeo antes de baixar'
    : 'Preview indisponível para esta fonte';
}
