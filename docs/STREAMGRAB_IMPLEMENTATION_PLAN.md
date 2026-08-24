# StreamGrab Provider Evolution Implementation Plan

## 1. Executive Summary

This plan describes how to evolve StreamGrab's current provider architecture into a richer intelligent adaptation layer while preserving the existing working flows.

The repository already contains:

- normalized providers
- provider registry
- shared download engine
- transport selection and fallback
- Smart Turbo for Range downloads
- FFmpeg integration
- CLI and Electron sharing the same core

The plan therefore focuses on incremental evolution, not replacement.

---

## 2. Current Architecture Audit

### Entry points

- CLI entry: `bin/streamgrab.mjs`
- shared CLI orchestration: `src/cli-flow.js`
- Electron main process: `electron/main.js`
- shared engine: `src/core/engine.js`

### Current provider layer

- registry: `src/providers/registry.js`
- providers:
  - `src/providers/hls/index.js`
  - `src/providers/dash/index.js`
  - `src/providers/direct/index.js`
  - `src/providers/ytdlp/index.js`
  - `src/providers/mercadoplay/index.js`

### Compatibility facade

- `src/source-adapters.js`

This preserves the older adapter shape for callers while internally using providers.

### Current transport layer

- `src/transports/http.js`
- `src/transports/range.js`
- `src/transports/curl.js`
- `src/transports/ytdlp-runner.js`

### Current processor layer

- `src/ffmpeg/service.js`
- `src/ffmpeg/muxer.js`
- `src/ffmpeg/audio.js`

### Current tests

- unit: `tests/unit/*`
- integration: `tests/integration/*`
- e2e: `tests/e2e/*`

---

## 3. Current Data Flows

### Analyze flow

1. URL enters CLI or Electron
2. `source-adapters.js` resolves provider through the registry
3. provider `analyze()` returns normalized media info
4. UI or CLI shows formats

### Download flow

1. provider `prepareDownload()` returns URL or simple strategy data
2. engine decides execution path
3. transport downloads
4. FFmpeg handles mux or adaptive-media download path where needed

### Special flows

- Range direct downloads have resume and Smart Turbo support
- HLS and DASH currently rely on FFmpeg download path
- mdstrm-specific refresh/re-resolution behavior exists in engine logic

---

## 4. Problems to Solve

### Primary architectural gap

Providers are still mostly source recognizers and analyzers.
They are not yet a full platform adaptation layer.

### Key limitations

- request context logic is not formally owned by providers
- expiring URL refresh is not a first-class provider capability
- the engine still contains source-specific behavior
- Smart Turbo is transport-specific instead of engine-level
- there is no strong generic provider for page analysis
- transport selection is still not a dedicated testable component

---

## 5. Target Architecture

Target flow:

```text
CLI / Electron
  -> ProviderRegistry
  -> provider.resolve()
  -> ProviderResolution
  -> quality selection
  -> DownloadPlan
  -> StrategySelector
  -> TransportBackend
  -> DownloadTask
  -> FFmpeg / final file
```

### Core additions

- provider resolution model
- request context model
- download plan model
- generic provider
- strategy selector
- transport backend abstraction
- reusable adaptive controller
- checkpoint-friendly download task evolution

---

## 6. Proposed Directory Additions

Recommended additions:

```text
src/
  core/
    request-context.js
    download-plan.js
  providers/
    base.js
    generic/
      index.js
      page-analyzer.js
      player-detectors.js
      manifest-discovery.js
  transports/
    adaptive-controller.js
    backends/
      direct-http.js
      direct-range.js
      hls-ffmpeg.js
      hls-segments.js
      dash-ffmpeg.js
      dash-segments.js
      curl.js
      ytdlp.js
  strategy/
    selector.js
```

These should be introduced incrementally and remain optional until validated.

`provider-session.js` is intentionally not part of the required initial structure. It should only be introduced if a concrete provider-owned state object becomes necessary across `resolve()`, `prepareDownload()`, and `refresh()`.

---

## 7. Migration Principles

The implementation must follow these rules:

- no big-bang rewrite
- preserve current tests and working flows
- keep legacy adapter compatibility until the new flow is stable
- move platform logic out of the engine gradually
- keep HLS and DASH on FFmpeg until segmented paths are proven
- treat refresh as bounded and explicit
- keep FFmpeg as the compatibility safety net through all phases

