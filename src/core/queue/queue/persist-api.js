/**
 * DownloadQueue — persistencia (snapshot/restore/save/load) e dispose.
 */

import {
  createSnapshot, restoreSnapshot, persistSnapshot, loadFromStorage,
} from '../persistence.js';

export function createPersistApi({ engine, state, jobs, pump, disposeEngine }) {
  const maybePump = () => {
    if (state.autoStart && !state.paused) pump();
  };

  return {
    snapshot() { return createSnapshot(jobs); },

    restore(snapshot) {
      restoreSnapshot(engine, snapshot, state.order);
      return this;
    },

    save() {
      return persistSnapshot(state.storage, createSnapshot(jobs));
    },

    async load() {
      const data = loadFromStorage(state.storage);
      restoreSnapshot(engine, data, state.order);
      maybePump();
      return this;
    },

    dispose() {
      disposeEngine();
      state.order.length = 0;
      state.running.clear();
      state.started.clear();
    },
  };
}
