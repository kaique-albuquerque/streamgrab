# Sentinel's Security Journal

## 2026-08-17 - Unsanitized Output Path in IPC Log Export Vulnerable to Arbitrary File Write
**Vulnerability:** The `app:export-logs` Electron IPC channel accepted an arbitrary user-supplied `path` string without path traversal checking or root directory restriction.
**Learning:** IPC handlers in Electron that accept file output paths must validate that paths are safe absolute paths constrained to permitted application directory roots.
**Prevention:** Use `isSafeAbsolutePath` and `isPathWithin` against allowed directory roots for all IPC handlers that write files.

## 2026-09-03 - Path Containment Bypass via Empty/Unsanitized Root String in `isPathWithin`
**Vulnerability:** `isPathWithin` evaluated empty/whitespace root directory strings to `""`, causing `${r}/` to become `'/'` and matching any absolute POSIX path.
**Learning:** Prefix-based path containment helpers must validate that both child and root are non-empty, safe absolute paths before performing normalization or string prefix checks.
**Prevention:** Always verify `isSafeAbsolutePath(child)` and `isSafeAbsolutePath(root)` in path validation helpers prior to string manipulation.
