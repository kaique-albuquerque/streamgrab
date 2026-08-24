A spec está bem estruturada e a direção arquitetural está correta. Eu não faria uma reescrita completa. A recomendação é manter a proposta atual, mas fazer alguns ajustes antes da implementação para reduzir ambiguidade, evitar contratos excessivamente grandes e preparar melhor o StreamGrab para HLS/DASH paralelo, refresh de URLs, providers genéricos e futuras interfaces como Download Manager/API.

## 1. Simplificar o contrato público dos Providers

Hoje a spec propõe muitos métodos públicos opcionais:

```js
detect()
inspect()
analyze()
analyzePage()
findManifest()
getHeaders()
getCookies()
getReferer()
getOrigin()
chooseRequestMode()
getFormats()
prepareDownload()
refreshExpiredUrl()
```

Eu reduziria o contrato público moderno para algo mais simples:

```js
Provider {
  id
  label
  priority

  detect(input, context)

  resolve(input, context)

  getFormats?(resolution, context)

  prepareDownload(resolution, selection, context)

  refresh?(state, context)
}
```

O motivo é evitar que cada provider implemente a resolução de uma maneira diferente.

Por exemplo, com o contrato atual:

* um provider pode colocar headers em `getHeaders()`;
* outro pode colocar headers dentro de `inspect()`;
* outro pode resolver tudo dentro de `prepareDownload()`;
* outro pode fazer isso dentro de `analyzePage()`.

Com o tempo isso tende a gerar providers inconsistentes e difíceis de manter.

Métodos como:

```js
analyzePage()
findManifest()
getHeaders()
getCookies()
getReferer()
getOrigin()
```

podem continuar existindo internamente como helpers de cada provider, mas não precisam fazer parte do contrato público principal.

O fluxo moderno deveria ser principalmente:

```text
detect()
   ↓
resolve()
   ↓
ProviderResolution
   ↓
getFormats()
   ↓
prepareDownload()
   ↓
DownloadPlan
```

Durante a migração, `analyze()` pode continuar existindo para compatibilidade com os providers atuais.

---

## 2. Trocar `inspect()` por `resolve()`

Na spec, `inspect()` é descrito como o novo ponto de entrada de alto nível para providers ricos.

Eu usaria o nome:

```js
resolve()
```

O motivo é semântico.

O provider não está apenas "inspecionando" a URL. Ele está tentando transformar uma entrada em uma resolução utilizável pelo restante do StreamGrab.

Por exemplo:

```text
URL de uma página
      ↓
provider.resolve()
      ↓
ProviderResolution
      ↓
manifest + contexto + capabilities
```

`resolve()` deixa mais claro que esse método é responsável por resolver a fonte de mídia.

---

## 3. Adicionar `confidence` ao ProviderResolution

Eu adicionaria ao modelo:

```js
ProviderResolution {
  ...
  confidence: 'high' | 'medium' | 'low'
}
```

ou, alternativamente:

```js
confidence: 0.0 - 1.0
```

Isso é especialmente importante para o Generic Provider.

Exemplo:

```text
Encontrou um <video src="...mp4">
→ confidence: high

Encontrou claramente um master.m3u8 em JSON do player
→ confidence: high

Encontrou uma string qualquer terminando em .m3u8 no HTML
→ confidence: medium

Encontrou algo que apenas parece URL de mídia
→ confidence: low
```

O engine ou ProviderRegistry poderia tratar assim:

```text
high
→ utilizar

medium
→ validar antes

low
→ continuar procurando outras possibilidades
```

Isso ajuda a cumprir a própria regra da spec de:

> fail safely when confidence is low

sem depender apenas de lógica implícita.

---

## 4. Separar claramente Capabilities de StrategyHints

Essa separação já existe parcialmente na spec, mas eu deixaria explícita a responsabilidade de cada uma.

`capabilities` deve responder:

> O que este provider ou mídia consegue fazer?

Exemplo:

