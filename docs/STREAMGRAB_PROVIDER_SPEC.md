# StreamGrab Provider and Adaptive Download Spec

## 1. Objective

This document specifies the next architectural evolution of StreamGrab's provider and download layers.

The goal is to evolve providers from simple source recognizers into intelligent platform/CDN adapters that can:

- detect the platform
- resolve the media source from a page or entry URL
- discover manifests and direct media URLs
- derive the required request context
- recommend a safe transport strategy
- refresh temporary access when supported
- provide clean inputs to the download engine and adaptive controller

This spec defines the target behavior and contracts. It does not authorize implementation by itself.

---

## 2. Current State Summary

The current provider contract is effectively:

- `detect(url, opts)`
- `analyze({ url, headers, auth })`
- `getFormats(media)`
- `prepareDownload({ url, analysis, selectedUrl, headers, auth, ... })`

That contract already works for:

- HLS manifests
- DASH manifests
- direct media
- yt-dlp-backed platforms
- custom providers such as Mercado Play

However, it is still limited for:

- HTML pages with embedded players
- platforms that require `Referer` or `Origin`
- pages that expose manifests indirectly through JSON or player bootstrap data
- temporary signed URLs
- provider-owned refresh of expiring access
- future segmented HLS/DASH parallel backends

---

## 3. Design Goals

The new provider layer should:

- preserve the existing architecture and avoid a big-bang rewrite
- remain compatible with current providers during migration
- move platform-specific logic out of the engine and into providers
- introduce a strong generic fallback provider
- support future adaptive downloading for direct, HLS, and DASH
- keep security rules intact
- never blur the boundary between supported access and DRM/auth bypass

Non-goals for the first implementation phase:

- universal browser automation
- DRM circumvention
- full live-stream support
- full persistent segmented resume for HLS/DASH
- browser-cookie extraction as a product feature

---

## 4. Proposed Model

The target conceptual flow is:

```text
URL or page
  -> ProviderRegistry
  -> provider.resolve()
  -> ProviderResolution
  -> quality selection
  -> DownloadPlan
  -> StrategySelector
  -> TransportBackend
  -> DownloadTask execution
  -> output
```

The key architectural shift is:

- the provider resolves the platform
- the resolution describes what was found
- the download plan describes what should be downloaded
- the strategy selector chooses how to fetch the bytes

---

## 4.1 ProviderSession Decision

The current architecture draft mentioned `provider-session.js`, but that abstraction should only exist if it has a concrete, immediate responsibility distinct from:

- `ProviderResolution`
- `RequestContext`
- `DownloadPlan`
- `DownloadTask`

At this stage, the architecture should not require a separate `ProviderSession` by default.

If introduced later, `ProviderSession` must have a clear role such as holding provider-owned temporary state that must survive across:

- `resolve()`
- `prepareDownload()`
- `refresh()`

Examples could include:

- provider-issued temporary state required for refresh
- normalized resolution state that should not be recomputed
- provider-specific refresh metadata that does not belong in `DownloadPlan`

Until that need is concrete, `ProviderSession` should remain out of scope rather than be added speculatively.

---

## 5. Provider Responsibilities

Each provider becomes responsible for the full resolution flow for its platform when applicable.

Public responsibilities should stay small and consistent:

- `detect()`
- `resolve()`
- `getFormats()`
- `prepareDownload()`
- `refresh()`

Helpers such as page parsing, manifest discovery, header derivation, and player heuristics may still exist, but they should remain internal implementation details rather than part of the main public contract.

Examples of internal helpers:

- `analyzePage()`
- `findManifest()`
- `deriveHeaders()`
- `deriveCookies()`
- `deriveReferer()`
- `deriveOrigin()`

---

## 6. Proposed Provider Contract

Recommended public contract:

```js
Provider {
  id: string
  label: string
  priority: number
  supportsQualitySelection?: boolean

  detect(input, context): boolean

  resolve(input, context): Promise<ProviderResolution>

  getFormats?(resolution, context): Format[]

  prepareDownload(resolution, selection, context): Promise<DownloadPlan>

  refresh?(state, context): Promise<RefreshedDownloadPlan | null>
}
```

### Notes

- `detect()` stays fast and cheap.
- `resolve()` becomes the modern high-level entry point.
- `analyze()` remains supported during migration for backward compatibility.
- `prepareDownload()` should return a `DownloadPlan`, not only a URL.
- `refresh()` is intentionally broader than `refreshExpiredUrl()` so it can support expiring manifests, expiring tokens, or session renewal in the future.

