/**
 * Adaptive concurrency controller extracted from Smart Turbo.
 *
 * This module is transport-agnostic: it only consumes window metrics and
 * returns concurrency decisions. Range keeps using it through the Smart Turbo
 * compatibility facade during the migration. A implementação vive em
 * ./adaptive-controller/.
 */

import { ADAPTIVE_CONTROLLER_DEFAULTS, normalizeAdaptiveControllerOptions } from './adaptive-controller/options.js';
import { createAdaptiveController } from './adaptive-controller/index.js';

export { ADAPTIVE_CONTROLLER_DEFAULTS, normalizeAdaptiveControllerOptions, createAdaptiveController };

export default {
  ADAPTIVE_CONTROLLER_DEFAULTS,
  createAdaptiveController,
  normalizeAdaptiveControllerOptions,
};
