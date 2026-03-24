import { z } from "zod";

export const FormatSqlSchema = z.object({
  sql: z.string().min(1, "SQL cannot be empty"),
});

export type FormatSqlInput = z.infer<typeof FormatSqlSchema>;

interface FormatSqlResult {
  formatted: string;
  changes_made: string[];
}

/* ── SQL keywords to uppercase ── */

const SQL_KEYWORDS = [
  "SELECT",
  "DISTINCT",
  "TOP",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "IN",
  "EXISTS",
  "LIKE",
  "BETWEEN",
  "IS NULL",
  "IS NOT NULL",
  "JOIN",
  "INNER JOIN",
  "LEFT JOIN",
  "LEFT OUTER JOIN",
  "RIGHT JOIN",
  "RIGHT OUTER JOIN",
  "FULL JOIN",
  "FULL OUTER JOIN",
  "CROSS JOIN",
  "ON",
  "INSERT",
  "INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE",
  "CREATE",
  "ALTER",
  "DROP",
  "TABLE",
  "VIEW",
  "PROCEDURE",
  "FUNCTION",
  "TRIGGER",
  "INDEX",
  "AS",
  "BEGIN",
  "END",
  "DECLARE",
  "WITH",
  "GROUP BY",
  "ORDER BY",
  "HAVING",
  "UNION ALL",
  "UNION",
  "NULL",
  "NOT NULL",
  "CONSTRAINT",
  "PRIMARY KEY",
  "FOREIGN KEY",
  "REFERENCES",
  "DEFAULT",
  "CHECK",
  "UNIQUE",
  "IDENTITY",
  "GETDATE",
  "SYSTEM_USER",
  "SCOPE_IDENTITY",
  "NOCOUNT",
  "RETURN",
  "EXEC",
  "EXECUTE",
  "IF",
  "ELSE",
  "WHILE",
  "BREAK",
  "CONTINUE",
  "PRINT",
  "RAISERROR",
  "THROW",
  "TRY",
  "CATCH",
  "TRANSACTION",
  "COMMIT",
  "ROLLBACK",
  "SAVE",
  "TRUNCATE",
  "MERGE",
  "OUTPUT",
  "INSERTED",
  "DELETED",
  "OVER",
  "PARTITION BY",
  "ROW_NUMBER",
  "RANK",
  "DENSE_RANK",
  "NTILE",
  "LAG",
  "LEAD",
  "FIRST_VALUE",
  "LAST_VALUE",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "COALESCE",
  "ISNULL",
  "NULLIF",
  "CAST",
  "CONVERT",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "ASC",
  "DESC",
];

/* ── Helpers ── */

/**
 * Detect whether a given line is inside a string literal.
 * Simple heuristic: count unescaped single quotes before the position.
 */
function isInStringLiteral(line: string, pos: number): boolean {
  let count = 0;
  for (let i = 0; i < pos; i++) {
    if (line[i] === "'") count++;
  }
  return count % 2 === 1;
}

/**
 * Uppercase SQL keywords in a line, being careful not to touch string literals,
 * identifiers in brackets, or column aliases.
 */
function uppercaseKeywords(line: string): { result: string; changed: boolean } {
  // Build a sorted list of keywords by length (longest first) for greedy matching
  const sorted = [...SQL_KEYWORDS].sort((a, b) => b.length - a.length);

  let result = line;
  let changed = false;

  for (const kw of sorted) {
    // Word-boundary aware replacement, case-insensitive
    const re = new RegExp(`(?<![\\w\\[])${escapeRegex(kw)}(?![\\w\\]])`, "gi");
    const replaced = result.replace(re, (match, offset) => {
      // Skip if inside a bracket identifier
      if (isInsideBracket(result, offset)) return match;
      // Skip if inside a string literal
      if (isInStringLiteral(result, offset)) return match;
      if (match !== kw) { changed = true; return kw; }
      return match;
    });
    if (replaced !== result) changed = true;
    result = replaced;
  }

  return { result, changed };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function isInsideBracket(line: string, pos: number): boolean {
  let inBracket = false;
  for (let i = 0; i < pos; i++) {
    if (line[i] === "[") inBracket = true;
    else if (line[i] === "]") inBracket = false;
  }
  return inBracket;
}

/**
 * Find the header end line (last -- === line before CREATE).
 * Returns 0-based index of the last separator line, or -1 if none.
 */
function findHeaderEndIdx(lines: string[]): number {
  const sep = /^\s*--\s*={3,}/;
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sep.test(lines[i])) last = i;
    if (/^\s*CREATE\s+/i.test(lines[i])) break;
  }
  return last;
}

