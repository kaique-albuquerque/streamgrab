export async function downloadBuffer(url, { headers = {}, io = console } = {}) {
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('content-length') || 0);
  if (!res.body) return Buffer.from(await res.arrayBuffer());

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  let lastRender = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const now = Date.now();
    if (io?.log && total > 0 && now - lastRender > 250) {
      lastRender = now;
      const pct = ((received / total) * 100).toFixed(1);
      io.log(`[curl-impersonate] Baixando... ${pct}%`);
    }
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}
