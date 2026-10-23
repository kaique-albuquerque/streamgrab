/**
 * Resolve diretivas `<!--#include caminho/arquivo.html-->` em templates HTML,
 * buscando cada partial relativo ao diretorio base informado.
 *
 * Permite dividir templates grandes em partials pequenos mantendo um unico
 * `fetch` do template principal (inclusoes de um nivel).
 */

const INCLUDE_RE = /<!--\s*#include\s+([^\s>]+)\s*-->/g;

export function hasIncludes(html) {
  return typeof html === 'string' && /<!--\s*#include\s+/.test(html);
}

export async function resolveIncludes(html, baseUrl) {
  if (!hasIncludes(html)) return html;

  const targets = [...html.matchAll(INCLUDE_RE)].map((m) => m[1]);
  const parts = await Promise.all(
    targets.map(async (target) => {
      try {
        const res = await fetch(new URL(target, baseUrl));
        if (!res.ok) return '';
        return await res.text();
      } catch {
        return '';
      }
    }),
  );

  let index = 0;
  return html.replace(INCLUDE_RE, () => parts[index++]);
}