---

## 8. Feature-Gating Strategy

New architecture paths should be roll-out friendly.

Recommended internal development flags:

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

These do not need to be public UI settings initially.
They mainly exist to support controlled rollout and easy rollback during development and hardening.

---

## 9. Implementation Phases

## Phase 0 — Regression Freeze and ADR Update

### Objective

Freeze important current behavior before architecture changes.

### Files likely affected

- `tests/unit/providers-*.test.js`
- `tests/unit/providers-registry.test.js`
- `tests/unit/core-strategy.test.js`
- `tests/unit/engine-*.test.js`
- `tests/integration/*`
- `docs/architecture.md`

### Tasks

- add tests around current provider registry behavior
- add tests around current prepare/analyze flows
- capture mdstrm-related current behavior
- record ADRs for provider intelligence, generic fallback, and strategy separation

### Risks

- low

### Acceptance criteria

- all current critical flows are represented by stable tests

### Rollback

- revert only new tests and ADR text if necessary

### Complexity

- low

---

## Phase 1 — Introduce New Core Models

### Objective

Create the new supporting models without breaking current providers.

### Files to create

- `src/core/request-context.js`
- `src/core/download-plan.js`
- `src/providers/base.js`

### Files to update

- `src/providers/registry.js`
- `src/source-adapters.js`
- possibly `src/core/models.js` for shared helpers

### Tasks

- define `ProviderResolution`
- define `RequestContext`
- define `DownloadPlan`
- define `ProviderCapabilities`
- define `StrategyHints`
- reserve a conceptual path for `DownloadTask`
- explicitly decide that `ProviderSession` is not introduced unless a concrete responsibility appears
- document required fields, optional fields, and defaults for `ProviderResolution` and `DownloadPlan`
- make an explicit decision on whether internal contract versioning is needed during migration

### Risks

- medium

### Acceptance criteria

- current providers continue to work unchanged
- new helper models are usable in tests

### Rollback

- keep richer models unused by runtime if needed

### Complexity

- medium

---

## Phase 2 — Compatibility Adapter for Legacy Providers

### Objective

Bridge current provider implementations to the richer contract.

### Files to create or update

- `src/providers/base.js`
- `src/source-adapters.js`
- compatibility helpers near registry or provider base

### Tasks

- adapt old `analyze()` and `prepareDownload()` shape into `resolve()` and `DownloadPlan`
- keep legacy providers operational while the new model is introduced
- centralize the compatibility logic instead of duplicating it in each provider

### Risks

- medium

### Acceptance criteria

- all current providers still behave the same from the caller's perspective

### Rollback

- keep using pure legacy path

### Complexity

- medium

---

## Phase 3 — Engine Accepts DownloadPlan

### Objective

Make the engine consume richer provider output.

### Files to update

- `src/core/engine.js`
- `src/source-adapters.js`

### Tasks

- let provider preparation produce `DownloadPlan`
- merge provider request context into transport execution
- preserve current behavior for old-style prepared download results
- keep engine compatible with current callers
- make cancellation ownership explicit across task, engine, and backend boundaries

### Risks

- high
- regressions in download execution

### Acceptance criteria

- direct, HLS, DASH, yt-dlp, and Mercado Play still download correctly in existing tests
- engine respects provider request context

### Rollback

- route runtime back through compatibility shape

### Complexity

- high

---

## Phase 4 — StrategySelector and Transport Backend Abstraction

### Objective

Separate transport selection from engine orchestration.

### Files to create

- `src/strategy/selector.js`
- transport backend wrappers or adapters

### Files to update

- `src/core/engine.js`
- `src/core/strategy.js`
- relevant transport modules

### Tasks

- formalize `StrategySelector`
- define backend interface
- map current direct/range/ffmpeg/curl/ytdlp paths into backend-style components
- classify unsupported vs transient vs permanent outcomes cleanly
- make strategy selection return structured reason metadata for diagnostics

The backend contract should be conceptually close to:

```js
TransportBackend {
  canHandle(plan, runtimeContext)
  prepare(task)
  execute(task, hooks)
  cancel(task)
  getMetrics()
}
```

`StrategySelector` should be deterministic and side-effect free, with a shape conceptually close to:

```js
selectStrategy(downloadPlan, runtimeCapabilities, featureFlags)
```

It must not:

