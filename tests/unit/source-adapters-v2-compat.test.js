import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSourceAdapter } from '../../src/source-adapters.js';

test('source-adapters v2 compat: adapter expõe resolve e prepareDownloadPlan', async () => {
  const adapter = resolveSourceAdapter('https://cdn.example.com/video.mp4');

  assert.equal(typeof adapter.resolve, 'function');
  assert.equal(typeof adapter.prepareDownloadPlan, 'function');

  const resolution = await adapter.resolve({ url: 'https://cdn.example.com/video.mp4' });
  assert.equal(resolution.contractVersion, 2);
  assert.equal(resolution.providerId, 'direct');
  assert.equal(resolution.kind, 'direct');

  const plan = await adapter.prepareDownloadPlan({
    url: 'https://cdn.example.com/video.mp4',
    analysis: { sourceType: 'direct' },
    options: { turbo: true },
  });
  assert.equal(plan.contractVersion, 2);
  assert.equal(plan.kind, 'direct');
  assert.deepEqual(plan.source, { url: 'https://cdn.example.com/video.mp4' });
  assert.equal(plan.strategyHints.preferredTransport, 'range');
});
