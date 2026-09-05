# Sentinel's Security Journal

## 2026-08-17 - Unsanitized Output Path in IPC Log Export Vulnerable to Arbitrary File Write
**Vulnerability:** The `app:export-logs` Electron IPC channel accepted an arbitrary user-supplied `path` string without path traversal checking or root directory restriction.
**Learning:** IPC handlers in Electron that accept file output paths must validate that paths are safe absolute paths constrained to permitted application directory roots.
**Prevention:** Use `isSafeAbsolutePath` and `isPathWithin` against allowed directory roots for all IPC handlers that write files.

## 2026-08-28 - Narrow Header Redaction Regex Leaked Custom Token and API Headers in Log Exports
**Vulnerability:** Header redaction regex in `logger.js` only checked exact names (`authorization`, `cookie`, `set-cookie`, `proxy-authorization`, `x-api-key`, `api-key`), allowing custom authentication headers (`x-auth-token`, `x-access-token`, `x-session-id`, `x-csrf-token`, etc.) to leak into log buffers and exported log files.
**Learning:** Custom auth headers are widely used by streaming providers and proxies. Header redaction regexes must match generic token, secret, auth, session, key, and signature patterns in header names, and inline text redaction must use word/whitespace bounds to avoid consuming surrounding text.
**Prevention:** Include generic token, key, auth, and session keywords in `SENSITIVE_HEADER_NAMES` and test inline header redaction against multi-token strings.

## 2026-09-02 - Unescaped Stream Variant Metadata Rendered via innerHTML Injected XSS in Electron
**Vulnerability:** In `electron/renderer/video-tabs.js`, `renderQualities` constructed quality selector buttons by interpolating unescaped media format attributes (`resolution`, `codecs`) into `innerHTML`.
**Learning:** Video playlists and yt-dlp metadata from remote/untrusted sources can contain injected HTML/script tags in resolution labels, codecs, or format notes.
**Prevention:** Always build DOM elements using `document.createElement` and assign text using `textContent` when displaying untrusted media stream attributes in Electron renderer.
