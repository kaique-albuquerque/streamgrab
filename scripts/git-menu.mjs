#!/usr/bin/env node
/* eslint-disable no-console, complexity */

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

async function createBranch() {
  const name = (await rl.question('Nome da nova branch: ')).trim();
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
    console.log('Nome de branch inválido.');
    return;
  }
  runGit(['switch', '-c', name]);
}

async function deleteBranch() {
  const branch = currentBranch();
  const outputText = runGit(['branch', '--format=%(refname:short)'], { capture: true });
  if (outputText === false) return;
  const branches = outputText.split('\n').map((item) => item.trim()).filter((item) => item && item !== branch);
  if (!branches.length) {
    console.log('Não há outra branch local para excluir.');
    return;
  }

  console.log('\nBranches locais disponíveis para exclusão:');
  branches.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));
  const choice = Number((await rl.question('Escolha a branch (Enter cancela): ')).trim());
  if (!Number.isInteger(choice) || choice < 1 || choice > branches.length) return;

  const selected = branches[choice - 1];
  if (!(await confirm(`Excluir a branch local "${selected}"?`))) return;
  runGit(['branch', '-d', selected]);
}

async function deleteRemoteBranch() {
  const remoteText = runGit(['remote'], { capture: true });
  if (remoteText === false) return;
  const remotes = remoteText.split('\n').map((item) => item.trim()).filter(Boolean);
  if (!remotes.length) {
    console.log('Nenhum remoto configurado.');
    return;
  }

  console.log('\nRemotos:');
  remotes.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));
  const remoteChoice = Number((await rl.question('Escolha o remoto (Enter cancela): ')).trim());
  if (!Number.isInteger(remoteChoice) || remoteChoice < 1 || remoteChoice > remotes.length) return;
  const remote = remotes[remoteChoice - 1];

  const outputText = runGit(['for-each-ref', `refs/remotes/${remote}/`, '--format=%(refname:strip=3)'], { capture: true });
  if (outputText === false) return;
  const branches = outputText
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item && item !== 'HEAD');
  if (!branches.length) {
    console.log(`Nenhuma branch encontrada no remoto ${remote}.`);
    return;
  }

  console.log(`\nBranches remotas em ${remote}:`);
  branches.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));
  const branchChoice = Number((await rl.question('Escolha a branch (Enter cancela): ')).trim());
  if (!Number.isInteger(branchChoice) || branchChoice < 1 || branchChoice > branches.length) return;

  const selected = branches[branchChoice - 1];
  if (!(await confirm(`Excluir a branch remota ${remote}/${selected}?`))) return;
  runGit(['push', remote, '--delete', selected]);
}

async function showMenu() {
  console.clear();
  console.log('StreamGrab - Git');
  console.log(`Branch atual: ${currentBranch()}\n`);
  console.log('  1. Adicionar todas as alterações');
  console.log('  2. Buscar atualizações (fetch)');
  console.log('  3. Criar nova branch');
  console.log('  4. Excluir branch local');
  console.log('  5. Excluir branch remota');
  console.log('  6. Fazer commit');
  console.log('  7. Fazer pull');
  console.log('  8. Fazer push');
  console.log('  9. Listar branches');
  console.log(' 10. Listar stash');
  console.log(' 11. Trocar de branch');
  console.log(' 12. Ver diff');
  console.log(' 13. Ver histórico');
  console.log(' 14. Ver remotos');
  console.log(' 15. Ver status');
  console.log('  0. Sair');
  return (await rl.question('\nEscolha uma opção: ')).trim();
}

async function main() {
  try {
    for (;;) {
      const choice = await showMenu();
      console.log('');

      if (choice === '0' || choice.toLowerCase() === 'sair') break;
      if (choice === '1') {
        if (await confirm('Adicionar todas as alterações ao stage?')) runGit(['add', '-A']);
      } else if (choice === '2') {
        if (await confirm('Buscar atualizações dos remotos?')) runGit(['fetch', '--all', '--prune']);
      } else if (choice === '3') await createBranch();
      else if (choice === '4') await deleteBranch();
      else if (choice === '5') await deleteRemoteBranch();
      else if (choice === '6') await commitChanges();
      else if (choice === '7') {
        if (await confirm('Executar git pull?')) runGit(['pull']);
      } else if (choice === '8') {
        if (await confirm('Executar git push?')) runGit(['push']);
      } else if (choice === '9') runGit(['branch', '-a']);
      else if (choice === '10') runGit(['stash', 'list']);
      else if (choice === '11') await selectBranch();
      else if (choice === '12') runGit(['diff']);
      else if (choice === '13') runGit(['log', '--oneline', '--decorate', '-10']);
      else if (choice === '14') runGit(['remote', '-v']);
      else if (choice === '15') runGit(['status', '--short', '--branch']);
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
