/**
 * Erro de conversão com código amigável para a UI.
 */

export class ConvertError extends Error {
  /**
   * @param {string} message - Mensagem amigável
   * @param {object} [details]
   * @param {string} [details.code] - Código curto (ex.: 'INPUT_NOT_FOUND')
   * @param {string} [details.detail] - Detalhe técnico (stderr do FFmpeg)
   */
  constructor(message, { code = 'CONVERT_FAILED', detail = '' } = {}) {
    super(message);
    this.name = 'ConvertError';
    this.code = code;
    this.detail = detail;
  }
}