/**
 * Remove `--` comments from body lines (lines after header end).
 * Returns the processed line and whether it was changed.
 */
function removeBodyComment(line: string): { result: string; changed: boolean } {
  const commentIdx = line.indexOf("--");
  if (commentIdx === -1) return { result: line, changed: false };
  if (isInStringLiteral(line, commentIdx)) return { result: line, changed: false };

  // Remove comment and trailing whitespace
  const cleaned = line.slice(0, commentIdx).trimEnd();
  return { result: cleaned, changed: true };
}

/**
 * Format SELECT column list so each column is on its own line
 * with leading-comma style.
 */
function formatSelectColumns(sql: string): { result: string; changed: boolean } {
  let changed = false;
  // Match SELECT ... FROM block (non-greedy, single-level)
  // Strategy: find SELECT keyword and reformat column list until FROM
  const selectRe = /\bSELECT\b([\s\S]*?)\bFROM\b/gi;
  const result = sql.replace(selectRe, (match, colsPart) => {
    // Don't touch if it's a SELECT inside a string or inside /* */
    // Split columns: remove newlines and normalize spaces
    const rawCols = colsPart.replace(/\s+/g, " ").trim();
    if (!rawCols || rawCols === "*") return match; // leave SELECT * alone (error is flagged separately)

    // Split by comma, but respect nested parens
    const cols = splitColumns(rawCols);
    if (cols.length <= 1) return match; // single column or complex — leave alone

    // Check if already in leading-comma format
    const firstNonEmpty = cols.find((c) => c.trim().length > 0);
    if (!firstNonEmpty) return match;

    // Build formatted column list
    const formatted = cols
      .map((c, i) => {
        const trimmed = c.trim();
        if (i === 0) return `\n     ${trimmed}`;
        return `\n    ,${trimmed}`;
      })
      .join("");

    const original = colsPart;
    const newPart = formatted + "\n";
    if (original !== newPart) changed = true;
    return `SELECT${newPart}FROM`;
  });

  return { result, changed };
}

/** Split column list respecting parentheses nesting */
function splitColumns(s: string): string[] {
  const cols: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") { depth++; current += s[i]; }
    else if (s[i] === ")") { depth--; current += s[i]; }
    else if (s[i] === "," && depth === 0) {
      cols.push(current);
      current = "";
    } else {
      current += s[i];
    }
  }
  if (current.trim()) cols.push(current);
  return cols;
}

/**
 * Ensure FROM, WHERE, JOIN lines are at base indentation.
 * This is a light-touch pass — we don't restructure entire blocks.
 */
function formatClauseIndentation(sql: string): { result: string; changed: boolean } {
  let changed = false;
  const lines = sql.split("\n");
  const result = lines.map((line) => {
    // Match lines that start with key clauses (possibly with existing indentation)
    const clauseRe = /^(\s*)(FROM|WHERE|(?:INNER\s+)?JOIN|(?:LEFT|RIGHT|FULL)(?:\s+OUTER)?\s+JOIN|CROSS\s+JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|UNION(?:\s+ALL)?)\b/i;
    const m = line.match(clauseRe);
    if (!m) return line;

    // These clauses should be at base indentation (no indent inside SELECT, 4-space inside BEGIN)
    const currentIndent = m[1];
    const keyword = m[2];
    // Normalize to 4-space indent if already indented beyond 4
    // We only adjust if the line has more than 4 spaces leading
    if (currentIndent.length > 4 && !/^\s{4}[^\s]/.test(line)) {
      const newLine = "    " + line.trim();
      if (newLine !== line) { changed = true; return newLine; }
    }
    return line;
  });

  return { result: result.join("\n"), changed };
}

/**
 * Ensure AND/OR conditions in WHERE blocks are on their own lines with indent.
 */
