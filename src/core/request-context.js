/**
 * Modelos de RequestContext da Provider V2.
 *
 * Esta etapa so define o contrato normalizado e helpers puros de validacao/
 * merge. O engine legado ainda nao consome este modelo diretamente.
 */

export const REQUEST_CONTEXT_PROFILES = Object.freeze(['default', 'browser']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHeaders(headers) {
  if (headers == null) return {};
  if (!isPlainObject(headers)) {
    throw new TypeError('createRequestContext: headers deve ser um objeto');
  }

  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => key && value != null)
      .map(([key, value]) => [String(key), String(value)]),
  );
}

function normalizeCookies(cookies) {
  if (cookies == null) return null;
  if (!isPlainObject(cookies)) {
    throw new TypeError('createRequestContext: cookies deve ser um objeto ou null');
  }
  return { ...cookies };
}

export function createRequestContext(input = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError('createRequestContext: entrada deve ser um objeto');
  }

  const profile = input.profile == null ? 'default' : String(input.profile);
  if (!REQUEST_CONTEXT_PROFILES.includes(profile)) {
    throw new TypeError(`createRequestContext: profile invalido "${profile}"`);
  }

  return {
    headers: normalizeHeaders(input.headers),
    cookies: normalizeCookies(input.cookies),
    referer: String(input.referer || ''),
    origin: String(input.origin || ''),
    userAgent: String(input.userAgent || ''),
    profile,
  };
}

export function isValidRequestContext(context) {
  if (!isPlainObject(context)) return false;
  if (!isPlainObject(context.headers)) return false;
  if (!Object.values(context.headers).every((value) => typeof value === 'string')) return false;
  if (!(context.cookies === null || isPlainObject(context.cookies))) return false;
  if (typeof context.referer !== 'string') return false;
  if (typeof context.origin !== 'string') return false;
  if (typeof context.userAgent !== 'string') return false;
  return REQUEST_CONTEXT_PROFILES.includes(context.profile);
}

export function mergeRequestContext(base = {}, override = {}) {
  const left = createRequestContext(base);
  const right = createRequestContext(override);

  return {
    headers: { ...left.headers, ...right.headers },
    cookies: right.cookies ?? left.cookies,
    referer: Object.hasOwn(override, 'referer') ? right.referer : left.referer,
    origin: Object.hasOwn(override, 'origin') ? right.origin : left.origin,
    userAgent: Object.hasOwn(override, 'userAgent') ? right.userAgent : left.userAgent,
    profile: Object.hasOwn(override, 'profile') ? right.profile : left.profile,
  };
}
