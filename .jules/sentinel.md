# Sentinel's Security Journal

## 2026-08-17 - Unsanitized Output Path in IPC Log Export Vulnerable to Arbitrary File Write
**Vulnerability:** The `app:export-logs` Electron IPC channel accepted an arbitrary user-supplied `path` string without path traversal checking or root directory restriction.
**Learning:** IPC handlers in Electron that accept file output paths must validate that paths are safe absolute paths constrained to permitted application directory roots.
**Prevention:** Use `isSafeAbsolutePath` and `isPathWithin` against allowed directory roots for all IPC handlers that write files.

## 2026-09-03 - Path Containment Bypass via Empty/Unsanitized Root String in `isPathWithin`
**Vulnerability:** `isPathWithin` evaluated empty/whitespace root directory strings to `""`, causing `${r}/` to become `'/'` and matching any absolute POSIX path.
**Learning:** Prefix-based path containment helpers must validate that both child and root are non-empty, safe absolute paths before performing normalization or string prefix checks.
**Prevention:** Always verify `isSafeAbsolutePath(child)` and `isSafeAbsolutePath(root)` in path validation helpers prior to string manipulation.

## 2026-09-12 - Incomplete Type Checking in Object Redaction Allowed Non-String Credentials in Logs
**Vulnerability:** Object redaction in `src/core/logger.js` only masked sensitive object keys if `typeof val === 'string'`, allowing numeric PINs, arrays of tokens/cookies, and nested auth objects to be logged unredacted.
**Learning:** Object key redaction must redact all non-nullish data types under sensitive property names, rather than assuming credentials are only primitive strings.
**Prevention:** Check `val !== null && val !== undefined` for keys matching sensitive property names before falling back to recursive object traversal.

## 2026-09-28 - Unsanitized Header Values in Core Normalization Vulnerable to HTTP Header Injection
**Vulnerability:** `normalizeHeaders` in `src/core/header-utils.js` did not sanitize control characters (`\r`, `\n`, `\0`) or filter prototype pollution properties (`__proto__`, `constructor`, `prototype`), allowing malicious CRLF header injection when headers flow to FFmpeg (`-headers`), curl (`-H`), or HTTP requests.
**Learning:** Header normalization across core pipelines must strip control characters and prototype pollution keys before headers reach external CLI tools or network transports.
**Prevention:** Filter prototype keys and strip `[\r\n\0]` from header values centrally in `normalizeHeaders`.

## 2026-10-15 - Unsanitized File Paths in Preview IPC Channels Vulnerable to Arbitrary File Read and Deletion
**Vulnerability:** The `preview:read-file` and `preview:clear` Electron IPC handlers accepted user-supplied `filePath` strings without path traversal validation or preview directory containment checks.
**Learning:** Preview IPC handlers that read or delete preview files must validate that paths are safe absolute paths constrained to the designated preview directory (`getPreviewDir(app.getPath('temp'))`).
**Prevention:** Validate IPC payloads with `validatePreviewFilePathPayload` to enforce `isSafeAbsolutePath` and `isPathWithin` against the preview directory before file system access.

## 2026-11-02 - Unrestricted File Path in History Export IPC Vulnerable to Arbitrary File Write
**Vulnerability:** The `history:export` IPC payload validator did not check directory containment against `allowedRoots`, allowing IPC callers to supply arbitrary export file paths.
**Learning:** File export IPC channels must validate that user-provided destination paths reside within permitted directory roots rather than relying solely on absolute path checking.
**Prevention:** Pass `allowedRoots` to `validateHistoryExportPayload` and enforce `isPathWithin` containment for any custom `filePath`.
