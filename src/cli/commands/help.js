/**
 * Texto de ajuda da CLI não-interativa.
 */

export function printSubcommandHelp(io) {
  io.log('');
  io.log('StreamGrab - CLI nao-interativa');
  io.log('');
  io.log('Uso:');
  io.log('  streamgrab <url>                    Fluxo interativo (padrao)');
  io.log('  streamgrab analyze <url> [--json]   Analisa a URL sem interacao');
  io.log('  streamgrab download <url> [opcoes]  Baixa a URL sem interacao');
  io.log('');
  io.log('Opcoes do analyze:');
  io.log('  --json                       Saida em JSON (machine-readable)');
  io.log('  --cookies <arquivo>          cookies.txt (Netscape)');
  io.log('  --cookies-from-browser <b>   Extrai cookies do navegador');
  io.log('  --hotmart                    Headers padrao do embed Hotmart (isolado)');
  io.log('  --referer <url>              Header Referer');
  io.log('  --user-agent <ua>            Header User-Agent');
  io.log('');
  io.log('Opcoes do download:');
  io.log('  --output <dir>               Pasta de saida (padrao: Downloads)');
  io.log('  --filename <nome>            Nome do arquivo (sem extensao)');
  io.log('  --format <n|id>              Qualidade: indice 1..n ou formatId (ex.: 137)');
  io.log('  --audio-only                 Baixa apenas o audio');
  io.log('  --audio-lang <code>          Idioma do audio (ex: pt, en). Default: melhor disponivel');
  io.log('  --all-audio                  Baixa todas as faixas de audio (mux multi-audio)');
  io.log('  --subs <lang1,lang2>         Baixar legendas (ex: pt,en). --subs all = todas');
  io.log('  --embed-subs                 Embutir legendas no video (hardcoded)');
  io.log('  --turbo                      Download paralelo por partes (URLs diretas)');
  io.log('  --chunks <n>                 Conexoes do turbo (padrao: 8)');
  io.log('  --concurrency <n>            Alias mais claro para --chunks');
  io.log('  --no-resume                  Desliga resume do turbo (descarta parcial)');
  io.log('  --cookies <arquivo>          cookies.txt (Netscape)');
  io.log('  --cookies-from-browser <b>   Extrai cookies do navegador');
  io.log('  --curl-impersonate           Forca o modo curl-impersonate para HLS');
  io.log('  --hotmart                    Headers padrao do embed Hotmart (isolado)');
  io.log('  --referer <url>              Header Referer');
  io.log('  --user-agent <ua>            Header User-Agent');
  io.log('  --transcribe                 Transcrever apos download (~15min para 1h de video)');
  io.log('  --transcribe-lang <code>     Idioma da transcricao (padrao: pt)');
  io.log('  --no-timestamps              Nao gerar .md com timestamps');
}
