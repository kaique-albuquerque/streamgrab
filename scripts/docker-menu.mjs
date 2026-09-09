#!/usr/bin/env node
/* eslint-disable no-console */

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';

const rl = readline.createInterface({ input, output });

function runDockerCompose(args, { capture = false } = {}) {
  const result = spawnSync('docker-compose', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    console.error(`\nErro ao executar docker-compose: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) return false;
  return capture ? result.stdout : true;
}

function runDocker(args, { capture = false } = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    console.error(`\nErro ao executar docker: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) return false;
  return capture ? result.stdout : true;
}

async function confirm(question) {
  const answer = (await rl.question(`${question} [s/N] `)).trim().toLowerCase();
  return answer === 's' || answer === 'sim';
}

async function askUrl() {
  return (await rl.question('URL: ')).trim();
}

async function askFilename() {
  return (await rl.question('Nome do arquivo (Enter = video): ')).trim() || 'video';
}

async function analyzeUrl() {
  const url = await askUrl();
  if (!url) {
    console.log('Analise cancelada: URL vazia.');
    return;
  }
  runDockerCompose(['run', '--rm', 'streamgrab', 'analyze', url]);
}

async function downloadUrl() {
  const url = await askUrl();
  if (!url) {
    console.log('Download cancelado: URL vazia.');
    return;
  }
  const filename = await askFilename();
  runDockerCompose(['run', '--rm', 'streamgrab', 'download', url, '--filename', filename]);
}

async function downloadUrlWithOptions() {
  const url = await askUrl();
  if (!url) {
    console.log('Download cancelado: URL vazia.');
    return;
  }

  const filename = await askFilename();
  const format = (await rl.question('Formato/qualidade (Enter = melhor): ')).trim();
  const turbo = await confirm('Ativar turbo?');
  const curl = await confirm('Forcar curl-impersonate?');

  const args = ['run', '--rm', 'streamgrab', 'download', url, '--filename', filename];
  if (format) args.push('--format', format);
  if (turbo) args.push('--turbo');
  if (curl) args.push('--curl-impersonate');

  runDockerCompose(args);
}

function parseSelection(inputText, itemCount) {
  const raw = inputText.trim().toLowerCase();
  if (!raw) return [];
  if (raw === 'todos' || raw === 'todas') return Array.from({ length: itemCount }, (_, index) => index);

  const indexes = new Set();
  for (const part of raw.split(/[\s,]+/)) {
    const n = Number(part);
    if (Number.isInteger(n) && n >= 1 && n <= itemCount) indexes.add(n - 1);
  }
  return [...indexes];
}

function listProjectContainers() {
  const idsText = runDockerCompose(['ps', '-a', '-q'], { capture: true });
  if (idsText === false) return [];

  const ids = idsText.split(/\r?\n/).map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return [];

  const inspectText = runDocker(['inspect', '--format', '{{.ID}}\t{{.Name}}\t{{.State.Status}}', ...ids], { capture: true });
  if (inspectText === false) return [];

  return inspectText
    .split(/\r?\n/)
    .map((line) => {
      const [id, rawName, status] = line.split('\t');
      return {
        id: id || '',
        shortId: String(id || '').slice(0, 12),
        name: String(rawName || '').replace(/^\//, ''),
        status: status || 'unknown',
      };
    })
    .filter((item) => item.id);
}

async function removeStoppedContainers() {
  const stopped = listProjectContainers().filter((container) => container.status !== 'running');
  if (!stopped.length) {
    console.log('Nenhum container parado do projeto encontrado.');
    return;
  }

  console.log('\nContainers parados do projeto:');
  stopped.forEach((container, index) => {
    console.log(`  ${index + 1}. ${container.name} (${container.shortId}, ${container.status})`);
  });

  const selection = await rl.question('\nEscolha os containers (ex: 1,3 ou todos; Enter cancela): ');
  const indexes = parseSelection(selection, stopped.length);
  if (!indexes.length) {
    console.log('Remocao cancelada.');
    return;
  }

  const selected = indexes.map((index) => stopped[index]);
  console.log('\nSelecionados:');
  selected.forEach((container) => console.log(`  - ${container.name} (${container.shortId})`));

  if (!(await confirm('Remover os containers selecionados?'))) return;
  runDocker(['rm', ...selected.map((container) => container.id)]);
}

async function showMenu() {
  console.clear();
  console.log('StreamGrab - Docker CLI');
  console.log('Saida padrao: ./downloads\n');
  console.log('  1. Build da imagem');
  console.log('  2. Abrir CLI interativa');
  console.log('  3. Mostrar help');
  console.log('  4. Analisar URL');
  console.log('  5. Baixar URL');
  console.log('  6. Baixar URL com opcoes');
  console.log('  7. Listar containers/imagens do projeto');
  console.log('  8. Remover containers parados do projeto');
  console.log('  0. Sair');
  return (await rl.question('\nEscolha uma opcao: ')).trim();
}

async function main() {
  try {
    for (;;) {
      const choice = await showMenu();
      console.log('');

      if (choice === '0' || choice.toLowerCase() === 'sair') break;
      if (choice === '1') runDockerCompose(['build']);
      else if (choice === '2') runDockerCompose(['run', '--rm', 'streamgrab']);
      else if (choice === '3') runDockerCompose(['run', '--rm', 'streamgrab', 'help']);
      else if (choice === '4') await analyzeUrl();
      else if (choice === '5') await downloadUrl();
      else if (choice === '6') await downloadUrlWithOptions();
      else if (choice === '7') {
        runDockerCompose(['ps', '-a']);
        runDockerCompose(['images']);
      } else if (choice === '8') {
        await removeStoppedContainers();
      } else console.log('Opcao invalida.');

      if (choice !== '0') {
        await rl.question('\nPressione Enter para voltar ao menu...');
      }
    }
  } finally {
    rl.close();
  }
}

main();
