/** Status do engine de transcrição (badge + texto do painel). */

export async function refreshEngineStatus() {
  const infoEl = document.getElementById('transcribeEngineInfo');
  const badgeEl = document.getElementById('transcribeEngineBadge');
  if (!infoEl || !badgeEl) return;

  const res = await window.api.transcribeCheck();
  if (res?.ok) {
    badgeEl.dataset.state = 'done';
    badgeEl.textContent = 'Disponível';
    const model = res.whisperCpp?.available ? `whisper.cpp (${res.whisperCpp.binPath})` : res.engine;
    infoEl.textContent = `Engine: ${model}`;
  } else {
    badgeEl.dataset.state = 'error';
    badgeEl.textContent = 'Indisponível';
    infoEl.textContent = res?.reason || 'Nenhum engine de transcrição encontrado.';
  }
}