---

## 7. Core Supporting Models

### 7.1 ProviderResolution

```js
ProviderResolution {
  contractVersion?: 2
  providerId: string
  kind?: string
  sourceUrl?: string
  matchedBy: 'url' | 'content-type' | 'html' | 'player' | 'manifest' | 'fallback'
  confidence: 'high' | 'medium' | 'low'
  pageUrl: string
  canonicalUrl: string
  manifestUrl: string
  mediaUrl: string
  formats?: Format[]
  mediaInfo: MediaInfo | null
  requestContext: RequestContext
  capabilities: ProviderCapabilities
  strategyHints: StrategyHints
  diagnostics: ResolutionDiagnostics
}
```

`confidence` is especially important for the generic provider:

- `high`: directly usable
- `medium`: validate before trusting fully
- `low`: continue searching or fail safely

Minimum contract guidance:

- required:
  - `providerId`
  - `matchedBy`
  - `confidence`
  - `requestContext`
  - `capabilities`
  - `strategyHints`
  - `diagnostics`
- optional:
  - `contractVersion`
  - `kind`
  - `sourceUrl`
  - `pageUrl`
  - `canonicalUrl`
  - `manifestUrl`
  - `mediaUrl`
  - `formats`
  - `mediaInfo`

Recommended defaults:

- `requestContext`: `{ headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' }`
- `capabilities`: `{}`
- `strategyHints`: `{}`
- `diagnostics`: `{}`

Versioning note:

- `contractVersion` is optional
- it may be used internally during migration if it helps distinguish legacy adapter output from normalized contract output
- if the compatibility adapter already provides an equally safe distinction, no extra version field is required

### 7.2 ProviderCapabilities

Capabilities answer:

> What is supported by this provider or resolved media?

```js
ProviderCapabilities {
  qualitySelection?: boolean
  refreshAccess?: boolean
  rangeDownload?: boolean
  segmentedDownload?: boolean
  smartConcurrency?: boolean
  browserProfileSupported?: boolean
}
```

### 7.3 StrategyHints

Strategy hints answer:

> What does the provider recommend to the engine?

```js
StrategyHints {
  preferredTransport?: 'http' | 'range' | 'curl' | 'ffmpeg' | 'segments' | 'ytdlp'
  preferBrowserProfile?: boolean
  preserveSelectedVariant?: boolean
}
```

Providers may recommend, but they should not control:

- worker count
- retry counts
- cooldown windows
- low-level adaptive policy

Those remain engine/controller decisions.

### 7.4 RequestContext

`RequestContext` should describe how the request must present itself, not which transport implements it.

```js
RequestContext {
  headers: Record<string, string>
  cookies: CookieContext | null
  referer: string
  origin: string
  userAgent: string
  profile: 'default' | 'browser'
}
```

This deliberately separates:

- request presentation
- transport/backend selection

So the system can express combinations such as:

- `profile = browser`, `transport = curl`
- `profile = default`, `transport = http`

### 7.5 DownloadPlan

The `DownloadPlan` describes how the media should be downloaded.

```js
DownloadPlan {
  contractVersion?: 2
  kind: 'direct' | 'hls' | 'dash' | 'mux' | 'ytdlp'
  source: object
  requestContext: RequestContext
  selectedFormat?: object | null
  capabilities: ProviderCapabilities
  strategyHints: StrategyHints
  output?: object | null
  providerState?: object | null
  refreshState?: object
}
```

`DownloadPlan` should not duplicate `headers` outside `requestContext`.

Minimum contract guidance:

- required:
  - `kind`
  - `source`
  - `requestContext`
  - `capabilities`
  - `strategyHints`
- optional:
  - `contractVersion`
  - `selectedFormat`
  - `output`
  - `providerState`
  - `refreshState`

The engine should consume the normalized plan rather than guess semantics from provider-specific field names.

### 7.6 DownloadTask

The architecture should also reserve a conceptual distinction between plan and execution:

```js
DownloadTask {
  id: string
  plan: DownloadPlan
  status: string
  progress: object
  bytesDownloaded: number
  retryCount: number
  refreshCount: number
  attemptedStrategies: Set<string>
  controllerState: object
  diagnostics: object
}
```

Difference:

- `DownloadPlan` = recipe
- `DownloadTask` = running execution of that recipe

This model does not need full implementation in the first step, but the architecture should not block it.

