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

function parseLines(outputText) {
  return outputText.split('\n').map((item) => item.trim()).filter(Boolean);
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

async function restoreFile() {
  const outputText = runGit(['status', '--short'], { capture: true });
  if (outputText === false) return;

  const files = outputText
    .split('\n')
    .map((line) => line.trim().replace(/^.. /, '').replace(/^.* -> /, ''))
    .filter(Boolean);

  if (!files.length) {
    console.log('Não há arquivos alterados para restaurar.');
    return;
  }

  console.log('\nArquivos alterados:');
  files.forEach((file, index) => console.log(`  ${index + 1}. ${file}`));
  const choice = Number((await rl.question('Escolha o arquivo (Enter cancela): ')).trim());
  if (!Number.isInteger(choice) || choice < 1 || choice > files.length) return;

  const selected = files[choice - 1];
  if (!(await confirm(`Restaurar "${selected}" e descartar alterações locais?`))) return;
  runGit(['restore', '--staged', '--worktree', selected]);
}

async function selectBranch() {
  const outputText = runGit(['branch', '--format=%(refname:short)'], { capture: true });
  if (outputText === false) return;
  const branches = parseLines(outputText);
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

async function renameBranch() {
  const branch = currentBranch();
  if (branch === '(HEAD detached)') {
    console.log('Não é possível renomear uma branch enquanto o HEAD está destacado.');
    return;
  }

  const name = (await rl.question(`Novo nome para "${branch}": `)).trim();
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
    console.log('Nome de branch inválido.');
    return;
  }

  runGit(['branch', '-m', name]);
}

async function deleteBranch() {
  const branch = currentBranch();
  const outputText = runGit(['branch', '--format=%(refname:short)'], { capture: true });
  if (outputText === false) return;
  const branches = parseLines(outputText).filter((item) => item !== branch);
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
  const remotes = parseLines(remoteText);
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
  const branches = parseLines(outputText).filter((item) => item !== 'HEAD');
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

async function setUpstream() {
  const branch = currentBranch();
  if (branch === '(HEAD detached)') {
    console.log('Não é possível associar uma branch enquanto o HEAD está destacado.');
    return;
  }

  const remoteText = runGit(['remote'], { capture: true });
  if (remoteText === false) return;
  const remotes = parseLines(remoteText);
  if (!remotes.length) {
    console.log('Nenhum remoto configurado.');
    return;
  }

  console.log('\nRemotos:');
  remotes.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));
  const remoteChoice = Number((await rl.question('Escolha o remoto (Enter cancela): ')).trim());
  if (!Number.isInteger(remoteChoice) || remoteChoice < 1 || remoteChoice > remotes.length) return;

  const remote = remotes[remoteChoice - 1];
  if (!(await confirm(`Associar a branch "${branch}" ao remoto ${remote}?`))) return;
  runGit(['push', '--set-upstream', remote, branch]);
}

async function updateFromMain() {
  const branch = currentBranch();
  if (branch === 'main') {
    if (await confirm('Você já está na main. Executar git pull?')) runGit(['pull']);
    return;
  }

  if (await confirm(`Atualizar "${branch}" com a main via merge?`)) {
    runGit(['fetch', '--all', '--prune']);
    runGit(['merge', 'origin/main']);
  }
}

async function mergeBranch() {
  const branch = currentBranch();
  const outputText = runGit(['branch', '--format=%(refname:short)'], { capture: true });
  if (outputText === false) return;
  const branches = parseLines(outputText).filter((item) => item !== branch);
  if (!branches.length) {
    console.log('Não há outra branch local para mesclar.');
    return;
  }

  console.log('\nBranches disponíveis para merge:');
  branches.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));
  const choice = Number((await rl.question('Escolha a branch (Enter cancela): ')).trim());
  if (!Number.isInteger(choice) || choice < 1 || choice > branches.length) return;

  const selected = branches[choice - 1];
  if (!(await confirm(`Mesclar "${selected}" na branch atual "${branch}"?`))) return;
  runGit(['merge', selected]);
}

function listConflicts() {
  const outputText = runGit(['diff', '--name-only', '--diff-filter=U'], { capture: true });
  if (outputText === false) return;
  const files = parseLines(outputText);
  if (!files.length) {
    console.log('Nenhum arquivo com conflito encontrado.');
    return;
  }

  console.log('\nArquivos com conflitos:');
  files.forEach((file) => console.log(`  - ${file}`));
}

