#!/usr/bin/env node
/* eslint-disable no-console */

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';

const rl = readline.createInterface({ input, output });

function runCommand(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    console.error(`\nErro ao executar ${command}: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) return false;
  return capture ? result.stdout : true;
}

function runGit(args, options) {
  return runCommand('git', args, options);
}

function runGh(args, options) {
  return runCommand('gh', args, options);
}

function currentBranch() {
  const branch = runGit(['branch', '--show-current'], { capture: true });
  return branch?.trim() || '(HEAD detached)';
}

async function confirm(question) {
  const answer = (await rl.question(`${question} [s/N] `)).trim().toLowerCase();
  return answer === 's' || answer === 'sim';
}

async function getLatestTag() {
  const tag = runGit(['describe', '--tags', '--abbrev=0'], { capture: true });
  return tag?.trim() || null;
}

async function getNextVersion() {
  const latest = await getLatestTag();
  if (!latest) return 'v1.0.0';

  const match = latest.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return 'v1.0.0';

  const [, major, minor, patch] = match.map(Number);
  console.log(`\nVersão atual: ${latest}`);
  console.log('Opções:');
  console.log(`  1. Patch (v${major}.${minor}.${patch + 1})`);
  console.log(`  2. Minor (v${major}.${minor + 1}.0)`);
  console.log(`  3. Major (v${major + 1}.0.0)`);
  console.log('  4. Personalizada');

  const choice = (await rl.question('Escolha: ')).trim();

  if (choice === '1') return `v${major}.${minor}.${patch + 1}`;
  if (choice === '2') return `v${major}.${minor + 1}.0`;
  if (choice === '3') return `v${major + 1}.0.0`;
  if (choice === '4') {
    const custom = (await rl.question('Digite a versão (ex: v2.0.0): ')).trim();
    return custom.startsWith('v') ? custom : `v${custom}`;
  }
  return `v${major}.${minor}.${patch + 1}`;
}

async function createAndPushTag() {
  const version = await getNextVersion();
  if (!version) {
    console.log('Criação de tag cancelada.');
    return;
  }

  const message = (await rl.question(`Mensagem para ${version} (Enter para padrão): `)).trim();
  const tagMessage = message || `Release ${version}`;

  console.log(`\nCriando tag ${version}...`);
  if (!runGit(['tag', '-a', version, '-m', tagMessage])) {
    console.log('Falha ao criar tag.');
    return;
  }

  if (await confirm(`Enviar tag ${version} para o GitHub?`)) {
    console.log('Enviando tag...');
    if (runGit(['push', 'origin', version])) {
      console.log(`\n✅ Tag ${version} enviada! O workflow de release será iniciado.`);
      console.log('   Acompanhe em: https://github.com/kaique-albuquerque/streamgrab/actions');
    }
  }
}

async function viewWorkflows() {
  console.log('\nBuscando workflows...');
  runGh(['run', 'list', '--limit', '10']);
}

async function viewWorkflowStatus() {
  console.log('\nStatus dos workflows:');
  runGh(['run', 'list', '--status', 'in_progress']);
  runGh(['run', 'list', '--status', 'queued']);
}

async function cancelWorkflow() {
  console.log('\nWorkflows em execução:');
  const output = runGh(['run', 'list', '--status', 'in_progress', '--json', 'databaseId,name'], { capture: true });
  if (!output) {
    console.log('Nenhum workflow em execução.');
    return;
  }

  console.log(output);
  const id = (await rl.question('ID do workflow para cancelar (Enter cancela): ')).trim();
  if (!id) return;

  if (await confirm(`Cancelar workflow ${id}?`)) {
    runGh(['run', 'cancel', id]);
  }
}

async function createRelease() {
  const version = await getNextVersion();
  if (!version) {
    console.log('Criação de release cancelada.');
    return;
  }

  const notes = (await rl.question('Release notes (Enter para gerar automático): ')).trim();

  console.log(`\nCriando release ${version}...`);
  const args = ['release', 'create', version, '--title', version];

  if (notes) {
    args.push('--notes', notes);
  } else {
    args.push('--generate-notes');
  }

  if (runGh(args)) {
    console.log(`\n✅ Release ${version} criada!`);
    console.log('   Acesse: https://github.com/kaique-albuquerque/streamgrab/releases');
  }
}

async function viewRelease() {
  console.log('\nÚltimas releases:');
  runGh(['release', 'list', '--limit', '5']);
}

async function showMenu() {
  console.clear();
  console.log('StreamGrab - Git Workflow');
  console.log(`Branch atual: ${currentBranch()}`);

  const latestTag = await getLatestTag();
  console.log(`Última tag: ${latestTag || 'nenhuma'}\n`);

  console.log('  1. Criar e enviar tag (trigger release)');
  console.log('  2. Criar release manual');
  console.log('  3. Ver workflows recentes');
  console.log('  4. Ver workflows em execução');
  console.log('  5. Cancelar workflow');
  console.log('  6. Ver releases');
  console.log('  7. Ver status');
  console.log('  8. Ver histórico');
  console.log('  0. Sair');
  return (await rl.question('\nEscolha uma opção: ')).trim();
}

async function main() {
  try {
    for (;;) {
      const choice = await showMenu();
      console.log('');

      if (choice === '0' || choice.toLowerCase() === 'sair') break;
      if (choice === '1') await createAndPushTag();
      else if (choice === '2') await createRelease();
      else if (choice === '3') viewWorkflows();
      else if (choice === '4') viewWorkflowStatus();
      else if (choice === '5') await cancelWorkflow();
      else if (choice === '6') viewRelease();
      else if (choice === '7') runGit(['status', '--short', '--branch']);
      else if (choice === '8') runGit(['log', '--oneline', '--decorate', '-10']);
      else console.log('Opção inválida.');

      if (choice !== '0') {
        await rl.question('\nPressione Enter para voltar ao menu...');
      }
    }
  } finally {
    rl.close();
  }
}

main();