The task lifecycle should be able to distinguish at least:

- `DOWNLOADING`
- `DOWNLOADED`
- `PROCESSING`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

---

## 8. Generic Provider

The new architecture should include a strong `generic` provider.

Its role is to improve fallback behavior when no specific provider matches.

### 8.1 Generic Provider Objectives

- inspect pages that are not directly identifiable by URL
- discover HLS or DASH manifests from HTML
- discover direct media URLs from HTML
- identify known player patterns
- resolve relative URLs
- infer minimum request context
- validate candidates when confidence is not already high
- hand off to HLS, DASH, or direct download flows when possible

### 8.2 Generic Resolution Pipeline

The generic provider should be structured as evidence-based resolvers, not a single large regex-heavy module.

Suggested internal pipeline:

- `DirectMediaResolver`
- `ManifestResolver`
- `VideoTagResolver`
- `KnownPlayerResolver`
- `JsonMediaResolver`
- `HtmlPatternResolver`

Each resolver may emit candidates such as:

```js
{
  candidateUrl,
  mediaType,
  confidence,
  evidence
}
```

### 8.3 Generic Provider Candidate Validation

If a candidate is found, the provider should not blindly trust it when confidence is not high.

Validation may include:

- controlled `HEAD` or `GET`
- `Content-Type` confirmation
- manifest parseability checks
- URL resolution against final page URL

### 8.4 Generic Provider Constraints

- it must run after specific providers
- it must avoid stealing matches from known providers
- it must fail safely when confidence is low
- it must never promise support when only partial evidence exists

---

## 9. Request Context Rules

The provider layer becomes the canonical place to derive request context.

### Request context may include:

- `User-Agent`
- `Referer`
- `Origin`
- cookies when legitimately available
- provider-specific headers
- `profile = default | browser`

### Rules

- user-supplied headers still override defaults
- secrets must never leak to logs
- cookies must only be used from legitimate user-controlled flows
- cookies should not be persisted unnecessarily
- browser-compatible profile must not be treated as an authentication bypass

### Important separation

Page discovery and media download may require different contexts.

For example:

- page resolution may need browser-like presentation
- manifest or segment download may still work with normal HTTP

The architecture should allow context to vary by stage when needed.

---

## 10. Refreshing Expired Access

One of the most important new capabilities is provider-driven refresh.

### Motivation

Some platforms issue temporary manifests or direct URLs that expire and lead to:

- `401`
- `403`
- stale manifest references
- invalidated segment tokens

Instead of failing permanently, the engine should be able to ask the provider to refresh the access path.

### Proposed flow

```text
download attempt
  -> transport returns refreshable/auth-like failure
  -> engine checks provider capability
  -> provider.refresh()
  -> provider returns updated plan
  -> engine retries safely
```

### Proposed refresh input

```js
provider.refresh({
  reason: 'expired-url' | 'expired-manifest' | 'expired-segment-token' | 'session-refresh',
  statusCode,
  currentPlan,
  progress,
  refreshAttempt
}, context)
```

### Constraints

- refresh must be bounded, not loop indefinitely
- refresh should only trigger when the provider says the platform supports it
- a permanent `403` must remain terminal
- refresh should preserve the user's selected quality whenever possible
- refresh is not retry

### Selected representation preservation

The refresh state should preserve the original user intent, for example:

```js
refreshState: {
  selectedQuality: '1080p',
  selectedRepresentationId: 'video-1080',
  selectedAudioId: 'audio-pt'
}
```

---

## 11. Strategy Selection and Transport Architecture

Today the system often decides strategy from `sourceType`.

The target model is:

```text
DownloadPlan
  -> StrategySelector
  -> TransportBackend
```

### Transport backend abstraction

Recommended conceptual interface:

```js
TransportBackend {
  canHandle(plan, runtimeContext)
  prepare(task)
  execute(task, hooks)
  cancel(task)
  getMetrics()
}
```

Possible implementations:

- `DirectHttpTransport`
- `RangeTransport`
- `FfmpegHlsTransport`
- `SegmentedHlsTransport`
- `FfmpegDashTransport`
- `SegmentedDashTransport`
- `CurlTransport`
- `YtDlpTransport`

Concrete transport backends should live under:

- `src/transports/backends/direct-http.js`
- `src/transports/backends/direct-range.js`
- `src/transports/backends/hls-ffmpeg.js`
- `src/transports/backends/hls-segments.js`
- `src/transports/backends/dash-ffmpeg.js`
- `src/transports/backends/dash-segments.js`
- `src/transports/backends/curl.js`
- `src/transports/backends/ytdlp.js`