```js
capabilities: {
  refreshUrl: true,
  segmentedDownload: true,
  rangeDownload: false,
  qualitySelection: true
}
```

Já `strategyHints` deve responder:

> O que o provider recomenda ao engine?

Exemplo:

```js
strategyHints: {
  preferredTransport: 'segments',
  preferBrowserProfile: true
}
```

O provider não deveria controlar diretamente decisões como:

```text
use 16 workers
retry 20 vezes
esperar 500 ms
```

Essas decisões devem continuar pertencendo ao DownloadEngine/AdaptiveController.

Isso é importante principalmente para o Smart Turbo.

O provider diz:

```text
segment parallelism é suportado
```

e o Smart Turbo decide:

```text
2, 4, 8 ou 12 workers?
```

---

## 5. Separar Request Profile de Transport

Na spec atual existe:

```js
requestMode:
'default'
'browser-like'
'curl-impersonate'
'ffmpeg-safe'
```

Eu mudaria isso porque essa lista mistura dois conceitos diferentes.

`browser-like` descreve como a requisição deve parecer.

`curl-impersonate` e `ffmpeg` descrevem qual ferramenta/backend será usada para transportar os dados.

Eu separaria assim.

No `RequestContext`:

```js
RequestContext {
  headers
  cookies
  referer
  origin
  userAgent

  profile: 'default' | 'browser'
}
```

E no `StrategyHints`/`DownloadPlan`:

```js
preferredTransport:
  'http'
  'range'
  'curl'
  'ffmpeg'
  'segments'
  'ytdlp'
```

Conceitualmente:

```text
RequestContext
      ↓
Como a requisição deve se apresentar?

Transport
      ↓
Quem vai efetivamente buscar os bytes?
```

Isso prepara melhor a arquitetura para browser impersonation automática futuramente.

Por exemplo:

```text
profile = browser
transport = curl
```

ou:

```text
profile = default
transport = http
```

---

## 6. Evitar duplicação de headers no DownloadPlan

Hoje o `DownloadPlan` possui:

```js
headers: Record<string, string>
requestContext: RequestContext
```

mas `RequestContext` já possui:

```js
headers
```

Eu evitaria manter os dois como fontes independentes.

O ideal seria o `DownloadPlan` usar somente:

```js
requestContext
```

e manter todos os headers lá.

Caso seja realmente necessário existir algum header exclusivamente relacionado ao transporte, ele deve ter outro nome e propósito muito claro.

Ter duas fontes de headers pode gerar situações como:

```text
DownloadPlan.headers diz uma coisa
RequestContext.headers diz outra
```

e então surge a dúvida sobre qual tem prioridade.

---

## 7. Prever um modelo `DownloadTask`

O `DownloadPlan` descreve como uma mídia deve ser baixada.

Mas futuramente será necessário representar o estado de uma execução.

Eu adicionaria conceitualmente um modelo separado:

```js
DownloadTask {
  id

  plan

  status

  progress

  bytesDownloaded

  startedAt

  retryCount
  refreshCount

  controllerState

  diagnostics
}
```

A diferença seria:

```text
DownloadPlan
= receita de como baixar

DownloadTask
= execução dessa receita
```

Não precisa necessariamente implementar toda essa estrutura nesta primeira etapa.

Mas vale deixar essa separação prevista na arquitetura.

Ela será muito útil futuramente para:

```text
pause
resume
cancel
download manager
fila
Electron
API
Web UI
histórico
```

---

## 8. Melhorar o contrato de refresh

A parte de `refreshExpiredUrl()` está muito boa, mas eu generalizaria para:

```js
refresh(state, context)
```

em vez de o nome assumir que todo refresh é necessariamente de URL expirada.

Também faria o engine passar o motivo:

```js
provider.refresh({
  reason: 'expired-url',
  statusCode: 403,
  currentPlan,
  progress,
  refreshAttempt
})
```

Possíveis razões futuras:

```text
expired-url
expired-manifest
expired-segment-token
session-refresh
redirect-invalidated
```

Também deve existir um limite explícito:

```js
maxRefreshAttempts
```

Por exemplo:

```text
1º refresh
↓
tenta novamente

2º refresh
↓
tenta novamente

falhou novamente
↓
erro terminal
```

Nunca permitir loop infinito.

Também manter a regra já existente na spec:

> refresh não é retry.

Retry repete a mesma operação.

Refresh tenta obter um novo caminho de acesso válido.

---

## 9. Preservar seleção de qualidade após refresh

A spec menciona isso, mas eu tornaria requisito explícito.

Imagine:

```text
usuário escolheu 1080p
↓
download chegou a 70%
↓
manifest expirou
↓
provider.refresh()
```

O novo `DownloadPlan` deve tentar resolver novamente a mesma representação selecionada.

Não deveria simplesmente escolher automaticamente outra qualidade.

Algo conceitualmente como:

```js
refreshState: {
  selectedQuality: '1080p',
  selectedRepresentationId: 'video-1080',
  selectedAudioId: 'audio-pt'
}
```

Assim o refresh preserva a intenção original do usuário.

---

## 10. Alterar a ordem de implementação

A spec atualmente recomenda:

```text
1. richer provider models
2. legacy compatibility
3. generic provider
4. engine consumes DownloadPlan
5. refresh
6. adaptive controller
7. HLS segments
8. DASH segments
```

Eu mudaria para:

```text
1. criar os novos modelos e contratos
2. criar camada de compatibilidade legacy
3. fazer o DownloadEngine aceitar DownloadPlan
4. migrar gradualmente providers existentes
5. implementar Generic Provider
6. implementar refresh provider-owned
7. extrair AdaptiveController do Smart Turbo atual
8. implementar HLS segmented backend
9. implementar DASH segmented backend
```

O motivo principal é não construir o Generic Provider em cima de duas arquiteturas simultaneamente.

Primeiro fazemos:

```text
Provider
↓
DownloadPlan
↓
DownloadEngine
```

funcionar corretamente.

Depois o Generic Provider já nasce usando o modelo definitivo.

---

## 11. Adicionar Feature Flags para as novas funcionalidades

Durante a migração eu adicionaria flags para permitir rollback fácil.

Por exemplo:

```json
{
  "features": {
    "providerV2": false,
    "genericProvider": false,
    "providerRefresh": false,
    "adaptiveSegments": false,
    "hlsSegments": false,
    "dashSegments": false
  }
}
```

Não necessariamente precisam ser opções públicas.

Podem ser internas/configuráveis durante desenvolvimento.

Isso permite que, se:

```text
hls-segments
```

falhar em determinado cenário, o projeto ainda possa imediatamente usar:

```text
hls-ffmpeg
```

sem quebrar usuários existentes.

A migração deve ser progressiva, nunca big-bang.

---

## 12. Criar explicitamente a abstração de Transport Backend

A spec fala em transport families, mas eu formalizaria isso como uma abstração.

Algo conceitualmente como:

```js
TransportBackend {
  canHandle(plan)

  prepare(task)

  start(task)

  cancel(task)

  getMetrics()
}
```

Implementações:

```text
DirectHttpTransport
RangeTransport
FfmpegHlsTransport
SegmentedHlsTransport
FfmpegDashTransport
SegmentedDashTransport
CurlTransport
YtDlpTransport
```

Então o `DownloadEngine` deixa de conhecer detalhes específicos de cada implementação.

Fluxo:

```text
DownloadPlan
     ↓
StrategySelector
     ↓
TransportBackend
     ↓
AdaptiveController opcional
```

Isso também torna muito mais simples testar cada backend separadamente.

---

## 13. Manter o AdaptiveController separado dos backends

Essa decisão da spec está correta e deve ser reforçada.

Não criar:

```text
HlsSmartTurbo
DashSmartTurbo
RangeSmartTurbo
```

