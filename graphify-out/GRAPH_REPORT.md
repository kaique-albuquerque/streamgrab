# Graph Report - streamgrab  (2026-11-11)

## Corpus Check
- Large corpus: 746 files · ~289,178 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 3079 nodes · 8481 edges · 165 communities (142 shown, 23 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 231 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Tab Video Render
- Mjs Confirm Main
- Test Download Plan
- Tutorial Clipboard Target
- File Download Part
- Batch Max Test
- Model Handlers Job
- Test Utils Index
- Ffmpeg Test Service
- Handlers Handler Enqueue
- Security Payloads Queue
- Index Ffmpeg Progress
- Download Without Findings
- Test Ytdlp Fakeytdlp
- Ytdlp Analysis Hints
- Model Manager Model
- Engine Run Core
- Mdstrm Routing Test
- Test Root Index
- Index Inspect Hls
- Dist Download Test
- Audio Extract Test
- Streamgrab Mjs Entry
- Transformers Whisper Xenova
- Preview Ytdlp Preview
- Events Event Names
- Template Review Prompt
- Batch Notification Url
- Target Artifactname Icon
- Vendor Exec Binaries
- Models Dir Install
- Active Filename Context
- Mux Download Multi
- Dir Crypto Http
- Source Adapter Adapter
- Test Test Pressure
- Errors Core Test
- Retry Strategy Selectstrategy
- Installed Install Ffmpeg
- Analyst Scrub Inputs
- History Filters Constants
- Hotmart Embed Flags
- States Job Job
- Job Manager Actions
- Ref Node Cipher
- Install Curlimp Curl
- Control Cancel Dispose
- Resume Session Core
- Output Cli Flags
- Http Detect Streamgraberror
- Smart Turbo Defaults
- Panel States Transcribe
- Test Turbo Cleanup
- Analyze Analyzeyoutubeurl Headers
- Format Video Formatsize
- Checkpoint Buildcheckpointids Createcheckpointemitter
- Hls Playlist Test
- Atomic Disk Prepare
- States Index Constants
- Principle Testing Skills
- Youtube Exec Package
- Test Dirname Root
- Resources Constructor Manager
- Media Info Format
- Skill Superpowers Code
- Views Panel Settings
- Actions Appendactionbtn Renderactions
- Name Runs Needs
- Load Settings Coerce
- Baseline Core Mjs
- Queue Visible Jobs
- Broadcast Setservices Main
- Ref Electron Dir
- History Storage Core
- Checkpoint Create Createsegmentcheckpoint
- Isvalidm Url Genericprovider
- Ytdlp Progress Test
- Transcribe Panel Events
- Transcription Whisper Module
- Notifications Controller Createnotifier
- Panel Transcribe Controller
- Dir Tools Curl
- Dir Whisper Limit
- Clipboard Watcher Createclipboardwatcher
- Steps Continue Error
- Engine Mdstrm Flow
- Fakeengine Cancel Constructor
- Files Cache Fail
- Node Crypto Sha
- Analyze Large Files
- Default Range File
- Extract Audio Extractaudio
- History Export Rfc
- Dashboard Formatters Escapehtml
- Electron Test Maketempdir
- Browserlauncherforplatform Chmodowneronly Companionurl
- Dash Fetchdashmanifest Fetchdashmanifesttext
- Dlp Cli Flow
- Engine Mdstrm Curl
- Template Audio Turbo
- Bootstrappage Getnewestscreen Handlerequest
- Dashboard Createdashboardaccessor Ensure
- Electron Builder Eslint
- Logger Core Test
- Createelement Fakeelement Addeventlistener
- Session Redaction Discovery
- Pre Flight Scan
- Helper Connect Nextreconnectdelay
- Prettierrc Json Arrowparens
- Package Resources Mjs
- Skill Discovery Anthropic
- Preview Ipc Player
- Broadcast Computeacceptkey Decodeframe
- Ref Render Graphs
- Skip Download Whisper
- Formats Isresolvabledirectformat Normalizeyoutubeformat
- Plans Buildcandidateplans Findmatchingadaptiveformat
- Baseline Smart Turbo
- Dashboard Metrics Active
- Server Stop Command
- Persistence Createsnapshot Loadfromstorage
- Pump Createpump Extractrunoptions
- Gif Screen Recorder
- Analyze Maskdiagurl Resolvefreshvariant
- Youtube Download Gif
- Dashboard Queue Auto
- Brandmarkup Escapehtmltext Renderbranding
- Publish Name Needs
- Core Queue Test
- Evidence Support Verification
- Export History Module
- View Template History
- Batching Small Shape
- Name Needs Runs
- Name Needs Runs
- Push Workflow Dispatch
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 163

## God Nodes (most connected - your core abstractions)
1. `scripts` - 37 edges
2. `electron` - 33 edges
3. `DownloadEngine` - 33 edges
4. `StreamGrabError` - 30 edges
5. `normalizeHeaders()` - 29 edges
6. `CancelledError` - 28 edges
7. `isSafeAbsolutePath()` - 26 edges
8. `friendlyReport()` - 25 edges
9. `getFfmpegCommand()` - 25 edges
10. `maskUrl()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `YouTube Player Page Fixture` --conceptually_related_to--> `Download YouTube GIF`  [INFERRED]
  tests/fixtures/youtube/player-page.html → assets/download_youtube.gif
- `createElectronServices()` --indirect_call--> `createAtomicFile()`  [INFERRED]
  electron/services.js → src/core/atomic.js
- `createElectronServices()` --indirect_call--> `checkDiskSpace()`  [INFERRED]
  electron/services.js → src/core/disk.js
- `ffmpeg()` --calls--> `getFfmpegCommand()`  [EXTRACTED]
  tests/integration/hls-dash-local.test.js → src/ffmpeg/service/paths.js
- `registerHistoryHandlers()` --calls--> `friendlyReport()`  [EXTRACTED]
  electron/ipc/history-handlers.js → src/core/errors/report.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Systematic Debugging Phases** — _github_skills_systematic_debugging_skill_root_cause_investigation, _github_skills_systematic_debugging_skill_pattern_analysis, _github_skills_systematic_debugging_skill_hypothesis_testing, _github_skills_systematic_debugging_skill_implementation_phase [EXTRACTED 1.00]
- **Systematic Debugging Pressure Tests** — _github_skills_systematic_debugging_test_pressure_1_pressure_test_1, _github_skills_systematic_debugging_test_pressure_2_pressure_test_2, _github_skills_systematic_debugging_test_pressure_3_pressure_test_3 [EXTRACTED 1.00]
- **Diagnosing Superpowers Dimensions** — _github_skills_diagnosing_superpowers_prompts_cost_and_time_cost_and_time, _github_skills_diagnosing_superpowers_prompts_plan_adherence_plan_adherence, _github_skills_diagnosing_superpowers_prompts_quality_evidence_quality_evidence, _github_skills_diagnosing_superpowers_prompts_repeated_work_repeated_work, _github_skills_diagnosing_superpowers_prompts_request_conflicts_request_conflicts, _github_skills_diagnosing_superpowers_prompts_skill_timeline_skill_timeline, _github_skills_diagnosing_superpowers_prompts_stumbles_stumbles [EXTRACTED 1.00]
- **Preview Media Feature Workflow** — docs_specs_06_preview_de_midia_preview_generation, docs_specs_06_preview_de_midia_preview_player_spec, docs_specs_06_preview_de_midia_ipc_preview [EXTRACTED 0.95]
- **Transcription Pipeline** — docs_specs_09_transcricao_video_whisper_engines, docs_specs_09_transcricao_video_output_formats, docs_specs_09_transcricao_video_docker_spec [EXTRACTED 0.95]
- **Superpowers Skill Reference Tools** — github_skills_using_superpowers_references_antigravity_tools, github_skills_using_superpowers_references_claude_code_tools, github_skills_using_superpowers_references_codex_tools, github_skills_using_superpowers_references_gemini_tools, github_skills_using_superpowers_references_hermes_tools, github_skills_using_superpowers_references_muse_tools, github_skills_using_superpowers_references_pi_tools, github_skills_using_superpowers_references_vscode_copilot_tools [EXTRACTED 0.90]
- **Subagent-Driven Development Workflow** — subagent_driven_development_subagent_driven_development, subagent_driven_development_preflight_preflight, subagent_driven_development_ledger_ledger, subagent_driven_development_done_with_concerns_done_with_concerns, subagent_driven_development_needs_context_needs_context, subagent_driven_development_blocked_blocked [EXTRACTED 0.90]
- **Skill Testing TDD Cycle** — writing_skills_skill_testing_skill_testing, writing_skills_red_green_refactor_red_green_refactor, writing_skills_pressure_scenarios_pressure_scenarios, writing_skills_meta_testing_meta_testing [EXTRACTED 0.90]
- **Persuasion Principles for Skill Design** — writing_skills_authority_principle_authority_principle, writing_skills_commitment_principle_commitment_principle, writing_skills_scarcity_principle_scarcity_principle, writing_skills_social_proof_principle_social_proof_principle, writing_skills_unity_principle_unity_principle, writing_skills_reciprocity_principle_reciprocity_principle, writing_skills_liking_principle_liking_principle [EXTRACTED 0.95]
- **Superpowers Framework Skills** — _github_skills_brainstorming_SKILL_brainstorming, _github_skills_subagent_driven_development_SKILL_subagent_driven_development, _github_skills_diagnosing_superpowers_templates_bundle_README_session_diagnosis_bundle [EXTRACTED 0.90]
- **StreamGrab Architecture Components** — CONTRIBUTING_cli, CONTRIBUTING_electron, CONTRIBUTING_provider_registry, CONTRIBUTING_download_engine, CONTRIBUTING_transport [EXTRACTED 0.90]
- **Audit Severity Classification** — relatorio_auditoria_critical_findings, relatorio_auditoria_high_findings, relatorio_auditoria_medium_findings, relatorio_auditoria_low_findings [EXTRACTED 1.00]
- **Superpowers Skill Framework** — superpowers_using_superpowers, superpowers_brainstorming, superpowers_writing_plans, superpowers_test_driven_development, superpowers_executing_plans, superpowers_requesting_code_review, superpowers_receiving_code_review, superpowers_dispatching_parallel_agents, superpowers_using_git_worktrees, superpowers_finishing_development_branch, superpowers_verification_before_completion, superpowers_writing_skills, superpowers_diagnosing_superpowers [EXTRACTED 1.00]
- **TDD Red-Green-Refactor Workflow** — superpowers_test_driven_development, superpowers_writing_good_tests, superpowers_verification_before_completion [EXTRACTED 1.00]
- **Code Review Lifecycle** — superpowers_requesting_code_review, superpowers_code_reviewer_template, superpowers_receiving_code_review [EXTRACTED 1.00]

## Communities (165 total, 23 thin omitted)

### Community 0 - "Tab Video Render"
Cohesion: 0.06
Nodes (79): QUEUE_STATE_LABELS, createHistoryPanel(), ensureHistoryFilters(), refreshHistoryPanel(), exportHistory(), bindHistoryFilters(), renderHistoryItem(), historyStatus() (+71 more)

### Community 1 - "Mjs Confirm Main"
Cohesion: 0.07
Nodes (60): analyzeUrl(), askFilename(), askUrl(), confirm(), downloadUrl(), downloadUrlWithOptions(), listProjectContainers(), main() (+52 more)

### Community 2 - "Test Download Plan"
Cohesion: 0.09
Nodes (43): createProviderCapabilities(), createStrategyHints(), DOWNLOAD_PLAN_KINDS, PREFERRED_TRANSPORTS, PROVIDER_RESOLUTION_CONFIDENCE, PROVIDER_RESOLUTION_MATCHERS, createDownloadPlan(), isValidDownloadPlan() (+35 more)

### Community 3 - "Tutorial Clipboard Target"
Cohesion: 0.05
Nodes (46): createAppState(), getRendererDom(), appState, setupClipboardWatcher(), targetTab(), setupHelpFab(), loadTemplates(), setupTranscribeEvents() (+38 more)

### Community 4 - "File Download Part"
Cohesion: 0.08
Nodes (52): runFileDownloadCommand(), logFileMetadata(), resolveOutputPath(), downloadPartFiles(), verifyMergedOutput(), createPartManifest(), loadPartManifest(), persistPartCompletion() (+44 more)

### Community 5 - "Batch Max Test"
Cohesion: 0.07
Nodes (37): createBatchDialog(), close(), open(), runBatch(), safeBatchEnqueue(), appendProgress(), escapeHtml(), truncate() (+29 more)

### Community 6 - "Model Handlers Job"
Cohesion: 0.15
Nodes (38): registerTranscribeHandlers(), INVALID_JOB, registerCancelHandler(), registerJobListHandler(), registerRemoveHandler(), registerRetryHandler(), registerCheckHandler(), registerStartHandler() (+30 more)

### Community 7 - "Test Utils Index"
Cohesion: 0.08
Nodes (25): SOCIAL_ADAPTER, socialLabel(), YOUTUBE_ADAPTER, DEFAULT_USER_AGENT, checkDashDrm(), DRM_SCHEMES, createDashMediaInfo(), createDashRequestContext() (+17 more)

### Community 8 - "Ffmpeg Test Service"
Cohesion: 0.08
Nodes (32): AUDIO_PROFILES, audioProfileToArgs(), canRemuxToProfile(), CODEC_NAMES, getAudioProfiles(), buildDownloadArgs(), buildMuxArgs(), formatHeaders() (+24 more)

### Community 9 - "Handlers Handler Enqueue"
Cohesion: 0.14
Nodes (33): registerAppHandlers(), registerHistoryHandlers(), registerSettingsHandlers(), analyzePlaylist(), registerPlaylistHandlers(), canPreviewSource(), previewCache, registerPreviewHandlers() (+25 more)

### Community 10 - "Security Payloads Queue"
Cohesion: 0.18
Nodes (33): registerRevealRoot(), validateDiskSpacePayload(), validateExportLogsPayload(), validatePreviewFilePathPayload(), validateRevealPayload(), validateAnalyzePayload(), validateCancelPayload(), validateDownloadPayload() (+25 more)

### Community 11 - "Index Ffmpeg Progress"
Cohesion: 0.15
Nodes (31): createDefaultExecutor(), runDirectStrategy(), runHlsDashStrategy(), runMuxMultiStrategy(), runMuxStrategy(), runYtDlpSingleStrategy(), usesYtDlpDownload(), usesYtDlpForSingle() (+23 more)

### Community 12 - "Download Without Findings"
Cohesion: 0.07
Nodes (46): CLI Entry Point, DownloadEngine, Electron Desktop App, ESLint + Prettier Linting, ESM Module System, FFmpeg Dependency, Node.js 20+ Runtime, Provider (+38 more)

### Community 13 - "Test Ytdlp Fakeytdlp"
Cohesion: 0.06
Nodes (16): PAYLOAD, __dirname, FIXTURE, __dirname, ROOT, runCalls, MASTER_PLAYLIST, __dirname (+8 more)

### Community 14 - "Ytdlp Analysis Hints"
Cohesion: 0.09
Nodes (29): buildAnalysisFromInfo(), analyzeYtDlpUrl(), buildBaseOptions(), CircuitBreaker, ytdlpAnalysisBreaker, ADAPTIVE_URI_PREFIX, isLoginRequiredError(), isSpawnBlockedError() (+21 more)

### Community 15 - "Model Manager Model"
Cohesion: 0.15
Nodes (29): DEFAULT_MODEL, getModelEntry(), listModelIds(), MODEL_CATALOG, unknownModelError(), deleteModel(), downloadModel(), finishFromExistingPart() (+21 more)

### Community 16 - "Engine Run Core"
Cohesion: 0.06
Nodes (7): defaultResolveAdapter(), createDownloadEngine(), DownloadEngine, createFakeExecutor(), FAKE_ADAPTER, fakeResolver(), makeEngine()

### Community 17 - "Mdstrm Routing Test"
Cohesion: 0.14
Nodes (28): extForUri, rewritePlaylist, refreshMdstrm(), safeRefreshMdstrm(), buildPlayerUrl(), extractMdstrmVideoId(), fetchMdstrmPlayerVars(), isMdstrmUrl() (+20 more)

### Community 18 - "Test Root Index"
Cohesion: 0.10
Nodes (14): findCurlImpersonate(), chromeVersion(), __dirname, PROFILE_ORDER, PROJECT_ROOT, extForUri(), rewritePlaylist(), SAFE_SEGMENT_EXT (+6 more)

### Community 19 - "Index Inspect Hls"
Cohesion: 0.14
Nodes (19): createAdaptiveWindow(), runSegmentDownloader(), createDownloaderState(), createWindow(), resetWindow(), createWorkers(), fetchBinary(), localSegmentPath() (+11 more)

### Community 20 - "Dist Download Test"
Cohesion: 0.05
Nodes (37): scripts, analisar:linhas, audit, curl:install, dist:linux, dist:mac, dist:mac:dir, dist:windows (+29 more)

### Community 21 - "Audio Extract Test"
Cohesion: 0.12
Nodes (22): __dirname, downloadToTemp(), isStandaloneBinary(), main(), parseVersion(), pickAsset(), PROJECT_ROOT, targetPaths() (+14 more)

### Community 22 - "Streamgrab Mjs Entry"
Cohesion: 0.15
Nodes (23): analyzeBySourceType(), runAnalyzeCommand(), resolveAudioTarget(), runAudioOnlyFlow(), buildDownloadArgv(), createNonInteractiveAnswers(), runDownloadCommand(), parseDownloadFlags() (+15 more)

### Community 23 - "Transformers Whisper Xenova"
Cohesion: 0.13
Nodes (19): args, __dirname, langIdx, PROJECT_ROOT, startedAt, transcribeAudio(), checkTranscriptionAvailable(), checkWhisperCpp() (+11 more)

### Community 24 - "Preview Ytdlp Preview"
Cohesion: 0.20
Nodes (24): cleanOldPreviews(), clearPreview(), PREVIEW_CACHE_MS, PREVIEW_DIR_NAME, PREVIEW_DURATION_SECONDS, PREVIEW_MAX_BYTES, PREVIEW_TIMEOUT_MS, PREVIEW_YTDLP_TIMEOUT_MS (+16 more)

### Community 25 - "Events Event Names"
Cohesion: 0.08
Nodes (7): createEventBus(), DOWNLOAD_EVENT_NAMES, EVENT_NAMES, isValidEventName(), JOB_STAGES, normalizePayload(), StreamGrabCore

### Community 26 - "Template Review Prompt"
Cohesion: 0.07
Nodes (30): Brainstorming Skill, Builder Check, Design Document, Spike, Visual Companion, Builder Check Prompt, Visual Companion Guide, Session Diagnosis Bundle (+22 more)

### Community 27 - "Batch Notification Url"
Cohesion: 0.06
Nodes (26): Automatic URL Detection, clipboard-watcher, IPC channel, Settings, Settings Module, Toast UI, help-fab, Interactive Tutorial (+18 more)

### Community 28 - "Target Artifactname Icon"
Cohesion: 0.07
Nodes (30): appId, asar, compression, copyright, directories, buildResources, output, electronDist (+22 more)

### Community 29 - "Vendor Exec Binaries"
Cohesion: 0.12
Nodes (23): getYtDlpCommand(), binName(), __dirname, getPackagedResourcesPath(), getYtDlpExec(), hasPackagedBinary(), packagedBinaryPath(), PROJECT_ROOT (+15 more)

### Community 30 - "Models Dir Install"
Cohesion: 0.11
Nodes (29): autoInstallDeps(), BIN_PATH, buildBinary(), checkBuildDependencies(), cleanupTemp(), describeMissingDeps(), __dirname, downloadFile() (+21 more)

### Community 31 - "Active Filename Context"
Cohesion: 0.15
Nodes (18): createAnswerSource(), createContext(), onInterrupt(), interpretResult(), createInterruptHandler(), runCliSession(), printFfmpegHelp(), printHeader() (+10 more)

### Community 32 - "Mux Download Multi"
Cohesion: 0.25
Nodes (17): runCurlDownloadFlow(), analyzeFailure(), cleanupPartial(), printStderrTail(), buildMuxMultiArgs(), runMuxMultiDownloadFlow(), runMuxedDownloadFlow(), runDownloadFlow() (+9 more)

### Community 33 - "Dir Crypto Http"
Cohesion: 0.08
Nodes (24): RFC-6455, clients, CONTENT_DIR, crypto, debounceTimers, frameTemplate, fs, helperScript (+16 more)

### Community 34 - "Source Adapter Adapter"
Cohesion: 0.16
Nodes (19): sourceLooksLikeYouTubeWatch(), resolveAdapterOrExit(), ADAPTER_BASED_SOURCES, analyzeAndChooseSource(), analyzeAdapterSource(), analyzeDashSource(), analyzeHlsSource(), readInputUrl() (+11 more)

### Community 35 - "Test Test Pressure"
Cohesion: 0.09
Nodes (14): Condition-Based Waiting, Skill Creation Process, Defense-in-Depth, Root Cause Tracing, Four Phases, Hypothesis Testing, Implementation Phase, Pattern Analysis (+6 more)

### Community 36 - "Errors Core Test"
Cohesion: 0.28
Nodes (18): downloadToPartFile(), defineErrorClass(), SYS_RETRYABLE_CODES, AuthenticationError, CancelledError, DiskSpaceError, ExpiredUrlError, FFmpegError (+10 more)

### Community 37 - "Retry Strategy Selectstrategy"
Cohesion: 0.18
Nodes (21): isRetryable(), computeBackoffDelay(), parseRetryAfter(), retryAfterFromError(), retryWithBackoff(), sleep(), done(), onAbort() (+13 more)

### Community 38 - "Installed Install Ffmpeg"
Cohesion: 0.10
Nodes (20): BIN_PATH, checkLocalBinary(), copyBinDirectory(), __dirname, downloadFromSources(), downloadWithProgress(), ensureSevenZip(), extractDir (+12 more)

### Community 39 - "Analyst Scrub Inputs"
Cohesion: 0.09
Nodes (14): Analyst Inputs, Analyst Role, Context Safety, Return Format, Cost and Time, Plan Adherence, Quality Evidence, Repeated Work (+6 more)

### Community 40 - "History Filters Constants"
Cohesion: 0.19
Nodes (14): DEBOUNCE_MS, PERIODS, filterEntries(), createHistoryFilters(), apply(), getVisible(), reset(), setEntries() (+6 more)

### Community 41 - "Hotmart Embed Flags"
Cohesion: 0.17
Nodes (16): parseAnalyzeFlags(), collectDevtoolsHeaders(), isGoogleVideoPlaybackUrl(), parseCliAuth(), parseCliHeaders(), getHotmartEmbedHeaders(), hasHotmartFlag(), HOTMART_EMBED_HEADERS (+8 more)

### Community 42 - "States Job Job"
Cohesion: 0.22
Nodes (18): formatFromVariant(), generateJobId(), serializeError(), toJson(), transitionJob(), createFormat(), isValidFormat(), canTransition() (+10 more)

### Community 43 - "Job Manager Actions"
Cohesion: 0.27
Nodes (15): cancelJob(), enqueueJob(), removeJob(), retryJob(), createManagerApi(), defaultRunner(), JOB_STATUS, createTranscriptionJobManager() (+7 more)

### Community 44 - "Ref Node Cipher"
Cohesion: 0.21
Nodes (16): applyNTransform(), applySignatureCipher(), decipherYouTubeSignature(), resolveCipherFormats(), transformYouTubeNParam(), findDecipherFunctionName(), findHelperObjectName(), findNTransformFunctionName() (+8 more)

### Community 45 - "Install Curlimp Curl"
Cohesion: 0.18
Nodes (16): __dirname, PROJECT_ROOT, defaultInstallDir(), DLL_RE, isSupportedArchive(), PROFILE_BAT_RE, REPO_API_LATEST, selectWindowsAsset() (+8 more)

### Community 46 - "Control Cancel Dispose"
Cohesion: 0.24
Nodes (20): cancel(), dispose(), isAborted(), makeProgress(), pause(), resume(), enqueueJob(), getAllJobs() (+12 more)

### Community 47 - "Resume Session Core"
Cohesion: 0.22
Nodes (14): completedBytes(), createState(), describeState(), loadState(), RESUME_STATE_VERSION, saveState(), validateState(), isExpiredUrlError() (+6 more)

### Community 48 - "Output Cli Flags"
Cohesion: 0.18
Nodes (17): detectWhisperFlags(), getWhisperHelp(), pickFlag(), cleanupDir(), formatElapsed(), isModelFileReady(), isNonEmptyFile(), resolveModelPath() (+9 more)

### Community 49 - "Http Detect Streamgraberror"
Cohesion: 0.23
Nodes (12): StreamGrabError, classifyError(), detectAcceptRanges(), DEFAULT_TIMEOUT_MS, httpErrorFor(), makeController(), rethrowAbort(), isNotMediaResponse() (+4 more)

### Community 50 - "Smart Turbo Defaults"
Cohesion: 0.21
Nodes (13): createSmartTurbo(), isRetryableChunkError(), normalizeSmartTurbo(), SMART_TURBO_DEFAULTS, createAdaptiveController(), sample(), ADAPTIVE_CONTROLLER_DEFAULTS, clampInt() (+5 more)

### Community 51 - "Panel States Transcribe"
Cohesion: 0.19
Nodes (12): ACTIVE_STATES, TERMINAL_STATES, TRANSCRIBE_STAGE_LABELS, TRANSCRIBE_STATE_LABELS, renderQueueActions(), renderQueueHead(), renderQueueMeta(), createQueuePanel() (+4 more)

### Community 52 - "Test Turbo Cleanup"
Cohesion: 0.21
Nodes (10): cleanupResumeArtifacts(), probeRange(), DEFAULT_TURBO_CHUNKS, runTurboDownloadFlow(), cleanupPartial(), complete(), handleFailure(), recordHistory() (+2 more)

### Community 53 - "Analyze Analyzeyoutubeurl Headers"
Cohesion: 0.23
Nodes (15): analyzeYouTubeUrl(), buildYouTubeRequestHeaders(), DEFAULT_HEADERS, buildManifestVariants(), FALLBACK_AUTO(), makeVariant(), extractInitialPlayerResponse(), extractYouTubeVideoId() (+7 more)

### Community 54 - "Format Video Formatsize"
Cohesion: 0.25
Nodes (12): formatSize(), transcribeVideo(), formatMd(), formatSrt(), cleanSegmentText(), cleanTranscriptionText(), formatSrtTime(), formatTimestamp() (+4 more)

### Community 55 - "Checkpoint Buildcheckpointids Createcheckpointemitter"
Cohesion: 0.23
Nodes (15): buildCheckpointIds(), createCheckpointEmitter(), emitCheckpoint(), restoreFromCheckpoint(), createUnsupportedResult(), downloadRepresentation(), fetchBinary(), inspectDashSegmentSupport() (+7 more)

### Community 56 - "Hls Playlist Test"
Cohesion: 0.22
Nodes (8): parseAttributes(), fetchPlaylist(), fetchPlaylistText(), parsePlaylistText(), parseSegmentPlaylist(), fetchMediaPlaylist(), ffmpeg(), FIXTURES

### Community 57 - "Atomic Disk Prepare"
Cohesion: 0.16
Nodes (9): cleanupPart(), createAtomicFile(), moveIntoPlace(), checkDiskSpace(), estimateMuxSpace(), getDiskSpace(), getFreeBytes(), prepare() (+1 more)

### Community 58 - "States Index Constants"
Cohesion: 0.24
Nodes (12): isNonTerminal(), RUNNING_STATES, TERMINAL_STATES, allJobs(), orderedJobs(), seedOrder(), createQueueContext(), subscribeQueueEngine() (+4 more)

### Community 59 - "Principle Testing Skills"
Cohesion: 0.14
Nodes (19): Bulletproofing Skills Against Rationalization, CLAUDE.md Skills Testing, Persuasion Principles for Skill Design, Testing Skills With Subagents, Authority Principle, Commitment Principle, Liking Principle, Meta-Testing (+11 more)

### Community 60 - "Youtube Exec Package"
Cohesion: 0.11
Nodes (18): bin, streamgrab, bugs, url, dependencies, youtube-dl-exec@^3.1.12, description, engines (+10 more)

### Community 61 - "Test Dirname Root"
Cohesion: 0.11
Nodes (11): __dirname, fakeCalls, HLS_INFO, OUT_DIR, ROOT, YT_DLP_MUX, YT_DLP_SINGLE, __dirname (+3 more)

### Community 62 - "Resources Constructor Manager"
Cohesion: 0.19
Nodes (3): createDefaultResourceManager(), ResourceManager, Semaphore

### Community 63 - "Media Info Format"
Cohesion: 0.31
Nodes (11): createDirectFormat(), normalizeRepresentationToFormat(), normalizeVariantToFormat(), detectContainerFromUrl(), estimateSizeBytes(), formatDuration(), buildFormats(), emptyMediaInfo() (+3 more)

### Community 64 - "Skill Superpowers Code"
Cohesion: 0.16
Nodes (18): Superpowers Instructions, Superpowers Attribution, Brainstorming Skill, Brainstorming Frame Template HTML, Code Reviewer Prompt Template, Diagnosing Superpowers Skill, Dispatching Parallel Agents Skill, Executing Plans Skill (+10 more)

### Community 65 - "Views Panel Settings"
Cohesion: 0.21
Nodes (13): VIEWS, createSettingsPanel(), collectSettingsForm(), renderSettingsPanel(), resetSettings(), saveSettings(), settingsStatus(), createPanelsController() (+5 more)

### Community 66 - "Actions Appendactionbtn Renderactions"
Cohesion: 0.28
Nodes (12): appendActionBtn(), renderActions(), clampPercent(), renderError(), renderFiles(), renderProgress(), describeJob(), renderHead() (+4 more)

### Community 67 - "Name Runs Needs"
Cohesion: 0.12
Nodes (16): name, needs, runs-on, name, needs, runs-on, jobs, build-linux (+8 more)

### Community 68 - "Load Settings Coerce"
Cohesion: 0.27
Nodes (7): mergeConfigWithSettings(), migrateLegacyConfig(), coerce(), normalizeSettings(), DEFAULT_SETTINGS, SCHEMA, createSettingsStore()

### Community 69 - "Baseline Core Mjs"
Cohesion: 0.26
Nodes (16): content, cpuDeltaMs(), __dirname, DOCS, FIXTURES, log(), main(), measureAnalyze() (+8 more)

### Community 71 - "Broadcast Setservices Main"
Cohesion: 0.23
Nodes (10): setServices(), ENGINE_EVENTS, initializeApp(), broadcast(), broadcastClipboardDetection(), configurePackagedResources(), configureWhisperModelDir(), createWindow() (+2 more)

### Community 72 - "Ref Electron Dir"
Cohesion: 0.15
Nodes (12): __dirname, DIST_DIR, ELECTRON_DIR, electronPkg, extractArchive(), installScript, isElectronReady(), main() (+4 more)

### Community 73 - "History Storage Core"
Cohesion: 0.22
Nodes (9): createHistoryEntry(), createHistoryStore(), loadEntries(), normalizeEntries(), atomicWriteFileSync(), createJsonStore(), readJsonSafe(), tmpPathFor() (+1 more)

### Community 74 - "Checkpoint Create Createsegmentcheckpoint"
Cohesion: 0.38
Nodes (10): createSegmentCheckpoint(), getJobCheckpoint(), createSegmentTaskId(), setJobCheckpoint(), setJobTaskState(), createDefaultCheckpoint(), normalizeSegmentCheckpointEntry(), cloneSerializableObject() (+2 more)

### Community 75 - "Isvalidm Url Genericprovider"
Cohesion: 0.23
Nodes (11): isValidM3u8Url(), genericProvider, classifyAbsoluteUrl(), DIRECT_EXTENSIONS, discoverManifestCandidates(), pushCandidate(), toAbsoluteUrl(), analyzeGenericPage() (+3 more)

### Community 76 - "Ytdlp Progress Test"
Cohesion: 0.21
Nodes (11): createYtDlpProgressReporter(), emit(), handleLine(), SIZE_FACTORS, toBytes(), toSeconds(), runYtDlpDownload(), toYtDlpError() (+3 more)

### Community 77 - "Transcribe Panel Events"
Cohesion: 0.17
Nodes (7): createDocument(), datasetKey(), FakeElement, find(), job(), makePanel(), matchesSimple()

### Community 78 - "Transcription Whisper Module"
Cohesion: 0.14
Nodes (15): Audio Extraction Module, CLI Transcription Flags, Docker Whisper Setup, Electron Transcription UI, Engine Lifecycle Integration, Transcription Format Module, Transcription Settings, Transcribe API (index.js) (+7 more)

### Community 79 - "Notifications Controller Createnotifier"
Cohesion: 0.24
Nodes (8): createNotifier(), flush(), onJobEvent(), scheduleFlush(), buildNotificationContent(), createShouldNotify(), createShowNotification(), createFocusWindow()

### Community 80 - "Panel Transcribe Controller"
Cohesion: 0.27
Nodes (9): createTranscribePanel(), ensureWired(), refreshTranscribePanel(), refreshEngineStatus(), createTranscribeEventHandler(), createJobsController(), handleJobAction(), refreshJobs() (+1 more)

### Community 81 - "Dir Tools Curl"
Cohesion: 0.22
Nodes (14): __dirname, E2E_DIR, hadRealTools, HAS_FFMPEG, ok(), OUT_DIR, ROOT, runCase() (+6 more)

### Community 82 - "Dir Whisper Limit"
Cohesion: 0.14
Nodes (13): STREAMGRAB_DOWNLOAD_DIR, WHISPER_CPP_PATH, WHISPER_MODEL_DIR, services, streamgrab, build, environment, image (+5 more)

### Community 83 - "Clipboard Watcher Createclipboardwatcher"
Cohesion: 0.21
Nodes (9): createClipboardWatcher(), addCooldown(), cleanupCooldown(), dispose(), poll(), setEnabled(), start(), stop() (+1 more)

### Community 84 - "Steps Continue Error"
Cohesion: 0.48
Nodes (14): steps, steps, steps, steps, steps, continue-on-error, id, if (+6 more)

### Community 85 - "Engine Mdstrm Flow"
Cohesion: 0.18
Nodes (7): calls, createHarness(), __dirname, FakeTransport, ROOT, startServer(), waitForEvent()

### Community 87 - "Files Cache Fail"
Cohesion: 0.15
Nodes (13): with, cache, fail_on_unmatched_files, files, generate_release_notes, if-no-files-found, merge-multiple, name (+5 more)

### Community 88 - "Node Crypto Sha"
Cohesion: 0.21
Nodes (9): __dirname, DIST_DIR, main(), OUTPUT, sha256(), formatSize(), hashExisting(), sha256OfFile() (+1 more)

### Community 89 - "Analyze Large Files"
Cohesion: 0.23
Nodes (12): buildReport(), collectFiles(), countLines(), DEFAULT_OUT, __dirname, EXTENSIONS, formatSize(), IGNORED_DIRS (+4 more)

### Community 90 - "Default Range File"
Cohesion: 0.26
Nodes (5): planFileDownload(), DEFAULT_RANGE_BLOCK_MULTIPLIER, DEFAULT_RANGE_CHUNKS, normalizeBlockCount(), probeRangeSupport()

### Community 91 - "Extract Audio Extractaudio"
Cohesion: 0.35
Nodes (8): extractAudio(), cleanupFileSync(), formatSize(), makeCleanup(), getAudioDuration(), hasAudio(), parseFfmpegProgressSeconds(), parseTimeToSeconds()

### Community 92 - "History Export Rfc"
Cohesion: 0.33
Nodes (8): RFC-4180, CSV_HEADERS, escapeCsvValue(), exportHistoryAsCsv(), exportHistoryAsJson(), exportHistoryToFile(), serializeHistory(), suggestExportFilename()

### Community 93 - "Dashboard Formatters Escapehtml"
Cohesion: 0.41
Nodes (9): escapeHtml(), formatBytes(), formatEta(), formatSpeed(), card(), renderDashboard(), renderDisk(), renderProgress() (+1 more)

### Community 94 - "Electron Test Maketempdir"
Cohesion: 0.21
Nodes (4): createElectronServices(), PERSIST_EVENTS, createDefaultQueueStorage(), PAYLOAD

### Community 95 - "Browserlauncherforplatform Chmodowneronly Companionurl"
Cohesion: 0.20
Nodes (9): browserLauncherForPlatform(), chmodOwnerOnly(), companionUrl(), generateToken(), initialToken(), maybeOpenBrowser(), startServer(), onListen() (+1 more)

### Community 96 - "Dash Fetchdashmanifest Fetchdashmanifesttext"
Cohesion: 0.32
Nodes (8): fetchDashManifest(), fetchDashManifestText(), parseAttributes(), parseDashManifest(), parseSegmentBase(), resolveContentType(), stripTag(), FIXTURES

### Community 97 - "Dlp Cli Flow"
Cohesion: 0.17
Nodes (7): __dirname, fakeCalls, NOOP_IO, OUT_DIR, ROOT, YT_DLP_MUX, YT_DLP_SINGLE

### Community 98 - "Engine Mdstrm Curl"
Cohesion: 0.17
Nodes (6): calls, __dirname, fakeHlsAdapter, FakeTransport, MEDIA_PLAYLIST, ROOT

### Community 99 - "Template Audio Turbo"
Cohesion: 0.22
Nodes (11): Audio Extraction, Clipboard Watch, FFmpeg, History Retention, Smart Turbo, Settings View Template, Audio Subtitle Template, Form Card Template (+3 more)

### Community 100 - "Bootstrappage Getnewestscreen Handlerequest"
Cohesion: 0.22
Nodes (11): bootstrapPage(), getNewestScreen(), handleRequest(), isAuthorized(), isFullDocument(), isRegularFileInsideContentDir(), parseCookies(), pathnameOf() (+3 more)

### Community 101 - "Dashboard Createdashboardaccessor Ensure"
Cohesion: 0.33
Nodes (8): createDashboardAccessor(), ensure(), createQueueDashboard(), destroy(), fetchDiskSpace(), refresh(), startAutoRefresh(), stopAutoRefresh()

### Community 102 - "Electron Builder Eslint"
Cohesion: 0.20
Nodes (10): devDependencies, electron@^37.10.3, electron-builder@^26.15.3, eslint@^10.8.1, ntl@^5.1.0, prettier@^3.9.6, electron-builder, eslint (+2 more)

### Community 103 - "Logger Core Test"
Cohesion: 0.44
Nodes (5): createLogger(), LOG_LEVELS, redact(), redactHeaders(), redactText()

### Community 105 - "Session Redaction Discovery"
Cohesion: 0.22
Nodes (9): Context Safety, GitHub Issues, Redaction Policy, Session Discovery, Diagnosing Superpowers, gh CLI, Redaction, Session Discovery (+1 more)

### Community 106 - "Pre Flight Scan"
Cohesion: 0.25
Nodes (9): Handling Reports, Pre-flight Scan, Resuming From Ledger, BLOCKED, DONE_WITH_CONCERNS, Ledger, NEEDS_CONTEXT, Pre-flight Scan (+1 more)

### Community 107 - "Helper Connect Nextreconnectdelay"
Cohesion: 0.42
Nodes (7): connect(), nextReconnectDelay(), reloadAfterRecovery(), sessionKey(), setStatus(), showTombstone(), websocketUrl()

### Community 108 - "Prettierrc Json Arrowparens"
Cohesion: 0.22
Nodes (8): arrowParens, bracketSpacing, printWidth, semi, singleQuote, tabWidth, trailingComma, useTabs

### Community 109 - "Package Resources Mjs"
Cohesion: 0.33
Nodes (7): buildResourcePlan(), __dirname, main(), OUT_DIR, PROJECT_ROOT, runResourcePlan(), FAKE_TOOLS

### Community 110 - "Skill Discovery Anthropic"
Cohesion: 0.39
Nodes (8): Anthropic Skill Authoring Best Practices, Skill Discovery, Cross-Referencing Skills, Description Field, Progressive Disclosure, Skill Discovery Optimization, Skill Discovery, Token Efficiency

### Community 111 - "Preview Ipc Player"
Cohesion: 0.25
Nodes (8): FFmpeg Preview, IPC Handlers for Preview, Preview Player, Preview Generation, Video Tabs Preview Button, Preview IPC Channels, Preview Media Generation (Spec), Preview Player Spec

### Community 112 - "Broadcast Computeacceptkey Decodeframe"
Cohesion: 0.25
Nodes (8): broadcast(), computeAcceptKey(), decodeFrame(), encodeFrame(), handleMessage(), handleUpgrade(), isAllowedWebSocketOrigin(), touchActivity()

### Community 113 - "Ref Render Graphs"
Cohesion: 0.39
Nodes (5): combineGraphs(), extractDotBlocks(), extractGraphBody(), main(), renderToSvg()

### Community 114 - "Skip Download Whisper"
Cohesion: 0.25
Nodes (8): ELECTRON_SKIP_BINARY_DOWNLOAD, FFMPEG_SKIP_DOWNLOAD, GH_TOKEN, WHISPER_BINARY_ONLY, WHISPER_CMAKE_ARCH, WHISPER_SKIP_DOWNLOAD, YOUTUBE_DL_SKIP_DOWNLOAD, env

### Community 115 - "Formats Isresolvabledirectformat Normalizeyoutubeformat"
Cohesion: 0.57
Nodes (6): isResolvableDirectFormat(), normalizeYouTubeFormat(), sortFormats(), sortVariants(), parseMimeType(), parseYouTubePlayerResponse()

### Community 116 - "Plans Buildcandidateplans Findmatchingadaptiveformat"
Cohesion: 0.50
Nodes (6): buildCandidatePlans(), findMatchingAdaptiveFormat(), findMatchingProgressiveFormat(), parseManifestSelection(), validateYouTubeMediaUrl(), prepareYouTubeDownload()

### Community 117 - "Baseline Smart Turbo"
Cohesion: 0.32
Nodes (6): CONCURRENCIES, content, log(), measure(), out, runProfile()

### Community 118 - "Dashboard Metrics Active"
Cohesion: 0.33
Nodes (4): ACTIVE_STATES, createMetricsTracker(), getMetric(), getPercent()

### Community 119 - "Server Stop Command"
Cohesion: 0.52
Nodes (6): command_has_server_id(), command_line_for_pid(), is_brainstorm_server(), mark_stopped(), read_expected_server_id(), stop-server.sh script

### Community 120 - "Persistence Createsnapshot Loadfromstorage"
Cohesion: 0.67
Nodes (5): createSnapshot(), loadFromStorage(), persistSnapshot(), restoreSnapshot(), createPersistApi()

### Community 121 - "Pump Createpump Extractrunoptions"
Cohesion: 0.43
Nodes (4): createPump(), _pump(), extractRunOptions(), createPumpSync()

### Community 123 - "Gif Screen Recorder"
Cohesion: 0.33
Nodes (6): Assets Directory, FFmpeg GIF Conversion, GIF Recording, Kap Screen Recorder, Peek Screen Recorder, ScreenToGif Tool

### Community 124 - "Analyze Maskdiagurl Resolvefreshvariant"
Cohesion: 0.47
Nodes (4): maskDiagUrl(), resolveFreshVariant(), analyze(), FRESH_VARIANTS

### Community 125 - "Youtube Download Gif"
Cohesion: 0.40
Nodes (5): Download YouTube GIF, StreamGrab Electron Index HTML, Sentinel Security Journal, YouTube Player Page Fixture, Performance Baseline Document

### Community 126 - "Dashboard Queue Auto"
Cohesion: 0.40
Nodes (5): Auto-Refresh Dashboard, Panels Integration for Dashboard, Queue Dashboard, Queue Dashboard Spec, Dashboard Metrics Cards

### Community 127 - "Brandmarkup Escapehtmltext Renderbranding"
Cohesion: 0.40
Nodes (5): brandMarkup(), escapeHtmlText(), renderBranding(), waitingPage(), wrapInFrame()

### Community 129 - "Publish Name Needs"
Cohesion: 0.40
Nodes (5): publish, if, name, needs, runs-on

### Community 130 - "Core Queue Test"
Cohesion: 0.50
Nodes (3): delay(), TERMINAL, waitFor()

### Community 131 - "Evidence Support Verification"
Cohesion: 0.50
Nodes (4): Evidence Support Verification, Privacy Audit, Redaction, Scrubbing Process

### Community 132 - "Export History Module"
Cohesion: 0.50
Nodes (4): History Export Module, IPC Export History Handler, CSV and JSON Export Formats, History Export Spec

### Community 133 - "View Template History"
Cohesion: 0.67
Nodes (4): History View Template, Queue View Template, Transcribe View Template, Whisper

### Community 134 - "Batching Small Shape"
Cohesion: 0.67
Nodes (4): Batching Small Same-Shape Work, Cannot Verify From Diff Items, Final Review and Finish, The Fix Loop

### Community 135 - "Name Needs Runs"
Cohesion: 0.50
Nodes (4): name, needs, runs-on, build-macos-arm64

### Community 136 - "Name Needs Runs"
Cohesion: 0.50
Nodes (4): name, needs, runs-on, build-macos-x64

### Community 137 - "Push Workflow Dispatch"
Cohesion: 0.50
Nodes (4): on, push, workflow_dispatch, tags

### Community 138 - "Community 138"
Cohesion: 0.67
Nodes (3): Clipboard URL Watcher, Clipboard Toast UX, URL Pattern Detection

### Community 139 - "Community 139"
Cohesion: 0.67
Nodes (3): Help Button and Tour Re-entry, Interactive Tutorial / Onboarding, Tour Steps (4-step onboarding)

### Community 140 - "Community 140"
Cohesion: 0.67
Nodes (3): Batch Dialog UI, Batch Download Module, Batch URL Processing Logic

### Community 141 - "Community 141"
Cohesion: 0.67
Nodes (3): Period Filters (24h, week, month), Status Filters (completed, failed, cancelled), History Search and Filters

### Community 142 - "Community 142"
Cohesion: 0.67
Nodes (3): Notification Aggregation (5s window), Native System Notifications, Only When Minimized Behavior

### Community 145 - "Community 145"
Cohesion: 0.67
Nodes (3): Antigravity CLI Tool Mapping, Claude Code Tool Notes, VS Code Copilot Tool Mapping

### Community 146 - "Community 146"
Cohesion: 0.67
Nodes (3): allowScripts, electron@37.10.3, youtube-dl-exec@3.1.12

### Community 147 - "Community 147"
Cohesion: 0.67
Nodes (3): author, email, name

### Community 148 - "Community 148"
Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps
- **150 isolated node(s):** `RFC-6455`, `RFC-4180`, `Analyst Inputs`, `Context Safety`, `Return Format` (+145 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 826 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `electron` connect `Model Handlers Job` to `Electron Builder Eslint`, `Broadcast Setservices Main`, `Handlers Handler Enqueue`, `Notifications Controller Createnotifier`, `Youtube Exec Package`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `RFC-6455`, `RFC-4180`, `Analyst Inputs` to the rest of the system?**
  _150 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tab Video Render` be split into smaller, more focused modules?**
  _Cohesion score 0.06315789473684211 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `Dist Download Test` to `Youtube Exec Package`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Should `Mjs Confirm Main` be split into smaller, more focused modules?**
  _Cohesion score 0.07081377151799687 - nodes in this community are weakly interconnected._
- **Should `Test Download Plan` be split into smaller, more focused modules?**
  _Cohesion score 0.0892018779342723 - nodes in this community are weakly interconnected._
- **Should `Tutorial Clipboard Target` be split into smaller, more focused modules?**
  _Cohesion score 0.05010351966873706 - nodes in this community are weakly interconnected._