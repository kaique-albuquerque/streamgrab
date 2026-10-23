/**
 * Interpretação dos argumentos da CLI não-interativa.
 */

export function parseCliCommand(argv = []) {
  const first = argv[0];
  if (first === 'analyze' || first === 'download') {
    return { command: first, url: argv[1] || '', rest: argv.slice(2) };
  }
  if (first === 'help') {
    return { command: 'help', url: '', rest: argv.slice(1) };
  }
  return { command: 'interactive', url: '', rest: argv };
}