cada um com seu próprio algoritmo adaptativo.

Criar:

```text
AdaptiveController
```

que recebe métricas de qualquer backend.

Por exemplo:

```js
controller.observe({
  throughput,
  throughputPerWorker,
  latency,
  activeWorkers,
  completedJobs,
  failures,
  http429,
  http5xx
})
```

e retorna algo como:

```js
{
  targetConcurrency: 8,
  backoffMs: 0
}
```

Depois:

```text
RangeBackend
      │
      ├── metrics
      ↓
AdaptiveController

HLSBackend
      │
      ├── metrics
      ↓
AdaptiveController

DASHBackend
      │
      ├── metrics
      ↓
AdaptiveController
```

Assim melhorias futuras no algoritmo beneficiam todos os tipos de download.

---

## 14. Definir desde já as métricas do Smart Turbo

Eu adicionaria na spec uma seção explícita de métricas.

O AdaptiveController deveria conseguir observar pelo menos:

```text
throughput total
throughput por worker
latência média
latência p95
workers ativos
workers desejados
tarefas/segmentos concluídos
falhas por janela
429 por janela
5xx por janela
timeouts
retries
tempo desde último scale-up
tempo desde último scale-down
```

Isso é importante porque não basta medir apenas velocidade total.

Exemplo:

```text
4 workers = 40 MB/s
8 workers = 50 MB/s
12 workers = 51 MB/s
```

Nesse caso 12 provavelmente não compensa.

Também permite detectar:

```text
throughput total estabilizou
+
throughput por worker caiu muito
```

como possível throttling.

---

## 15. Definir hysteresis/cooldown no AdaptiveController

Uma melhoria importante que eu adicionaria ao Smart Turbo é impedir que a concorrência fique oscilando:

```text
4
→ 8
→ 4
→ 8
→ 4
```

O controlador deveria ter:

```text
measurement window
cooldown
minimum sustained improvement
minimum sustained degradation
```

Exemplo:

```text
só subir workers se houver ganho consistente durante N janelas

depois de subir:
não tomar outra decisão por X segundos

se houver 429:
reduzir imediatamente e entrar em cooldown
```

Isso evita comportamento instável.

---

## 16. Colocar backoff e Retry-After como requisitos explícitos

Para `429`, `503` e casos semelhantes:

```text
Retry-After presente
→ respeitar Retry-After

Retry-After ausente
→ exponential backoff + jitter
```

O Smart Turbo também deve reduzir concorrência antes de simplesmente repetir agressivamente.

Exemplo:

```text
8 workers
↓
429
↓
4 workers
↓
backoff
↓
estabilizou
↓
testar 6 futuramente
```

---

## 17. HLS segmentado deve começar como subset seguro

Não tentaria substituir FFmpeg para todo HLS imediatamente.

Criaria um suporte progressivo.

Exemplo inicial:

```text
HLS V1 segmented backend

✓ VOD
✓ master playlists
✓ media playlists
✓ URLs relativas
✓ redirects
✓ EXT-X-MAP
✓ fMP4
✓ BYTERANGE corretamente suportado
✓ AES-128 quando legitimamente acessível

caso complexo/desconhecido
→ fallback FFmpeg
```

Posteriormente pode ampliar.

O princípio deve ser:

```text
StreamGrab entende com segurança?
       ↓
      sim
       ↓
hls-segments

      não
       ↓
hls-ffmpeg
```

Nunca tentar forçar o backend segmentado em manifests que ele não entende completamente.

---

## 18. DASH deve seguir a mesma filosofia incremental

Primeira versão pode suportar apenas estruturas de MPD bem entendidas.

Exemplo:

```text
✓ Representation
✓ AdaptationSet
✓ BaseURL
✓ initialization segment
✓ SegmentTemplate
✓ SegmentTimeline quando implementado corretamente
✓ áudio separado
✓ vídeo separado
✓ mux posterior
```

Se o MPD utilizar uma estrutura ainda não suportada:

```text
dash-segments
↓
unsupported structure
↓
dash-ffmpeg
```

Isso deve ser considerado comportamento esperado, e não erro.

---

## 19. Tratar vídeo e áudio DASH como filas independentes

Para DASH, o AdaptiveController não deveria necessariamente considerar todos os segmentos como uma única fila cega.

Conceitualmente:

```text
DASH
 │
 ├── video queue
 │
 └── audio queue
```

O scheduler pode permitir que ambos avancem simultaneamente, mas deve evitar starvation.

Não queremos uma situação onde:

```text
todos os workers
→ vídeo

áudio
→ parado
```

Pode existir uma política mínima de fairness entre tracks.

Depois ambos são muxados.

---

## 20. Criar checkpoint/resume como extensão planejada do backend

Embora resume persistente HLS/DASH esteja fora do escopo inicial, a arquitetura do segmented backend não deveria impedir isso.

Cada unidade de download deve possuir identidade estável.

Exemplo:

```js
SegmentTask {
  trackId
  sequence
  url
  byteRange
  initSegment
  status
}
```

Futuramente fica simples persistir:

```text
segmento 1 ✓
segmento 2 ✓
segmento 3 ✓
segmento 4 pendente
```

Não precisa implementar persistência agora, mas não criar um backend impossível de retomar depois.

---

## 21. Melhorar o Generic Provider com pipeline de evidências

Em vez de simplesmente "scanear HTML por .m3u8/.mpd", eu organizaria como uma sequência de resolvers.

Algo como:

```text
GenericProvider

DirectMediaResolver
ManifestResolver
VideoTagResolver
KnownPlayerResolver
JsonMediaResolver
HtmlPatternResolver
```

Cada resolver retorna:

```js
{
  candidateUrl,
  mediaType,
  confidence,
  evidence
}
```

Depois o Generic Provider classifica candidatos.

Isso evita que vire no futuro um arquivo enorme cheio de regex.

---

## 22. Generic Provider deve validar candidatos

Se encontrar:

```text
https://site.com/video/master.m3u8
```

não deveria assumir imediatamente que é válido.

Quando possível deve fazer uma validação barata:

```text
HEAD ou GET controlado
↓
Content-Type
↓
manifest parseável?
↓
candidato confirmado
```

O mesmo para MPD.

Isso reduz falsos positivos.

---

## 23. Diferenciar descoberta da página e download

O provider pode usar uma determinada estratégia para descobrir a mídia, enquanto o download pode usar outra.

Exemplo:

```text
Página
↓
browser-compatible request
↓
descobre manifest

Manifest
↓
HTTP normal funciona
↓
HLS segments
```

Portanto, não assumir:

```text
se resolução da página precisou de curl-impersonate
então todos os segmentos também precisam.
```

O `RequestContext` pode precisar existir por estágio ou ser ajustável no `DownloadPlan`.

Isso deve ser previsto.

---

## 24. Browser impersonation não deve ser apenas um fallback para qualquer 403

Quando futuramente houver browser impersonation automática, ela não deve seguir:

```text
403
→ automaticamente curl-impersonate
```

porque 403 também pode significar:

```text
sem autorização
token realmente inválido
conteúdo indisponível
restrição legítima
```

O provider/diagnóstico deve indicar quando browser-compatible transport é apropriado.

A regra deveria ser mais próxima de:

```text
provider/candidate indica browser-profile suportado
+
falha compatível com diferença de cliente
→ tentar transporte browser-compatible
```

e nunca transformar isso em bypass de autenticação.

---

## 25. Adicionar uma camada de diagnóstico estruturado

Em vez de diagnostics ser apenas:

```js
diagnostics: object
```

eu definiria uma estrutura mínima.

Exemplo:

```js
diagnostics: {
  providerMatched,
  matchedBy,
  candidatesFound,
  finalCandidate,
  fallbacksUsed,
  requestProfile,
  transportSelected,
  refreshAttempts
}
```