### StrategySelector

The strategy selection logic should be a dedicated component, not spread across the engine.

It must be deterministic and side-effect free.

Suggested signature:

```js
selectStrategy(downloadPlan, runtimeCapabilities, featureFlags)
```

Given the same inputs, it must return the same decision.

It should also be able to return structured reason metadata, for example:

```js
{
  strategy: 'hls-segments',
  reason: 'HLS VOD supported and hlsSegments feature enabled'
}
```

It must not:

- make HTTP requests
- resolve providers
- refresh URLs
- execute downloads
- mutate session state

It should choose among:

- `direct-http`
- `direct-range`
- `hls-segments`
- `hls-ffmpeg`
- `dash-segments`
- `dash-ffmpeg`
- `curl`
- `ytdlp`

based on:

- plan kind
- capabilities
- strategy hints
- runtime transport availability

Fallback must also be bounded.

The runtime/task should track attempted strategies so the system never loops indefinitely through fallback chains such as:

- `A -> B -> A -> B`

---

## 12. Smart Adaptive Downloading

The current Smart Turbo is tied to Range downloads.

The target is a shared `AdaptiveController` that can operate across:

- direct files via HTTP Range
- HLS via segment parallelism
- DASH via segment parallelism for video and audio

### Important boundary

The adaptive controller must remain independent from transport implementations.

Do not create:

- `HlsSmartTurbo`
- `DashSmartTurbo`
- `RangeSmartTurbo`

Instead:

```text
TransportBackend -> metrics -> AdaptiveController -> concurrency decision
```

### Desired behavior

The controller should:

- start conservatively
- measure throughput
- observe latency and failures
- scale concurrency up or down
- respect `Retry-After` and backoff signals
- remain conservative against throttling or instability

### Required metrics

The controller should be able to observe at least:

- total throughput
- throughput per worker
- average latency
- p95 latency
- active workers
- desired workers
- completed units per window
- failures per window
- `429` per window
- `5xx` per window
- timeouts
- retries
- time since last scale-up
- time since last scale-down

When supported by the backend, timeout causes should be distinguishable at least as:

- connect timeout
- request timeout
- idle/read timeout

### Control behavior requirements

The controller should include:

- measurement windows
- hysteresis
- cooldown
- minimum sustained improvement before scaling up
- immediate backoff on `429`
- exponential backoff plus jitter when `Retry-After` is absent

### Protocol boundary

`AdaptiveController` must be completely protocol-agnostic.

It must not:

- parse M3U8
- parse MPD
- build segment URLs
- manipulate representations
- know playlists
- contain HLS-specific, DASH-specific, or Range-specific logic

It should only consume generic metrics such as:

```js
{
  throughput,
  throughputPerWorker,
  latency,
  activeWorkers,
  failures,
  rateLimited,
  completedUnits
}
```

and return decisions such as:

```js
{
  targetConcurrency,
  backoffMs
}
```

The meaning of a unit belongs to the backend:

- Range: chunk
- HLS: segment
- DASH: audio/video segment

Cancellation does not belong to the `AdaptiveController`.

Cancellation belongs to the `DownloadTask` lifecycle and the active `TransportBackend`.

Expected flow:

```text
CLI / Electron
  -> DownloadTask.cancel()
  -> engine
  -> backend.cancel()
  -> workers / requests / FFmpeg terminated
```

`CANCELLED` must never trigger:

- retry
- refresh
- fallback

---

## 13. HLS and DASH Evolution

### Short-term

HLS and DASH should keep their current FFmpeg-backed download path for compatibility.

FFmpeg remains the compatibility path and safety net.

### Medium-term

Introduce optional segmented backends:

- `hls-segments`
- `dash-segments`

### HLS phased support

The first segmented HLS backend should start as a safe subset:

- VOD only
- master playlists
- media playlists
- relative URLs
- redirects
- AES-128 when legitimately accessible
- `EXT-X-MAP`
- `BYTERANGE`
- fMP4

AES-128 support must be explicitly limited to standard HLS encryption where the key is normally provided by the same legitimate playback flow the user already has access to.

The architecture must distinguish clearly between:

- standard HLS AES-128 with normally accessible keys: potentially supported
- DRM / Widevine / PlayReady / protected CENC / equivalent protection: out of scope
- SAMPLE-AES or scenarios not safely supported: fallback or refusal, never circumvention

