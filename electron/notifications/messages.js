/** Montagem de título/corpo/clique das notificações agregadas. */

export function buildNotificationContent(events, type, { shell, focusWindow }) {
  const isMultiple = events.length > 1;

  if (type === 'complete') {
    const title = isMultiple
      ? `✅ ${events.length} downloads concluídos`
      : '✅ Download concluído';

    const names = events.slice(0, 3).map(e => e.job?.meta?.filename || 'vídeo');
    let body = names.join(', ');
    if (events.length > 3) body += ` e mais ${events.length - 3}`;

    // Se for único, clique abre o arquivo
    let onClick;
    if (!isMultiple && events[0]?.job?.meta?.output) {
      const outputPath = events[0].job.meta.output;
      onClick = () => {
        try { shell.openPath(outputPath); } catch { /* ignore */ }
        focusWindow();
      };
    }
    return { title, body, onClick };
  }

  const title = isMultiple
    ? `❌ ${events.length} downloads falharam`
    : '❌ Falha no download';

  const firstError = events[0]?.job?.error?.message || 'erro desconhecido';
  const names = events.slice(0, 2).map(e => e.job?.meta?.filename || 'vídeo');
  let body = names.join(', ');
  if (names.length) body += ` — ${firstError}`;
  else body = firstError;

  return { title, body, onClick: undefined };
}