function formatAndOrConditions(sql: string): { result: string; changed: boolean } {
  let changed = false;
  // Find lines where AND/OR appears mid-line (not at the start)
  const lines = sql.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // If line contains AND/OR NOT at start, split it
    const andOrRe = /(.+?)\s+\b(AND|OR)\b\s+(.+)/i;
    const m = line.match(andOrRe);
    if (m && !/^\s*(AND|OR)\b/i.test(line)) {
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      result.push(m[1].trimEnd());
      result.push(`${indent}  ${m[2].toUpperCase()} ${m[3]}`);
      changed = true;
    } else {
      result.push(line);
    }
  }

  return { result: result.join("\n"), changed };
}

/**
 * Normalize indentation inside BEGIN...END blocks to 4 spaces.
 */
function normalizeBeginEndIndent(sql: string): { result: string; changed: boolean } {
  const lines = sql.split("\n");
  let changed = false;
  let insideBlock = false;
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();
    const isBegin = /^BEGIN\s*$/i.test(trimmed);
    const isEnd = /^END\s*[;]?\s*$/i.test(trimmed);

    if (isBegin) {
      insideBlock = true;
      result.push(line);
      continue;
    }
    if (isEnd) {
      insideBlock = false;
      result.push(line);
      continue;
    }

    if (insideBlock && trimmed.length > 0) {
      const currentIndent = line.length - line.trimStart().length;
      // Normalize to 4 spaces
      if (currentIndent !== 4) {
        const newLine = "    " + trimmed;
        if (newLine !== line) changed = true;
        result.push(newLine);
        continue;
      }
    }

    result.push(line);
  }

  return { result: result.join("\n"), changed };
}

/* ── Main export ── */

export function formatSql(input: FormatSqlInput): FormatSqlResult {
  const { sql } = input;
  const changes_made: string[] = [];

  let current = sql;
  const lines = current.split("\n");
  const headerEndIdx = findHeaderEndIdx(lines);

  /* Pass 1: Remove -- comments from body (preserve header) */
  {
    const headerLines = lines.slice(0, headerEndIdx + 1);
    const bodyLines = lines.slice(headerEndIdx + 1);
    let bodyChanged = false;
    const newBodyLines = bodyLines.map((line) => {
      const { result, changed } = removeBodyComment(line);
      if (changed) bodyChanged = true;
      return result;
    });
    if (bodyChanged) {
      current = [...headerLines, ...newBodyLines].join("\n");
      changes_made.push("Removed inline -- comments from code body (outside documentation header)");
    }
  }

  /* Pass 2: Uppercase SQL keywords */
  {
    const sqlLines = current.split("\n");
    const headerEnd = findHeaderEndIdx(sqlLines);
    const headerPart = sqlLines.slice(0, headerEnd + 1).join("\n");
    const bodyPart = sqlLines.slice(headerEnd + 1).join("\n");

    let bodyChanged = false;
    const bodyLines = bodyPart.split("\n").map((line) => {
      const { result, changed } = uppercaseKeywords(line);
      if (changed) bodyChanged = true;
      return result;
    });

    if (bodyChanged) {
      current = headerPart + "\n" + bodyLines.join("\n");
      changes_made.push("Uppercased SQL keywords (SELECT, FROM, WHERE, JOIN, etc.)");
    }
  }

  /* Pass 3: Format SELECT column list */
  {
    const { result, changed } = formatSelectColumns(current);
    if (changed) {
      current = result;
      changes_made.push("Reformatted SELECT columns to leading-comma style, one per line");
    }
  }

  /* Pass 4: Normalize AND/OR on same line → separate lines */
  {
    const { result, changed } = formatAndOrConditions(current);
    if (changed) {
      current = result;
      changes_made.push("Moved AND/OR conditions to separate lines with indentation");
    }
  }

  /* Pass 5: Clause indentation (FROM, WHERE, JOIN) */
  {
    const { result, changed } = formatClauseIndentation(current);
    if (changed) {
      current = result;
      changes_made.push("Normalized FROM/WHERE/JOIN clause indentation");
    }
  }

  /* Pass 6: BEGIN...END indentation */
  {
    const { result, changed } = normalizeBeginEndIndent(current);
    if (changed) {
      current = result;
      changes_made.push("Normalized 4-space indentation inside BEGIN...END blocks");
    }
  }

  if (changes_made.length === 0) {
    changes_made.push("No formatting changes needed — SQL already compliant");
  }

  return {
    formatted: current,
    changes_made,
  };
}
