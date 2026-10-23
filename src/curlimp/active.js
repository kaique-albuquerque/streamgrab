// Processos curl em andamento — usados para encerrar tudo no Ctrl+C.
export const active = new Set();

/**
 * Encerra todos os processos curl-impersonate ativos (usado no Ctrl+C).
 */
export function killAllCurl() {
  for (const child of active) {
    try {
      child.kill();
    } catch {
      /* ignora */
    }
  }
}