If the manifest contains unsupported or uncertain features:

- fall back to `hls-ffmpeg`

That fallback is expected behavior, not an error.

### DASH phased support

The first segmented DASH backend should support only well-understood structures:

- `Representation`
- `AdaptationSet`
- `BaseURL`
- init segments
- `SegmentTemplate`
- `SegmentTimeline` only when correctly implemented
- separate audio and video
- mux integration

If the MPD contains unsupported structures:

- fall back to `dash-ffmpeg`

### DASH fairness

DASH segmented scheduling should treat video and audio as distinct work queues and avoid starvation of one track.

Fairness does not mean a fixed 50/50 split.

A safe first policy is:

- guarantee at least 1 worker for each active track
- distribute the remaining pool dynamically

Future policies may also consider:

- remaining segments
- average segment size
- duration coverage
- urgency for mux readiness

### Checkpoint-friendly segment identity

Even if persistent segmented resume is out of scope initially, segment tasks should have stable identity:

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

This keeps future checkpoint/resume possible.

### Integrity before mux/finalization

Segmented HLS/DASH downloads must not be treated as completed only because the queue is empty.

Before mux/finalization, validate at least:

- expected segment count
- completed segment count
- init segments present when required
- no empty output pieces
- no segment left in `FAILED`

When enough metadata exists, also validate expected size or byte-range integrity.

---

## 14. Official Error Taxonomy and Error Handling

The error taxonomy is an official part of the architecture.

Its role is to let the engine decide predictably:

- retry?
- refresh?
- fallback?
- backoff?
- abort?

At minimum, the following conceptual categories should exist:

- `UNSUPPORTED`
- `TRANSIENT`
- `RATE_LIMITED`
- `REFRESHABLE`
- `AUTHENTICATION`
- `DRM`
- `PERMANENT`
- `CANCELLED`

Expected behavior by category:

- `UNSUPPORTED`
  - current strategy/backend does not support the feature or resource
  - may allow fallback to another compatible backend such as FFmpeg
- `TRANSIENT`
  - temporary failure
  - may allow limited retry
- `RATE_LIMITED`
  - server is throttling requests
  - reduce concurrency
  - respect `Retry-After` when present
  - apply backoff plus jitter
- `REFRESHABLE`
  - temporary access expired or needs re-resolution
  - call `provider.refresh()` only when the provider declares that capability
- `AUTHENTICATION`
  - real authorization/authentication failure
  - must not automatically become refresh or random fallback
- `DRM`
  - DRM protection detected
  - stop immediately
  - never use fallback as a circumvention path
- `PERMANENT`
  - definitive failure
  - no random retries or fallbacks
- `CANCELLED`
  - operation was cancelled by user or system
  - finish as cancellation without retry

Potential additions:

- `PROVIDER_NOT_MATCHED`
- `PROVIDER_RESOLUTION_LOW_CONFIDENCE`
- `PROVIDER_ANALYZE_FAILED`
- `MANIFEST_DISCOVERY_FAILED`
- `MANIFEST_UNSUPPORTED`
- `REQUEST_CONTEXT_REQUIRED`
- `TRANSPORT_UNSUPPORTED`
- `TRANSPORT_TRANSIENT_FAILURE`
- `URL_EXPIRED`
- `REFRESH_NOT_SUPPORTED`
- `REFRESH_FAILED`
- `REFRESH_LIMIT_REACHED`
- `SEGMENT_DOWNLOAD_FAILED`
- `SEGMENT_RETRY_EXHAUSTED`
- `MUX_FAILED`

### Error class behavior

The engine should classify outcomes such as:

- `unsupported`
- `transient`
- `refreshable`
- `rate_limited`
- `authentication`
- `drm`
- `permanent`
- `cancelled`

### Important behavior

- refresh is not retry
- fallback is not bypass
- `401/403/DRM` remain terminal unless the provider explicitly indicates the access path is refreshable
- browser-compatible transport must not be attempted as a generic answer to every `403`

This taxonomy should be treated as an official part of the architecture so retry, refresh, fallback, and abort behavior do not devolve into scattered status-code heuristics.

---

## 15. Diagnostics and Sanitization

Diagnostics should be structured rather than opaque.

Recommended minimum shape:

```js
ResolutionDiagnostics {
  providerMatched
  matchedBy
  candidatesFound
  finalCandidate
  fallbacksUsed
  requestProfile
  transportSelected
  refreshAttempts
}
```