function openVsCode() {
  const root = runGit(['rev-parse', '--show-toplevel'], { capture: true });
  const result = spawnSync('code', [root ? root.trim() : '.'], { encoding: 'utf8', stdio: 'inherit' });
  if (result.error) console.error(`\nErro ao abrir VS Code: ${result.error.message}`);
}

async function createStash() {
  const message = (await rl.question('Mensagem do stash (Enter para padrão): ')).trim();
  runGit(message ? ['stash', 'push', '-u', '-m', message] : ['stash', 'push', '-u']);
}

async function selectStash(action) {
  const outputText = runGit(['stash', 'list'], { capture: true });
  if (outputText === false) return;
  const stashes = parseLines(outputText);
  if (!stashes.length) {
    console.log('Nenhum stash encontrado.');
    return;
  }

  console.log('\nStashes:');
  stashes.forEach((stash, index) => console.log(`  ${index + 1}. ${stash}`));
  const choice = Number((await rl.question('Escolha o stash (Enter cancela): ')).trim());
  if (!Number.isInteger(choice) || choice < 1 || choice > stashes.length) return;

  const stashRef = stashes[choice - 1].split(':')[0];
  if (action === 'apply') runGit(['stash', 'apply', stashRef]);
  if (action === 'drop' && await confirm(`Excluir ${stashRef}?`)) runGit(['stash', 'drop', stashRef]);
}

async function showMenu() {
  console.clear();
  console.log(`Branch atual: ${currentBranch()}\n`);

  console.log('ALTERAÇÕES\n');
  console.log('  1. Ver status');
  console.log('  2. Ver diff');
  console.log('  3. Adicionar todas as alterações');
  console.log('  4. Fazer commit');
  console.log('  5. Restaurar arquivo');

  console.log('\nSINCRONIZAÇÃO');
  console.log('  6. Buscar atualizações (fetch)');
  console.log('  7. Fazer pull');
  console.log('  8. Fazer push');
  console.log('  9. Associar branch ao remoto');
  console.log(' 10. Atualizar branch atual com a main');

  console.log('\nBRANCHES');
  console.log(' 11. Listar branches');
  console.log(' 12. Criar nova branch');
  console.log(' 13. Trocar de branch');
  console.log(' 14. Renomear branch');
  console.log(' 15. Excluir branch local');
  console.log(' 16. Excluir branch remota');
  console.log(' 17. Mesclar outra branch na atual');

  console.log('\nCONFLITOS');
  console.log(' 18. Listar arquivos com conflitos');
  console.log(' 19. Abrir projeto no VS Code');
  console.log(' 20. Continuar merge');
  console.log(' 21. Cancelar merge');

  console.log('\nSTASH');
  console.log(' 22. Criar stash');
  console.log(' 23. Listar stash');
  console.log(' 24. Aplicar stash');
  console.log(' 25. Excluir stash');

  console.log('\nINFORMAÇÕES');
  console.log(' 26. Ver histórico');
  console.log(' 27. Ver remotos');

  console.log('');
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
      else if (choice === '5') await restoreFile();
      else if (choice === '6') {
        if (await confirm('Buscar atualizações dos remotos?')) runGit(['fetch', '--all', '--prune']);
      } else if (choice === '7') {
        if (await confirm('Executar git pull?')) runGit(['pull']);
      } else if (choice === '8') {
        if (await confirm('Executar git push?')) runGit(['push']);
      } else if (choice === '9') await setUpstream();
      else if (choice === '10') await updateFromMain();
      else if (choice === '11') runGit(['branch', '-a']);
      else if (choice === '12') await createBranch();
      else if (choice === '13') await selectBranch();
      else if (choice === '14') await renameBranch();
      else if (choice === '15') await deleteBranch();
      else if (choice === '16') await deleteRemoteBranch();
      else if (choice === '17') await mergeBranch();
      else if (choice === '18') listConflicts();
      else if (choice === '19') openVsCode();
      else if (choice === '20') runGit(['merge', '--continue']);
      else if (choice === '21') {
        if (await confirm('Cancelar o merge em andamento?')) runGit(['merge', '--abort']);
      }
      else if (choice === '22') await createStash();
      else if (choice === '23') runGit(['stash', 'list']);
      else if (choice === '24') await selectStash('apply');
      else if (choice === '25') await selectStash('drop');
      else if (choice === '26') runGit(['log', '--oneline', '--decorate', '-10']);
      else if (choice === '27') runGit(['remote', '-v']);
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