- perform HTTP requests
- resolve providers
- refresh URLs
- execute downloads
- mutate runtime state

The selector should return deterministic strategy plus reason, not only a bare backend id.

### Risks

- high
- accidental behavior drift in fallback rules

### Acceptance criteria

- strategy selection becomes testable in isolation
- existing fallback rules still hold

### Rollback

- keep old engine-local selection path

### Complexity

- high

---

## Phase 5 — Gradual Migration of Existing Providers

### Objective

Move current providers onto the richer contract gradually.

### Likely order

- `direct`
- `mercadoplay`
- `hls/mdstrm`
- `dash`
- `ytdlp`

### Tasks

- implement `resolve()` where appropriate
- emit `ProviderResolution` with `confidence`, `capabilities`, `strategyHints`
- preserve provider-specific behavior

The `direct` provider should migrate first and serve as the reference implementation of the new contract.

### Risks

- high
- mixed legacy/new contracts during transition

### Acceptance criteria

- migrated providers behave equivalently to old flows
- engine no longer needs new provider-specific special cases

### Rollback

- switch affected provider back to compatibility adapter

### Complexity

- high

---

## Phase 6 — Generic Provider with Confidence and Candidate Validation

### Objective

Introduce a strong fallback provider for HTML and player-based discovery.

### Files to create

- `src/providers/generic/index.js`
- `src/providers/generic/page-analyzer.js`
- `src/providers/generic/player-detectors.js`
- `src/providers/generic/manifest-discovery.js`

### Files to update

- `src/providers/registry.js`
- registry tests

### Tasks

- fetch HTML when appropriate
- implement evidence-based candidate pipeline
- search for `.m3u8`, `.mpd`, direct media, known player patterns
- resolve relative URLs
- assign confidence
- validate candidates when needed
- ensure the generic provider runs after specific providers

### Risks

- high
- false positives
- stealing traffic from specific providers

### Acceptance criteria

- generic provider resolves local test pages into HLS, DASH, or direct plans
- low-confidence candidates fail safely
- current known URLs still resolve to their current providers

### Rollback

- unregister or disable the generic provider

### Complexity

- high

---

## Phase 7 — Provider-Owned Bounded Refresh

### Objective

Move refresh logic into provider capabilities.

### Files to update

- `src/core/engine.js`
- provider modules that support refresh
- error handling tests

### Tasks

- define provider refresh interface
- allow engine to ask provider for a refreshed plan
- pass refresh reason and current plan state
- limit refresh attempts with a conservative default
- preserve selected quality when possible

Recommended refresh policy:

- default limit: 1 refresh per attempt
- internal hard cap: 2

Every refresh attempt must remain:

- bounded
- counted
- diagnosable

`AUTHENTICATION`, `DRM`, and `PERMANENT` outcomes must not repeatedly consume the refresh mechanism.

### Risks

- high
- refresh loops
- masking permanent authorization failures

### Acceptance criteria

- refresh triggers only on compatible failures
- permanent `403` remains terminal
- refresh is bounded and stateful

### Rollback

- disable refresh capability per provider

### Complexity

- high

---

## Phase 8 — Extract AdaptiveController from Smart Turbo

### Objective

Promote Smart Turbo into a generic adaptive concurrency controller.

### Files to create

- `src/transports/adaptive-controller.js`

### Files to update

- `src/core/smart-turbo.js`
- `src/transports/range.js`
- `tests/performance/*`

### Tasks

- record baseline of current Smart Turbo behavior before extraction
- separate policy from Range transport specifics
- preserve current Range Smart Turbo behavior
- define a transport-agnostic metrics input model

The baseline before extraction should cover direct file downloads with:

- 1 connection
- 4 connections
- 8 connections
- current Smart Turbo

with at least:

- throughput
- total time
- errors
- effective concurrency used

### Risks

- medium
- performance regressions if policy changes too much

### Acceptance criteria

- benchmark baseline exists for before/after comparison
- Range transport still passes all current Smart Turbo tests
- controller is reusable by future segment backends

### Rollback

- keep old Range-specific controller path

### Complexity

- medium

---

## Phase 9 — Adaptive Metrics, Hysteresis, Cooldown, and Backoff

### Objective

Harden the adaptive controller with explicit control policy.

### Files to update

- `src/transports/adaptive-controller.js`
- tests and benchmarks

### Tasks

