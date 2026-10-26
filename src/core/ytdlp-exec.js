/**
 * Execucao do binario do yt-dlp sem shell.
 *
 * O `youtube-dl-exec` monta o comando com `shell: true` no Windows quando o
 * caminho do binario tem espacos — caso do app empacotado
 * (`C:\Users\<nome com espaco>\AppData\Local\Programs\streamgrab\resources\bin\yt-dlp.exe`)
 * e tambem do `node_modules` em pastas com espaco. Com shell, o `&` da query
 * string (`watch?v=X&list=Y&start_radio=1`) e lido pelo cmd.exe como separador
 * de comandos: o yt-dlp recebe a URL truncada e o resto vira
 * "'list' nao e reconhecido como um comando interno".
 *
 * Aqui o processo e criado com `spawn` e argv em array (sem shell), entao a URL
 * chega intacta. O contrato de retorno imita o do youtube-dl-exec
 * (`fn(url, flags)` resolve o JSON/string; `.exec(...)` devolve o
 * promise do processo com `.child` para cancelamento).
 */

import { spawn } from 'node:child_process';

/**
 * @param {string} binPath caminho do binario do yt-dlp
 * @param {{ buildArgs: (flags: object) => string[] }} deps mapper de flags
 *   (camelCase -> --kebab-case), reaproveitado do youtube-dl-exec.
 */
export function createYtDlpExec(binPath, { buildArgs }) {
  if (!binPath) throw new TypeError('createYtDlpExec: binPath e obrigatorio');
  if (typeof buildArgs !== 'function') throw new TypeError('createYtDlpExec: buildArgs e obrigatorio');

  function exec(url, flags = {}, opts = {}) {
    const argv = [url, ...buildArgs(flags)].filter((arg) => arg !== undefined && arg !== null);
    // `shell` nunca e habilitado: argv deve chegar ao processo sem passar por
    // reinterpretacao de `&`, `%`, `^` etc.
    const child = spawn(binPath, argv, { ...opts, shell: false, windowsHide: true });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });

    const promise = new Promise((resolve) => {
      const settle = (payload) => resolve({ stdout, stderr: payload.stderr ?? stderr, exitCode: payload.exitCode });
      child.on('error', (err) => {
        settle({ stderr: stderr || String(err?.message || err), exitCode: 1 });
      });
      child.on('close', (code) => {
        settle({ exitCode: typeof code === 'number' ? code : 1 });
      });
    });
    promise.child = child;
    return promise;
  }

  const ytDlp = (url, flags, opts) => exec(url, flags, opts).then(parseResult);

  ytDlp.exec = exec;
  return ytDlp;
}

function parseResult({ stdout, stderr, exitCode }) {
  if (exitCode === 0) {
    const out = String(stdout || '');
    return out.startsWith('{') ? JSON.parse(out) : out;
  }
  const error = new Error(stderr || `yt-dlp terminou com codigo ${exitCode}.`);
  error.stderr = stderr;
  error.stdout = stdout;
  error.exitCode = exitCode;
  return Promise.reject(error);
}
