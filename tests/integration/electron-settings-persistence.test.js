// Integration: pipeline real de `settings:update` (IPC -> validacao -> store).
//
// Regressao do tour interativo: a UI marca `tutorialCompleted` ao concluir ou
// pular o tutorial. O payload passa por validateSettingsPayload antes de ser
// aplicado; se a chave nao estiver na whitelist o update e descartado em
// silencio e o tour volta a abrir em toda inicializacao.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createElectronServices } from '../../electron/services.js';
import { validateSettingsPayload } from '../../electron/security-payloads-queue/settings.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-it-settings-'));
}

test('settings:update persiste tutorialCompleted entre reinicios', () => {
  const tmp = makeTempDir();
  try {
    const services = createElectronServices({ userDataDir: tmp });
    const clean = validateSettingsPayload({ tutorialCompleted: true });
    assert.deepEqual(clean, { tutorialCompleted: true }, 'payload do renderer deve sobreviver a validacao');

    services.applySettings(clean);
    assert.equal(services.settings.get('tutorialCompleted'), true);
    services.dispose();

    const services2 = createElectronServices({ userDataDir: tmp });
    assert.equal(services2.settings.get('tutorialCompleted'), true, 'tour nao deve reabrir apos reinicio');
    services2.dispose();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('settings:update persiste clipboardWatch entre reinicios', () => {
  const tmp = makeTempDir();
  try {
    const services = createElectronServices({ userDataDir: tmp });
    const clean = validateSettingsPayload({ clipboardWatch: false });
    assert.deepEqual(clean, { clipboardWatch: false }, 'toggle do watcher deve sobreviver a validacao');

    services.applySettings(clean);
    services.dispose();

    const services2 = createElectronServices({ userDataDir: tmp });
    assert.equal(services2.settings.get('clipboardWatch'), false);
    services2.dispose();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