- add throughput and latency metrics
- add hysteresis
- add cooldown windows
- add `429` handling
- respect `Retry-After`
- add exponential backoff plus jitter
- distinguish timeout causes in diagnostics where supported by the backend
- prepare the controller/scheduler model for global and per-host concurrency limits

### Risks

- medium
- unstable controller behavior if thresholds are poor

### Acceptance criteria

- controller avoids oscillation
- controller reduces concurrency on rate limiting
- controller stops scaling up when gains flatten
- controller improvements are measured against the preserved Phase 8 baseline

### Rollback

- disable advanced policy and preserve conservative baseline

### Complexity

- medium

---

## Phase 10 — HLS Segmented Backend

### Objective

Add optional HLS segment parallelism for supported VOD cases.

### Files to create

- `src/transports/backends/hls-segments.js`

### Files to update

- `src/strategy/selector.js`
- `src/core/engine.js`
- `src/providers/hls/index.js`

### Tasks

- parse media playlists into executable segment plans
- support segment fetching and local assembly
- preserve fallback to FFmpeg for unsupported manifest features
- keep segment tasks checkpoint-friendly
- validate segmented integrity before mux/finalization

Encryption boundary must be explicit:

- standard HLS AES-128 is only supported when keys are normally available through the legitimate playback flow
- DRM / Widevine / PlayReady / protected CENC remain out of scope
- SAMPLE-AES and unsupported encrypted variants must fall back or fail safely, never attempt circumvention

### Risks

- very high
- playlist edge cases
- mux/integrity issues
- encrypted media nuances

### Acceptance criteria

- local HLS fixtures for master/media/AES-128/fMP4/BYTERANGE pass
- unsupported HLS safely falls back to FFmpeg

### Rollback

- disable segmented HLS backend and keep FFmpeg only

### Complexity

- very high

---

## Phase 11 — Adaptive HLS Segmented Control

### Objective

Apply adaptive concurrency to the HLS segmented backend.

### Files to update

- `src/transports/backends/hls-segments.js`
- `src/transports/adaptive-controller.js`

### Tasks

- emit transport metrics
- let the adaptive controller tune HLS worker count safely

### Risks

- high

### Acceptance criteria

- HLS segmented path uses the shared adaptive controller
- controller remains stable under local test scenarios

### Rollback

- use fixed HLS concurrency or fall back to FFmpeg

### Complexity

- high

---

## Phase 12 — DASH Segmented Backend

### Objective

Add optional DASH segment parallelism for supported VOD cases.

### Files to create

- `src/transports/backends/dash-segments.js`

### Files to update

- `src/strategy/selector.js`
- `src/core/engine.js`
- `src/providers/dash/index.js`

### Tasks

- derive segment plans from MPD
- fetch video/audio segments and init segments
- integrate mux path
- preserve fairness between audio and video queues
- fall back to FFmpeg when unsupported MPD structures are found

Initial fairness policy should at least:

- guarantee one worker for each active track
- distribute the remaining pool dynamically

### Risks

- very high
- MPD complexity
- mux correctness

### Acceptance criteria

- supported local DASH fixtures pass
- unsupported cases safely use FFmpeg

### Rollback

- disable segmented DASH backend and keep FFmpeg only

### Complexity

- very high

---

## Phase 13 — Adaptive DASH Segmented Control

### Objective

Apply adaptive concurrency to the DASH segmented backend.

### Files to update

- `src/transports/backends/dash-segments.js`
- `src/transports/adaptive-controller.js`

### Tasks

- emit per-queue metrics
- let adaptive policy tune total concurrency safely

### Risks

- high

### Acceptance criteria

- DASH segmented path uses the shared adaptive controller
- fairness and stability are preserved in controlled tests

### Rollback

- use fixed DASH concurrency or fall back to FFmpeg

### Complexity

- high

---

## Phase 14 — Checkpoint-Friendly Task Model

### Objective

Make sure the runtime task model does not block future segmented resume.

### Files likely affected

- `src/core/models.js`
- task/engine-related internals

### Tasks

- formalize stable segment task identity
- keep execution state evolvable toward segmented checkpoints
- keep task states able to distinguish `DOWNLOADED` from `PROCESSING` and `COMPLETED`

### Risks

- medium

### Acceptance criteria

- architecture can evolve toward segmented resume without redesigning backends

### Rollback

- keep this as a modeling-only step if runtime changes are premature

