/** Erros compartilhados do transporte curl. */

export function abortError() {
  const err = new Error('Operacao cancelada.');
  err.code = 'CANCELLED';
  return err;
}
