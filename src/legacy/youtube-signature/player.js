/**
 * YouTube signature — player JS URL extraction and sandboxed execution.
 */

import vm from 'node:vm';
import { extractObjectDefinition, extractFunctionDefinition } from './parse.js';
import { findHelperObjectName } from './finders.js';

/**
 * Extracts the player.js URL from YouTube page HTML.
 */
export function extractPlayerJsUrl(html, pageUrl = 'https://www.youtube.com') {
  const text = String(html || '');
  const patterns = [
    /"jsUrl":"([^"]+)"/,
    /"PLAYER_JS_URL":"([^"]+)"/,
    /<script\s+src="([^"]*\/s\/player\/[^"]+base\.js[^"]*)"/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const candidate = match[1].replace(/\\\//g, '/');
    return new URL(candidate, pageUrl).toString();
  }
  return '';
}

/**
 * Fetches the player JS source text.
 */
export async function fetchPlayerJs(url, headers = {}, timeoutMs = 30000) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': headers['User-Agent'] || headers['user-agent'] || 'Mozilla/5.0',
      ...headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

/**
 * Executes a named function from the player JS in an isolated VM sandbox.
 * Used for both decipher and n-transform operations.
 */
export function runPlayerFunction(playerJsText, functionName, input) {
  const functionDefinition = extractFunctionDefinition(playerJsText, functionName);
  if (!functionDefinition) {
    throw new Error(`Nao foi possivel extrair a funcao ${functionName} do player JS do YouTube.`);
  }

  const helperObjectName = findHelperObjectName(functionDefinition);
  const helperDefinition = helperObjectName
    ? extractObjectDefinition(playerJsText, helperObjectName) : '';

  const script = [
    helperDefinition,
    functionDefinition,
    `result=${functionName}(${JSON.stringify(input)});`,
  ].filter(Boolean).join('\n');

  const sandbox = { result: '' };
  vm.runInNewContext(script, sandbox, { timeout: 1000 });

  if (!sandbox.result || typeof sandbox.result !== 'string') {
    throw new Error(`A execucao da funcao ${functionName} nao produziu um resultado valido.`);
  }
  return sandbox.result;
}