### Complexity

- medium

---

## Phase 15 — Hardening and Benchmarks

### Objective

Validate the architecture under reproducible conditions and harden it before widening usage.

### Tasks

- expand synthetic adaptive-controller tests
- add direct/HLS/DASH comparative benchmarks
- validate fallback safety
- validate diagnostics sanitization

### Risks

- low

### Acceptance criteria

- benchmark suite is reproducible
- new paths show stability and safety
- no regression in compatibility path

### Rollback

- disable unstable new features and retain compatibility backends

### Complexity

- medium

---

## 10. Test Plan

### Before migration

- freeze current behavior with regression tests

### During migration

- add unit tests for new models and contracts
- add `StrategySelector` tests
- add backend selection tests
- add error-taxonomy decision tests
- add cancellation ownership tests
- add strategy reason/diagnostics tests
- add local HTML integration fixtures for generic provider
- add confidence and candidate-validation tests
- add expiring URL refresh integration tests
- add adaptive controller behavior tests

### After transport expansion

- add HLS segmented integration coverage
- add DASH segmented integration coverage
- add fairness tests for DASH audio/video scheduling
- add integrity-before-mux validation tests

### Testing rule

No new feature path should replace an existing one without local deterministic tests.

---

## 11. Official Error Taxonomy

The error taxonomy is an official part of the architecture.

Its role is to let the engine decide predictably:

- retry?
- refresh?
- fallback?
- backoff?
- abort?

The minimum conceptual categories are:

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

Specific codes may still exist under these categories, such as:

- `MANIFEST_UNSUPPORTED`
- `URL_EXPIRED`
- `RATE_LIMITED`
- `SEGMENT_RETRY_EXHAUSTED`
- `REFRESH_LIMIT_REACHED`
- `MUX_FAILED`

The important rule is that decision logic must be driven by classification and context, not by scattered raw HTTP checks such as `if (status === 403)`.

Tests must explicitly verify that each category leads to the correct engine decision.

---

## 12. Release and Rollout Strategy

Recommended rollout posture:

- keep new provider behaviors behind internal capability or feature gates at first
- keep segmented HLS and DASH optional until stable
- prefer silent internal compatibility over user-facing flags unless needed
- update architecture docs and changelog with each accepted phase

No packaging or installer changes are required for the first provider-focused phases.

---

## 13. Risks by Severity

### Critical

- breaking current HLS/DASH downloads by replacing FFmpeg too early
- accidentally transforming permanent `403` failures into endless refresh attempts

### High

- false positives in the generic provider
- provider/engine contract mismatch during partial migration
- leaking request context secrets in logs
- transport abstraction drift that changes current fallback behavior
- error classification drift causing wrong retry/refresh/fallback decisions

### Medium

- temporary duplication of concepts while both contracts coexist
- Smart Turbo policy drift during controller extraction
- unstable adaptive tuning thresholds
- insufficient global/per-host concurrency control causing future resource contention

### Low

- CLI presentation changes
- Electron metadata display changes

---

## 14. Decisions Requiring Approval

1. Should the generic provider be introduced behind an internal safety gate first?
2. Should refresh default to one attempt per download attempt, with an internal hard cap of two for providers that explicitly require it?
3. Should HLS segmented downloading ship before DASH, as a separate milestone?
4. Should browser cookie reuse remain out of the first implementation scope?
5. Which provider should migrate first to the richer contract:
   - `direct`
   - `mercadoplay`
   - `hls/mdstrm`

Recommended answers:

- yes, gate the generic provider initially
- yes, default to one refresh attempt and allow a provider-specific second refresh only when explicitly justified, with an internal hard cap of two
- yes, HLS before DASH
- yes, browser cookies stay out of first real delivery
- migrate `direct` first, then `mercadoplay` and `hls/mdstrm`

---

## 15. Recommended Execution Order

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8
10. Phase 9
11. Phase 10
12. Phase 11
13. Phase 12
14. Phase 13
15. Phase 14
16. Phase 15

This ordering reduces regression risk and aligns with the current structure of the repository.

---

## 16. Final Recommendation

The implementation should be treated as two controlled evolutions:

1. make providers intelligent platform resolvers
2. make Smart Turbo a shared adaptive controller for multiple backends

FFmpeg should remain the compatibility path throughout the migration, and the generic provider should only be promoted after the engine and plan model are already stable.
