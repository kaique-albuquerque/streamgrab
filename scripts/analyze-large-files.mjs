#!/usr/bin/env node
/**
 * Analisa os arquivos do repositorio (.js/.mjs/.cjs, .yml/.yaml, .css,
 * .html) e gera um relatorio .md com os arquivos acima de um limite de
 * linhas (padrao: 150).
 *
 * Diretorios ignorados: node_modules, .git, dist, build, vendor, coverage,
 * tests e scripts (ferramentas/validacoes ficam de fora do relatorio).
 *
 * Uso:
 *   node scripts/analyze-large-files.mjs                # padrao: 150 linhas
 *   node scripts/analyze-large-files.mjs --min 300      # outro limite
 *   node scripts/analyze-large-files.mjs --out meu.md   # outro destino
 *
 * Via ntl: npm run analisar:linhas
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DEFAULT_MIN_LINES = 150;
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'relatorio-arquivos-grandes.md');

/** Extensoes analisadas (mjs/cjs contam como js). */
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.yml', '.yaml', '.css', '.html']);

/** Diretorios ignorados (nome da pasta, em qualquer nivel). */
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', 'coverage', 'tests', 'scripts']);

function parseArgs(argv) {
  let minLines = DEFAULT_MIN_LINES;
  let out = DEFAULT_OUT;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--min' && argv[i + 1]) {
      const value = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(value) && value > 0) minLines = value;
    } else if (argv[i] === '--out' && argv[i + 1]) {
      out = path.resolve(PROJECT_ROOT, argv[++i]);
    }
  }

  return { minLines, out };
}

/** Conta linhas de um arquivo (tolera ausencia de quebra final). */
function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.length === 0) return 0;
  const lines = content.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

/** Caminha recursivamente e coleta arquivos analisaveis. */
function collectFiles(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.isDirectory() && entry.name !== '.') {
      // ignora dirs ocultos (.git, .github e afins)
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) collectFiles(full, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EXTENSIONS.has(ext)) files.push(full);
    }
  }
  return files;
}

function typeLabel(ext) {
  if (['.js', '.mjs', '.cjs'].includes(ext)) return 'js';
  if (['.yml', '.yaml'].includes(ext)) return 'yml';
  if (ext === '.css') return 'css';
  return 'html';
}

function formatSize(bytes) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function buildReport({ files, largeFiles, minLines }) {
  const rel = (file) => path.relative(PROJECT_ROOT, file.path).replace(/\\/g, '/');
  const sorted = [...largeFiles].sort((a, b) => rel(a).localeCompare(rel(b), 'pt-BR', { sensitivity: 'base' }));
  const totalLines = largeFiles.reduce((sum, f) => sum + f.lines, 0);
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const byType = new Map();
  for (const file of largeFiles) {
    byType.set(file.type, (byType.get(file.type) || 0) + 1);
  }

  const lines = [];
  lines.push('# Relatório: arquivos grandes');
  lines.push('');
  lines.push(`> Gerado em ${now} por \`scripts/analyze-large-files.mjs\``);
  lines.push(`> Limite: **mais de ${minLines} linhas** · Arquivos analisados: **${files.length}** · Acima do limite: **${largeFiles.length}**`);
  lines.push('');
  lines.push(`**Resumo por tipo:** ${[...byType.entries()].map(([t, n]) => `${n} ${t}`).join(' · ') || 'nenhum'}`);
  lines.push(`**Linhas totais nos arquivos listados:** ${totalLines.toLocaleString('pt-BR')}`);
  lines.push('');

  if (sorted.length === 0) {
    lines.push(`Nenhum arquivo com mais de ${minLines} linhas. 🎉`);
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| # | Arquivo | Linhas | Tipo | Tamanho |');
  lines.push('|---|---------|--------|------|---------|');
  sorted.forEach((file, index) => {
    lines.push(`| ${index + 1} | \`${rel(file)}\` | ${file.lines} | ${file.type} | ${formatSize(file.size)} |`);
  });
  lines.push('');
  return lines.join('\n');
}

function main() {
  const { minLines, out } = parseArgs(process.argv.slice(2));

  console.log(`\n[analisar] Varredura em: ${PROJECT_ROOT}`);
  console.log(`[analisar] Limite: ${minLines} linhas · Extensões: js/yml/css/html`);

  const files = collectFiles(PROJECT_ROOT);
  const largeFiles = [];

  for (const filePath of files) {
    try {
      const stat = fs.statSync(filePath);
      const lines = countLines(filePath);
      if (lines > minLines) {
        largeFiles.push({
          path: filePath,
          lines,
          size: stat.size,
          type: typeLabel(path.extname(filePath).toLowerCase()),
        });
      }
    } catch {
      /* ignora arquivos inacessiveis */
    }
  }

  const report = buildReport({ files, largeFiles, minLines });
  fs.writeFileSync(out, `${report}\n`, 'utf8');

  console.log(`[analisar] ${files.length} arquivos verificados · ${largeFiles.length} acima de ${minLines} linhas`);
  console.log(`[analisar] Relatório gerado: ${path.relative(PROJECT_ROOT, out)}`);
  if (largeFiles.length > 0) {
    const top = [...largeFiles].sort((a, b) => b.lines - a.lines).slice(0, 5);
    console.log('[analisar] Maiores:');
    for (const file of top) {
      console.log(`  ${String(file.lines).padStart(5)} linhas  ${path.relative(PROJECT_ROOT, file.path)}`);
    }
  }
}

main();
