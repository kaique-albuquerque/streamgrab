/**
 * CLI não-interativa: `analyze` e `download`.
 *
 * Implementação dividida em `src/cli/commands/` (parse de comando e flags,
 * help, URL, análise, download, qualidade e fluxo de áudio).
 */

export { parseCliCommand } from './commands/parse-command.js';
export { printSubcommandHelp } from './commands/help.js';
export { parseAnalyzeFlags, parseDownloadFlags } from './commands/flags.js';
export { isValidHttpUrl, ensureExt } from './commands/url.js';
export { runAnalyzeCommand } from './commands/analyze.js';
export { runDownloadCommand, createNonInteractiveAnswers, buildDownloadArgv } from './commands/download.js';
export { resolveQualityChoice } from './commands/quality.js';
