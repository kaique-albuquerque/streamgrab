#!/usr/bin/env node
/* eslint-disable no-console */

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';

const rl = readline.createInterface({ input, output });

function runGit(args, { capture = false } = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    console.error(`\nErro ao executar git: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) return false;
  return capture ? result.stdout : true;
}

function currentBranch() {
  const branch = runGit(['branch', '--show-current'], { capture: true });
  return branch?.trim() || '(HEAD detached)';
}

async function confirm(question) {
  const answer = (await rl.question(`${question} [s/N] `)).trim().toLowerCase();
  return answer === 's' || answer === 'sim';
}

async function commitChanges() {
  const message = (await rl.question('Mensagem do commit: ')).trim();
  if (!message) {
    console.log('Commit cancelado: a mensagem não pode ficar vazia.');
    return;
  }
  runGit(['commit', '-m', message]);
}

async function selectBranch() {
  const outputText = runGit(['branch', '--format=%(refname:short)'], { capture: true });
  if (outputText === false) return;
  const branches = outputText.split('\n').map((item) => item.trim()).filter(Boolean);
  if (!branches.length) return;

  console.log('\nBranches:');
  branches.forEach((branch, index) => console.log(`  ${index + 1}. ${branch}`));
  const choice = Number((await rl.question('Escolha a branch (Enter cancela): ')).trim());
  if (!Number.isInteger(choice) || choice < 1 || choice > branches.length) return;
  runGit(['switch', branches[choice - 1]]);
}

async function showMenu() {
  console.clear();
  console.log('StreamGrab - Git');
  console.log(`Branch atual: ${currentBranch()}\n`);
  console.log('  1. Ver status');
  console.log('  2. Ver diff');
  console.log('  3. Adicionar todas as alterações');
  console.log('  4. Fazer commit');
  console.log('  5. Fazer pull');
  console.log('  6. Fazer push');
  console.log('  7. Ver histórico');
  console.log('  8. Trocar de branch');
  console.log('  0. Sair');
  return (await rl.question('\nEscolha uma opção: ')).trim();
}

async function main() {
  try {
    for (;;) {
      const choice = await showMenu();
      console.log('');

      if (choice === '0' || choice.toLowerCase() === 'sair') break;
      if (choice === '1') runGit(['status', '--short', '--branch']);
      else if (choice === '2') runGit(['diff']);
      else if (choice === '3') {
        if (await confirm('Adicionar todas as alterações ao stage?')) runGit(['add', '-A']);
      } else if (choice === '4') await commitChanges();
      else if (choice === '5') {
        if (await confirm('Executar git pull?')) runGit(['pull']);
      } else if (choice === '6') {
        if (await confirm('Executar git push?')) runGit(['push']);
      } else if (choice === '7') runGit(['log', '--oneline', '--decorate', '-10']);
      else if (choice === '8') await selectBranch();
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
