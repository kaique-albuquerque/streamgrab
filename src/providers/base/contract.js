/** Detecção de contrato e validação de definitions de provider. */

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isProviderV2(provider) {
  return Boolean(provider && typeof provider.resolve === 'function');
}

export function isLegacyProvider(provider) {
  return Boolean(provider && typeof provider.analyze === 'function' && !isProviderV2(provider));
}

export function getProviderContractVersion(provider) {
  return isProviderV2(provider) ? 2 : 1;
}

export function defineProvider(provider) {
  if (!isPlainObject(provider)) {
    throw new TypeError('defineProvider: provider deve ser um objeto');
  }
  if (!provider.id || typeof provider.id !== 'string') {
    throw new TypeError('defineProvider: provider.id e obrigatorio');
  }
  if (!provider.label || typeof provider.label !== 'string') {
    throw new TypeError('defineProvider: provider.label e obrigatorio');
  }
  if (!Number.isFinite(provider.priority)) {
    throw new TypeError('defineProvider: provider.priority deve ser numerico');
  }
  if (typeof provider.detect !== 'function') {
    throw new TypeError('defineProvider: provider.detect deve ser funcao');
  }
  if (Object.hasOwn(provider, 'prepareDownload') && typeof provider.prepareDownload !== 'function') {
    throw new TypeError('defineProvider: provider.prepareDownload deve ser funcao quando informado');
  }
  if (Object.hasOwn(provider, 'analyze') && typeof provider.analyze !== 'function') {
    throw new TypeError('defineProvider: provider.analyze deve ser funcao quando informado');
  }
  if (Object.hasOwn(provider, 'resolve') && typeof provider.resolve !== 'function') {
    throw new TypeError('defineProvider: provider.resolve deve ser funcao quando informado');
  }
  return provider;
}