Sempre sanitizado.

Nunca incluir:

```text
cookies completos
tokens completos
signed URLs completas
Authorization completo
```

Isso vai ajudar muito a investigar Issues no GitHub.

---

## 26. Padronizar sanitização de URLs e secrets

Criar um helper central para logs:

```js
sanitizeUrl()
sanitizeHeaders()
sanitizeDiagnostics()
```

Em vez de cada módulo tentar esconder tokens por conta própria.

Exemplo:

```text
https://cdn.com/master.m3u8?token=ABC123&expires=123
```

log:

```text
https://cdn.com/master.m3u8?token=***&expires=***
```

Isso deve valer para:

```text
provider
engine
transport
refresh
debug logs
Electron
CLI
```

---

## 27. Adicionar fallback como conceito explícito

A spec já fala que fallback não é bypass, o que está correto.

Eu formalizaria a cadeia.

Exemplo HLS:

```text
hls-segments
↓
backend informa UNSUPPORTED_MANIFEST_FEATURE
↓
hls-ffmpeg
```

Isso é diferente de:

```text
hls-segments
↓
401
↓
hls-ffmpeg
```

401 não deveria automaticamente causar fallback porque trocar de transporte não resolve autorização.

Então classificar erros em:

```text
unsupported
transient
refreshable
authentication
drm
permanent
```

e cada classe define o que pode acontecer depois.

---

## 28. Refinar a Error Taxonomy

Além dos erros já sugeridos, eu consideraria:

```text
PROVIDER_NOT_MATCHED
PROVIDER_RESOLUTION_LOW_CONFIDENCE
MANIFEST_UNSUPPORTED
TRANSPORT_UNSUPPORTED
TRANSPORT_TRANSIENT_FAILURE
URL_EXPIRED
REFRESH_LIMIT_REACHED
RATE_LIMITED
SEGMENT_RETRY_EXHAUSTED
MUX_FAILED
```

Não significa que todos precisam existir imediatamente.

Mas o objetivo é impedir que todo problema termine como:

```text
DOWNLOAD_FAILED
```

---

## 29. Criar StrategySelector como componente separado

Em vez de colocar toda escolha diretamente no DownloadEngine:

```text
DownloadPlan
↓
StrategySelector
↓
Transport
```

Exemplo:

```js
select(plan, runtimeCapabilities)
```

poderia escolher:

```text
direct-range
hls-segments
hls-ffmpeg
dash-segments
dash-ffmpeg
curl
ytdlp
```

Isso torna a lógica testável isoladamente.

---

## 30. Manter FFmpeg como safety net

Mesmo depois de implementar HLS/DASH segmentado, FFmpeg não deve ser removido.

Ele continuará sendo o backend de compatibilidade.

A filosofia deveria ser:

```text
StreamGrab-native segmented downloader
= fast path

FFmpeg
= compatibility path
```

Isso permite evoluir sem tentar reimplementar imediatamente todos os detalhes de HLS/DASH.

---

## 31. Expandir os testes do Generic Provider

Além dos testes já listados, adicionar fixtures para:

```text
HTML com <video src>
HTML com source múltiplo
HTML contendo JSON com m3u8
HTML contendo JSON com mpd
URL relativa
redirect da página
redirect do manifest
múltiplos manifests candidatos
falso positivo contendo ".m3u8" em texto
candidate com confidence low
Referer necessário
Origin necessário
```

Tudo local/controlado.

---

## 32. Expandir testes do AdaptiveController

Testar cenários sintéticos como:

```text
throughput aumenta a cada scale-up
→ deve subir workers
```

```text
throughput estabiliza
→ deve parar de aumentar
```

```text
throughput por worker despenca
→ deve detectar possível throttling
```

```text
429
→ deve reduzir concorrência
```

```text
5xx transitório
→ retry/backoff
```

```text
latência aumenta drasticamente
→ não continuar escalando
```

