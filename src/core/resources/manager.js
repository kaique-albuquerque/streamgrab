/**
 * Gerenciador agregado de limites de recursos do StreamGrab.
 */

import { Semaphore } from './semaphore.js';

/**
 * Gerenciador agregado de limites de recursos do StreamGrab.
 */
export class ResourceManager {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxConcurrentDownloads=3]
   * @param {number} [opts.maxConnectionsPerDownload=8]
   * @param {number} [opts.maxFfmpegProcesses=2]
   * @param {number} [opts.maxTempDirs=8]
   */
  constructor({
    maxConcurrentDownloads = 3,
    maxConnectionsPerDownload = 8,
    maxFfmpegProcesses = 2,
    maxTempDirs = 8,
  } = {}) {
    this.downloads = new Semaphore(maxConcurrentDownloads);
    this.connections = new Semaphore(maxConnectionsPerDownload);
    this.ffmpeg = new Semaphore(maxFfmpegProcesses);
    this.tempDirs = new Semaphore(maxTempDirs);
  }

  /** Snapshot legivel dos limites atuais. */
  get stats() {
    return {
      downloads: { active: this.downloads.active, available: this.downloads.available, max: this.downloads.max },
      connections: { active: this.connections.active, available: this.connections.available, max: this.connections.max },
      ffmpeg: { active: this.ffmpeg.active, available: this.ffmpeg.available, max: this.ffmpeg.max },
      tempDirs: { active: this.tempDirs.active, available: this.tempDirs.available, max: this.tempDirs.max },
    };
  }

  /** Adquire um slot de download simultaneo. Retorna funcao release. */
  acquireDownload(signal) {
    return this.downloads.acquire(signal);
  }

  /** Adquire um slot de conexao HTTP (usado por Range/turbo). */
  acquireConnection(signal) {
    return this.connections.acquire(signal);
  }

  /** Adquire um slot de processo FFmpeg. */
  acquireFfmpeg(signal) {
    return this.ffmpeg.acquire(signal);
  }

  /** Adquire um slot de diretorio temporario. */
  acquireTempDir(signal) {
    return this.tempDirs.acquire(signal);
  }
}

/** Factory de conveniencia. */
export function createDefaultResourceManager(opts) {
  return new ResourceManager(opts);
}
