/**
 * YouTube signature — function/object name discovery in player JS.
 */

/**
 * Locates the decipher function name in player JS source.
 */
export function findDecipherFunctionName(script) {
  const patterns = [
    /\.sig\|\|([A-Za-z0-9$]+)\(/,
    /signature",([A-Za-z0-9$]+)\(/,
    /\.set\([^,]+,\s*([A-Za-z0-9$]+)\(/,
    /(?:^|[,{;])([A-Za-z0-9$]+)=function\(\w\)\{\w=\w\.split\(""\)/m,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(script);
    if (match) return match[1];
  }
  return '';
}

/**
 * Locates the n-parameter transform function name in player JS source.
 */
export function findNTransformFunctionName(script) {
  const patterns = [
    /\.get\("n"\)\)&&\(b=([A-Za-z0-9$]+)\(b\)/,
    /\.get\("n"\)\)&&\(.*?=([A-Za-z0-9$]+)\(.*?\)/,
    /(?:^|[;,])([A-Za-z0-9$]+)=function\(\w\)\{var\s+\w=\w\.split\(""\).*?return\s+\w\.join\(""\)\}/m,
    /function\s+([A-Za-z0-9$]+)\(\w\)\{var\s+\w=\w\.split\(""\).*?return\s+\w\.join\(""\)\}/m,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(script);
    if (match) return match[1];
  }
  return '';
}

/**
 * Infers the helper object name used inside a player function body.
 */
export function findHelperObjectName(functionDefinition) {
  const patterns = [
    /([A-Za-z0-9$]{2,})\.[A-Za-z0-9$]{2,}\(\w,\d+\)/,
    /([A-Za-z0-9$]{2,})\.[A-Za-z0-9$]{2,}\(\w\)/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(functionDefinition);
    if (match) return match[1];
  }
  return '';
}