```text
oscilações pequenas
→ hysteresis deve impedir mudanças constantes
```

---

## 33. Adicionar benchmark como requisito de evolução do Smart Turbo

Criar benchmarks reproduzíveis para comparar:

```text
sequential
fixed concurrency
adaptive concurrency
FFmpeg
```

Por exemplo:

```text
Direct file
1 worker
4 workers
8 workers
Smart Turbo

HLS
FFmpeg
4 segments
8 segments
Adaptive

DASH
FFmpeg
fixed
Adaptive
```

Não usar benchmarks para prometer ganho fixo.

Usar para verificar que o Smart Turbo realmente melhora o throughput quando o servidor/rede permite.

---

## 34. Não fazer API/Web/Download Manager nesta fase

A arquitetura pode ser preparada para essas funcionalidades, mas eu não aumentaria o escopo agora.

Primeiro consolidar:

```text
Provider V2
DownloadPlan
RequestContext
Generic Provider
Refresh
Transport abstraction
AdaptiveController
HLS segmented
DASH segmented
```

Depois disso:

```text
DownloadTask
Download Manager
API
Web UI
plugins
```

ficam muito mais simples.

---

## 35. Ordem final recomendada

Eu implementaria nesta ordem:

```text
P1
Novos modelos:
ProviderResolution
RequestContext
DownloadPlan
Capabilities
StrategyHints

P2
Compatibility Adapter para providers antigos

P3
DownloadEngine passa a aceitar DownloadPlan

P4
StrategySelector + Transport abstractions

P5
Migrar providers atuais gradualmente

P6
Generic Provider + confidence + candidate validation

P7
Provider-owned refresh bounded

P8
Extrair Smart Turbo atual para AdaptiveController

P9
Métricas + hysteresis + cooldown + backoff

P10
HLS segmented backend

P11
Smart Turbo adaptativo para HLS

P12
DASH segmented backend

P13
Smart Turbo adaptativo para DASH

P14
Checkpoint-friendly task model

P15
Benchmarks e hardening
```

A compatibilidade com FFmpeg deve permanecer durante todas as fases.

---

## Resultado arquitetural desejado

A arquitetura final deveria caminhar para algo semelhante a:

```text
                   INPUT URL
                       │
                       ▼
               ProviderRegistry
                       │
                       ▼
                 Provider.resolve()
                       │
                       ▼
              ProviderResolution
                       │
             quality selection
                       │
                       ▼
                 DownloadPlan
                       │
                       ▼
                StrategySelector
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
      Direct          HLS            DASH
        │              │              │
     Range/HTTP    Segments/FFmpeg Segments/FFmpeg
        │              │              │
        └──────────────┼──────────────┘
                       │
                 metrics/events
                       │
                       ▼
              AdaptiveController
                       │
          concurrency/backoff
                       │
                       ▼
                 DownloadTask
                       │
                       ▼
             retry / refresh / mux
                       │
                       ▼
                    OUTPUT
```

A principal recomendação é preservar a ideia original da spec, mas tornar as responsabilidades mais claras:

**Provider resolve a plataforma.**

**ProviderResolution descreve o que foi encontrado.**

**RequestContext descreve como a sessão/requisição deve ser apresentada.**

**DownloadPlan descreve o que deve ser baixado.**

**StrategySelector decide qual backend usar.**

**Transport baixa os bytes.**

**AdaptiveController decide quanto paralelismo usar.**

**Provider.refresh() renova acesso temporário quando legitimamente suportado.**

**DownloadTask representa o estado da execução.**

**FFmpeg continua sendo o fallback de compatibilidade.**

Essa separação deve evitar que regras de plataforma, transporte, concorrência, refresh e parsing voltem a se misturar dentro do DownloadEngine.

O objetivo final deve continuar sendo o mesmo da spec atual: adicionar inteligência ao StreamGrab sem fazer uma reescrita total e sem quebrar os fluxos HLS, DASH, direct, yt-dlp e providers específicos que já funcionam.
