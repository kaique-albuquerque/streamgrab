/**
 * YouTube signature — low-level text parsing utilities.
 */

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts a balanced block (e.g. `{...}`) starting at `startIndex`.
 * Respects string literals and escape sequences.
 */
export function extractBalancedBlock(text, startIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === stringChar) { inString = false; stringChar = ''; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; continue; }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return '';
}

/**
 * Extracts a JS object literal by name from a script string.
 */
export function extractObjectDefinition(script, objectName) {
  const patterns = [
    new RegExp(`(?:var|let|const)\\s+${escapeRegex(objectName)}\\s*=\\s*\\{`),
    new RegExp(`${escapeRegex(objectName)}\\s*=\\s*\\{`),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(script);
    if (!match) continue;
    const braceIndex = script.indexOf('{', match.index);
    const objectLiteral = extractBalancedBlock(script, braceIndex, '{', '}');
    if (objectLiteral) return `var ${objectName}=${objectLiteral};`;
  }
  return '';
}

/**
 * Extracts a JS function definition (expression or declaration) by name.
 */
export function extractFunctionDefinition(script, functionName) {
  const expressionPatterns = [
    new RegExp(`${escapeRegex(functionName)}\\s*=\\s*function\\s*\\(([^)]*)\\)\\s*\\{`),
    new RegExp(`(?:var|let|const)\\s+${escapeRegex(functionName)}\\s*=\\s*function\\s*\\(([^)]*)\\)\\s*\\{`),
  ];

  for (const pattern of expressionPatterns) {
    const match = pattern.exec(script);
    if (!match) continue;
    const params = match[1];
    const braceIndex = script.indexOf('{', match.index);
    const body = extractBalancedBlock(script, braceIndex, '{', '}');
    if (body) return `var ${functionName}=function(${params})${body};`;
  }

  const declPattern = new RegExp(
    `function\\s+${escapeRegex(functionName)}\\s*\\(([^)]*)\\)\\s*\\{`
  );
  const declMatch = declPattern.exec(script);
  if (declMatch) {
    const params = declMatch[1];
    const braceIndex = script.indexOf('{', declMatch.index);
    const body = extractBalancedBlock(script, braceIndex, '{', '}');
    if (body) return `function ${functionName}(${params})${body}`;
  }
  return '';
}
