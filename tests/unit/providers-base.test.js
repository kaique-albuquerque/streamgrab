import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  defineProvider,
  getProviderContractVersion,
  isLegacyProvider,
  isProviderV2,
} from '../../src/providers/base.js';

test('providers-base: legacy provider e reconhecido como contrato v1', () => {
  const provider = defineProvider({
    id: 'direct',
    label: 'Direct',
    priority: 10,
    detect: () => true,
    async analyze() { return {}; },
    async prepareDownload() { return { downloadUrl: 'https://example.com/video.mp4' }; },
  });

  assert.equal(isLegacyProvider(provider), true);
  assert.equal(isProviderV2(provider), false);
  assert.equal(getProviderContractVersion(provider), 1);
});

test('providers-base: provider com resolve e reconhecido como V2', () => {
  const provider = defineProvider({
    id: 'generic',
    label: 'Generic',
    priority: 1,
    detect: () => false,
    async resolve() {
      return {
        providerId: 'generic',
        matchedBy: 'fallback',
        confidence: 'low',
        requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
        capabilities: {},
        strategyHints: {},
        diagnostics: {},
      };
    },
    async prepareDownload() {
      return { kind: 'direct', source: {}, requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' }, capabilities: {}, strategyHints: {} };
    },
  });

  assert.equal(isProviderV2(provider), true);
  assert.equal(isLegacyProvider(provider), false);
  assert.equal(getProviderContractVersion(provider), 2);
});

test('providers-base: defineProvider rejeita contratos invalidos', () => {
  assert.throws(() => defineProvider(null), TypeError);
  assert.throws(() => defineProvider({ id: '', label: 'X', priority: 1, detect: () => true, analyze: async () => {}, prepareDownload: async () => ({}) }), TypeError);
  assert.throws(() => defineProvider({ id: 'x', label: '', priority: 1, detect: () => true, analyze: async () => {}, prepareDownload: async () => ({}) }), TypeError);
  assert.throws(() => defineProvider({ id: 'x', label: 'X', priority: 'high', detect: () => true, analyze: async () => {}, prepareDownload: async () => ({}) }), TypeError);
  assert.throws(() => defineProvider({ id: 'x', label: 'X', priority: 1, analyze: async () => {}, prepareDownload: async () => ({}) }), TypeError);
  assert.throws(() => defineProvider({ id: 'x', label: 'X', priority: 1, detect: () => true, prepareDownload: 'nope' }), TypeError);
  assert.throws(() => defineProvider({ id: 'x', label: 'X', priority: 1, detect: () => true, analyze: 'nope' }), TypeError);
  assert.throws(() => defineProvider({ id: 'x', label: 'X', priority: 1, detect: () => true, resolve: 'nope' }), TypeError);
});
