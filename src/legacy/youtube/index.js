/**
 * YouTube — barrel público do módulo legacy.
 */

// Re-export public API for backward compatibility
export { isYouTubeWatchUrl, fetchYouTubePage, extractInitialPlayerResponse } from './page.js';
export { parseYouTubePlayerResponse } from './response.js';
export { analyzeYouTubeUrl } from './analyze.js';
export { prepareYouTubeDownload } from './prepare.js';
