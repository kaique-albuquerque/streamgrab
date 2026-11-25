/**
 * Testes do subcomando `translate` da CLI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCliCommand } from '../../src/cli/commands/parse-command.js';
import { parseTranslateFlags } from '../../src/cli/commands/translate.js';

test('translate reconhece subcomando e flags', () => {
  const { command, url, rest } = parseCliCommand(['translate', 'a.srt', '--model', 'qwen2.5-7b']);
  assert.equal(command, 'translate');
  assert.equal(url, 'a.srt');
  assert.deepEqual(parseTranslateFlags(rest), { model: 'qwen2.5-7b', targetLang: 'pt' });
});

test('parseTranslateFlags aceita --target-lang', () => {
  assert.deepEqual(parseTranslateFlags(['--target-lang', 'pt']), { model: 'qwen3-4b', targetLang: 'pt' });
});

test('parseTranslateFlags ignora flags desconhecidas', () => {
  assert.deepEqual(parseTranslateFlags(['--nonsense', 'x']), { model: 'qwen3-4b', targetLang: 'pt' });
});

test('SIGINT apos main(help) nao lanca ReferenceError', async () => {
  // Antes da correção, `prompter` estava fora de escopo e o handler de SIGINT
  // lançava ReferenceError. Verificamos a correção sem executar o handler real
  // (que chama process.exit): o módulo precisa expor `prompter` como null
  // antes de main() e o handler não pode referenciar uma variável inexistente.
  const mod = await import('../../src/index.js');
  assert.equal(typeof mod.main, 'function');
  await mod.main(['help']);
  // `prompter` continua null (main(['help']) não cria prompter); o handler
  // usa `prompter?.close()` que é seguro com null.
  assert.equal(mod.prompter, null);
});