/**
 * Just enough SQL highlighting for a transformation's logic: comments,
 * strings, numbers, keywords and function calls. Not a parser — the logic is
 * a line or two of an expression, and this only has to colour it the way an
 * editor would, in the app's own code hues.
 */
const TOKEN =
  /(--[^\n]*)|('(?:[^']|'')*')|\b(\d+(?:\.\d+)?)\b|\b([A-Z][A-Z_]*)\b|\b([a-z_][a-z0-9_]*)(?=\()/g;

const KEYWORDS = new Set([
  'ALL',
  'AND',
  'AS',
  'BY',
  'CASE',
  'DAYS',
  'DISTINCT',
  'ELSE',
  'END',
  'FILTER',
  'INTERVAL',
  'JOIN',
  'NOT',
  'ON',
  'OR',
  'ORDER',
  'OVER',
  'PARTITION',
  'THEN',
  'UNION',
  'WHEN',
  'WHERE',
]);

/** `text` as `{ text, type }` runs; `type` is null for plain text. */
export function sqlTokens(text) {
  const runs = [];
  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [whole, comment, string, number, upper, call] = match;
    let type = null;
    if (comment) type = 'comment';
    else if (string) type = 'string';
    else if (number) type = 'number';
    else if (upper) {
      if (KEYWORDS.has(upper)) type = 'keyword';
      else if (text[match.index + whole.length] === '(') type = 'function';
    } else if (call) type = 'function';
    if (!type) continue;
    if (match.index > cursor) runs.push({ text: text.slice(cursor, match.index), type: null });
    runs.push({ text: whole, type });
    cursor = match.index + whole.length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), type: null });
  return runs;
}

/** The first line of logic that is not a comment, for a one-line summary. */
export function firstStatement(text) {
  const lines = text.split('\n').map((line) => line.trim());
  const first = lines.find((line) => line && !line.startsWith('--')) ?? lines[0];
  return lines.length > 1 ? `${first} …` : first;
}