This must always be sanitized.

Central sanitization helpers should exist for:

- `sanitizeUrl()`
- `sanitizeHeaders()`
- `sanitizeDiagnostics()`

Never log:

- full cookies
- full auth headers
- full signed URLs
- full query tokens

Sanitization must happen at the origin of logging.

No module should send raw secrets to the logger expecting another layer to sanitize them later.

All logs related to a given download should include a correlation identifier such as:

- `taskId: dl_abc123`

This identifier must not contain sensitive information.

---

## 16. Security Constraints

This evolution must preserve existing security principles:

- never implement DRM bypass
- never hide authentication failures as transport failures
- never log cookies, auth tokens, or signed URLs in full
- keep process execution argument-structured

If browser cookies are supported in the future, they must be treated as sensitive user data with explicit handling policy.

---

## 17. Testing Requirements

### Regression coverage before implementation

- current registry detection behavior
- HLS analyze and prepare
- DASH analyze and prepare
- direct provider behavior
- Mercado Play routing
- mdstrm token refresh paths already present
- Smart Turbo current Range behavior

### New unit coverage

- provider base contract
- `ProviderResolution`
- `RequestContext`
- `DownloadPlan`
- `StrategySelector`
- `TransportBackend` selection
- error-taxonomy decision mapping
- generic provider heuristics
- confidence handling
- refresh decision logic
- adaptive controller decisions

### New integration coverage

- local HTML page containing HLS manifest reference
- local HTML page containing DASH manifest reference
- local HTML page with `<video src>`
- relative URL resolution
- redirect in page and manifest resolution
- low-confidence candidate handling
- expiring URL refresh flow with local server
- adaptive controller signal behavior

Tests must explicitly verify that each official error category produces the correct engine decision.

### Benchmark requirements

The evolution of Smart Turbo should be backed by reproducible benchmarks comparing:

- sequential
- fixed concurrency
- adaptive concurrency
- FFmpeg

for direct, HLS, and DASH where applicable.

Before extracting the current Smart Turbo logic into `AdaptiveController`, a baseline must be recorded for the current direct Range behavior:

- 1 connection
- 4 connections
- 8 connections
- current Smart Turbo

Each run should capture at least:

- throughput
- total time
- errors
- effective concurrency used

That baseline should be rerun immediately after the extraction step so refactoring can be validated separately from later algorithm improvements.

---

## 18. Recommended Order of Adoption

Recommended sequence:

1. introduce the new models:
   - `ProviderResolution`
   - `RequestContext`
   - `DownloadPlan`
   - `ProviderCapabilities`
   - `StrategyHints`
2. add a compatibility adapter for legacy providers
3. evolve the engine to consume `DownloadPlan`
4. introduce `StrategySelector` and `TransportBackend` abstractions
5. migrate current providers gradually
6. add the `generic` provider with confidence and candidate validation
7. formalize provider-owned bounded refresh
8. extract the current Smart Turbo policy into a reusable `AdaptiveController`
9. add adaptive metrics, hysteresis, cooldown, and backoff behavior
10. add HLS segmented backend
11. add adaptive HLS segmented control
12. add DASH segmented backend
13. add adaptive DASH segmented control
14. keep a checkpoint-friendly task model ready for future segmented resume
15. finish with hardening and benchmarks

---

## 19. Acceptance Criteria

This spec is satisfied when:

- providers resolve platforms through a clean public contract centered on `resolve()`
- `ProviderResolution` expresses confidence, capabilities, hints, and sanitized diagnostics
- the engine consumes `DownloadPlan` rather than raw URLs alone
- strategy selection is separated into a testable selector/backend model
- expiring access refresh is provider-owned and bounded
- adaptive concurrency becomes reusable across direct, HLS, and DASH backends
- fallback remains safe and explicit
- FFmpeg remains the compatibility path throughout the migration
- no DRM or auth bypass is introduced

---

## 20. Out of Scope for Initial Delivery

- live HLS support
- universal browser cookie extraction
- full persistent segmented resume for HLS/DASH
- replacing FFmpeg immediately for all adaptive media
- building API/Web UI/Download Manager on top of the new architecture in the same phase

---

## 21. Final Recommendation

The strongest path forward is to treat this as two coordinated but distinct evolutions:

1. providers become intelligent platform resolvers
2. Smart Turbo becomes a reusable adaptive controller for multiple transport backends

That sequencing reduces regression risk and matches the current architecture of the repository.
