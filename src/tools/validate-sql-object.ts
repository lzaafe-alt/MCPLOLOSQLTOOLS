import { z } from "zod";

export const ValidateSqlObjectSchema = z.object({
  sql: z.string().min(1, "SQL cannot be empty"),
  object_type: z.enum(["TABLE", "VIEW", "SP", "FUNCTION", "TRIGGER"]),
  schema: z.string().optional(),
});

export type ValidateSqlObjectInput = z.infer<typeof ValidateSqlObjectSchema>;

interface Violation {
  rule_id: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  line?: number;
  suggestion: string;
}

interface ValidateSqlObjectResult {
  valid: boolean;
  score: number;
  object_name: string;
  violations: Violation[];
}

/* ── helpers ── */

const TILDE_PATTERN = /[áéíóúÁÉÍÓÚñÑ]/g;

function hasTildes(sql: string): boolean {
  return TILDE_PATTERN.test(sql);
}

function findTildeLines(sql: string): number[] {
  const lines = sql.split("\n");
  const found: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/[áéíóúÁÉÍÓÚñÑ]/.test(lines[i])) {
      found.push(i + 1);
    }
  }
  return found;
}

function isPascalCase(s: string): boolean {
  if (s.length === 0) return false;
  return /^[A-Z][A-Za-z0-9]*$/.test(s);
}

/** Return the line number (1-based) of a given pattern match, or undefined */
function lineOf(sql: string, pattern: RegExp): number | undefined {
  const lines = sql.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return undefined;
}

/** Extract object name from the CREATE statement */
function extractObjectName(sql: string, type: string): string {
  const prefixMap: Record<string, string> = {
    TABLE: "TABLE",
    VIEW: "VIEW",
    SP: "PROCEDURE",
    FUNCTION: "FUNCTION",
    TRIGGER: "TRIGGER",
  };
  const keyword = prefixMap[type] ?? type;
  // Matches: CREATE [OR ALTER] KEYWORD [schema].[name] or KEYWORD name
  const re = new RegExp(
    `CREATE(?:\\s+OR\\s+ALTER)?\\s+${keyword}\\s+(?:\\[[^\\]]+\\]\\.)?(?:\\[([^\\]]+)\\]|(\\S+))`,
    "i"
  );
  const m = sql.match(re);
  if (!m) return "UNKNOWN";
  return m[1] ?? m[2] ?? "UNKNOWN";
}

/**
 * Find the line number where the documentation header ENDS (the last `-- ===` line).
 * Returns 0 if no header found (treat everything as body).
 */
function findHeaderEndLine(lines: string[]): number {
  // Look for pattern: a line that is "-- ===" style (repeated = signs)
  // The header end is the LAST such line before any CREATE keyword
  let lastSeparatorLine = 0;
  const sepPattern = /^\s*--\s*={3,}/;
  for (let i = 0; i < lines.length; i++) {
    if (sepPattern.test(lines[i])) {
      lastSeparatorLine = i + 1; // 1-based
    }
    // Stop scanning once we hit the CREATE statement
    if (/^\s*CREATE\s+/i.test(lines[i])) break;
  }
  return lastSeparatorLine;
}

/** Find `--` comment lines in the BODY (after header end) */
function findBodyCommentLines(lines: string[], headerEndLine: number): number[] {
  const result: number[] = [];
  for (let i = headerEndLine; i < lines.length; i++) {
    // Only flag standalone -- comments (not inside strings / IDENTITY etc.)
    if (/--/.test(lines[i])) {
      result.push(i + 1);
    }
  }
  return result;
}

/** Detect SELECT * usage */
function findSelectStarLines(sql: string): number[] {
  const lines = sql.split("\n");
  const found: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/SELECT\s+\*/i.test(lines[i])) found.push(i + 1);
  }
  return found;
}

/** Detect SELECT/UPDATE/DELETE without WHERE or TOP */
function findMissingWhereLines(sql: string): number[] {
  const lines = sql.split("\n");
  const found: number[] = [];
  // Simple heuristic: scan for SELECT, UPDATE, DELETE statements
  // that are NOT followed (within 15 lines) by WHERE or use TOP
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSelect = /^\s*(SELECT)\s+(?!TOP\s|\@)/i.test(line) && !/TOP\s+\d+/i.test(line);
    const isUpdate = /^\s*UPDATE\s+/i.test(line);
    const isDelete = /^\s*DELETE\s+/i.test(line);

    if (isSelect || isUpdate || isDelete) {
      // Look ahead up to 20 lines for WHERE or TOP
      let hasWhere = false;
      let hasTop = /TOP\s+\d+/i.test(line);
      const lookAhead = Math.min(i + 20, lines.length);
      for (let j = i; j < lookAhead; j++) {
        if (/\bWHERE\b/i.test(lines[j])) { hasWhere = true; break; }
        if (/\bTOP\s+\d+\b/i.test(lines[j])) { hasTop = true; break; }
        // Stop if we hit another statement boundary
        if (j > i && /^\s*(SELECT|UPDATE|DELETE|INSERT|CREATE|ALTER|DROP|BEGIN|END)\s/i.test(lines[j])) break;
      }
      if (!hasWhere && !hasTop) {
        found.push(i + 1);
      }
    }
  }
  return found;
}

/** Detect hardcoded numeric/string values in WHERE (not Estado which is OK for audit) */
function findHardcodedWhereValues(sql: string): Array<{ line: number; match: string }> {
  const lines = sql.split("\n");
  const found: Array<{ line: number; match: string }> = [];
  // Look for WHERE/AND lines with = numeric or = 'string' where field is not Estado/estado
  const hardcodedRe = /\b(\w+)\s*=\s*('(?:[^']*)'|\d+)/gi;
  let inWhere = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\bWHERE\b/i.test(line)) inWhere = true;
    if (inWhere) {
      let m: RegExpExecArray | null;
      hardcodedRe.lastIndex = 0;
      while ((m = hardcodedRe.exec(line)) !== null) {
        const fieldName = m[1];
        const value = m[2];
        // Skip allowed patterns: Estado = 0/1, and @variable comparisons
        if (/^estado$/i.test(fieldName)) continue;
        if (value.startsWith("@")) continue;
        // Skip if value is actually a variable reference
        found.push({ line: i + 1, match: `${fieldName} = ${value}` });
      }
      // Reset inWhere on empty line or new statement
      if (/^\s*(SELECT|UPDATE|DELETE|INSERT|FROM|JOIN|BEGIN|END)\b/i.test(line) && !/\bWHERE\b/i.test(line)) {
        inWhere = false;
      }
    }
  }
  return found;
}

/* ── TABLE-specific checks ── */

function checkTableAuditFields(sql: string): Violation[] {
  const violations: Violation[] = [];
  const upper = sql.toUpperCase();

  const requiredFields: Array<{ name: string; type: string; rule: string }> = [
    { name: "ESTADO", type: "BIT", rule: "TBL-003" },
    { name: "USUARIOCREACION", type: "VARCHAR", rule: "TBL-004" },
    { name: "USUARIOMODIFICACION", type: "VARCHAR", rule: "TBL-005" },
    { name: "FECHACREACION", type: "DATETIME", rule: "TBL-006" },
    { name: "FECHAMODIFICACION", type: "DATETIME", rule: "TBL-007" },
    { name: "ROWVERSION", type: "TIMESTAMP", rule: "TBL-008" },
  ];

  for (const f of requiredFields) {
    // Field exists if we see the field name in the table definition
    const fieldPresent = new RegExp(`\\[?${f.name}\\]?\\s+${f.type}`, "i").test(sql);
    if (!fieldPresent) {
      violations.push({
        rule_id: f.rule,
        severity: "ERROR",
        message: `Missing mandatory audit field: ${f.name} ${f.type}`,
        suggestion: `Add [${f.name.charAt(0) + f.name.slice(1).toLowerCase()}] ${f.type} NOT NULL to the table definition`,
      });
    }
  }

  return violations;
}

function checkTableConstraints(sql: string, objectName: string): Violation[] {
  const violations: Violation[] = [];

  // PK constraint naming
  const pkMatch = sql.match(/CONSTRAINT\s+(\w+)\s+PRIMARY\s+KEY/i);
  if (!pkMatch) {
    violations.push({
      rule_id: "TBL-009",
      severity: "ERROR",
      message: "No PRIMARY KEY constraint found in table definition",
      suggestion: `Add: CONSTRAINT PK_${objectName} PRIMARY KEY (Id)`,
    });
  } else {
    const pkName = pkMatch[1];
    if (!pkName.startsWith("PK_")) {
      violations.push({
        rule_id: "TBL-009",
        severity: "ERROR",
        message: `PRIMARY KEY constraint must be named with PK_ prefix. Got: '${pkName}'`,
        suggestion: `Rename to: PK_${objectName}`,
      });
    } else if (pkName !== `PK_${objectName}`) {
      violations.push({
        rule_id: "TBL-009",
        severity: "WARNING",
        message: `PRIMARY KEY constraint name '${pkName}' doesn't match expected 'PK_${objectName}'`,
        suggestion: `Rename to: PK_${objectName}`,
      });
    }
  }

  // FK constraints
  const fkMatches = sql.matchAll(/CONSTRAINT\s+(\w+)\s+FOREIGN\s+KEY/gi);
  for (const m of fkMatches) {
    const fkName = m[1];
    if (!fkName.startsWith("FK_")) {
      violations.push({
        rule_id: "TBL-010",
        severity: "ERROR",
        message: `FOREIGN KEY constraint must use FK_ prefix. Got: '${fkName}'`,
        suggestion: `Rename to FK_{CurrentTable}_{ReferencedTable}_{FieldName}`,
      });
    }
  }

  // DEFAULT constraints
  const dfMatches = sql.matchAll(/CONSTRAINT\s+(\w+)\s+DEFAULT/gi);
  for (const m of dfMatches) {
    const dfName = m[1];
    if (!dfName.startsWith("DF_")) {
      violations.push({
        rule_id: "TBL-011",
        severity: "ERROR",
        message: `DEFAULT constraint must use DF_ prefix. Got: '${dfName}'`,
        suggestion: `Rename to DF_${objectName}_{FieldName}`,
      });
    }
  }

  return violations;
}

function checkTableSingular(objectName: string): Violation[] {
  const violations: Violation[] = [];
  // Strip T_ prefix
  const body = objectName.startsWith("T_") ? objectName.slice(2) : objectName;
  // Heuristic: ends in 's' but not common valid endings like 'Status', 'Address', 'Process', etc.
  const allowedSuffix = /(?:Status|Address|Process|Access|Class|Business|Progress|RowVersion)$/i;
  if (body.endsWith("s") && !allowedSuffix.test(body)) {
    violations.push({
      rule_id: "TBL-002",
      severity: "INFO",
      message: `Table name '${objectName}' may be plural (ends in 's'). BSG standard requires singular names.`,
      suggestion: `Use singular form, e.g., T_Alumno instead of T_Alumnos`,
    });
  }
  return violations;
}

function checkAmbiguousFieldNames(sql: string): Violation[] {
  const violations: Violation[] = [];
  const ambiguous = ["Valor", "Dato", "Info"];
  for (const field of ambiguous) {
    const re = new RegExp(`\\[?${field}\\]?\\s+\\w`, "i");
    if (re.test(sql)) {
      violations.push({
        rule_id: "TBL-014",
        severity: "WARNING",
        message: `Ambiguous field name '${field}' found. Use a more descriptive name.`,
        suggestion: `Replace with something specific: e.g., MontoTotal instead of Valor, DatoContacto instead of Dato`,
      });
    }
  }
  return violations;
}

/* ── VIEW-specific checks ── */

function checkViewJoinAliases(sql: string): Violation[] {
  const violations: Violation[] = [];
  const hasJoin = /\bJOIN\b/i.test(sql);
  if (!hasJoin) return violations;

  // Check for bare 'Id' alias (AS Id) in views with JOINs
  if (/\bAS\s+Id\b/i.test(sql)) {
    violations.push({
      rule_id: "VW-002",
      severity: "ERROR",
      message: "Field aliased as bare 'Id' in a view with JOINs. Use a qualified alias like IdTableName.",
      suggestion: "Change 'AS Id' to 'AS Id{TableName}', e.g., AS IdAlumno, AS IdOportunidad",
    });
  }

  // Check table references without aliases (basic: FROM/JOIN [schema].[table] without AS)
  const fromJoinRe = /(?:FROM|JOIN)\s+(?:\[[^\]]+\]\.\s*)?(?:\[([^\]]+)\]|(\w+))(?:\s+(?!AS\s+\w+)(?:WHERE|JOIN|ON|AND|OR|GROUP|ORDER|INNER|LEFT|RIGHT|FULL|CROSS|$))/gi;
  let m: RegExpExecArray | null;
  while ((m = fromJoinRe.exec(sql)) !== null) {
    const tableName = m[1] ?? m[2];
    // Skip INSERTED/DELETED virtual tables
    if (/^(INSERTED|DELETED)$/i.test(tableName ?? "")) continue;
    violations.push({
      rule_id: "VW-003",
      severity: "WARNING",
      message: `Table reference '${tableName ?? "unknown"}' in a JOIN view may be missing an alias.`,
      suggestion: "Every table in a JOIN view must have an alias: FROM [schema].[T_Table] AS T",
    });
  }

  return violations;
}

/* ── SP-specific checks ── */

function checkSPRules(sql: string): Violation[] {
  const violations: Violation[] = [];

  // SET NOCOUNT ON
  if (!/SET\s+NOCOUNT\s+ON/i.test(sql)) {
    violations.push({
      rule_id: "SP-003",
      severity: "WARNING",
      message: "Missing SET NOCOUNT ON inside procedure body.",
      suggestion: "Add 'SET NOCOUNT ON;' as the first statement inside BEGIN block.",
    });
  }

  // Parameters PascalCase — extract @Param names
  const paramRe = /@([A-Za-z_]\w*)/g;
  let m: RegExpExecArray | null;
  // Only check in parameter declarations area (before AS BEGIN)
  const paramSection = sql.replace(/AS\s*\n?\s*BEGIN[\s\S]*/i, "");
  while ((m = paramRe.exec(paramSection)) !== null) {
    const pname = m[1];
    if (!/^[A-Z][A-Za-z0-9]*$/.test(pname)) {
      violations.push({
        rule_id: "SP-005",
        severity: "WARNING",
        message: `Parameter '@${pname}' is not PascalCase.`,
        suggestion: `Rename to @${pname.charAt(0).toUpperCase()}${pname.slice(1)}`,
      });
    }
  }

  // ORDER BY without a business justification comment
  const orderByRe = /ORDER\s+BY\b/gi;
  const orderMatches = [...sql.matchAll(/ORDER\s+BY\b/gi)];
  for (const match of orderMatches) {
    // Check if the line or adjacent comment justifies it
    const idx = match.index ?? 0;
    const surroundingText = sql.slice(Math.max(0, idx - 200), idx + 100);
    if (!/(?:--.*ORDER|ORDER.*--|\bTOP\b)/i.test(surroundingText)) {
      const line = lineOf(sql, /ORDER\s+BY\b/i);
      violations.push({
        rule_id: "SP-007",
        severity: "WARNING",
        message: "ORDER BY found without a justification comment.",
        line,
        suggestion: "Add a comment explaining why ordering is needed, e.g., -- Required for pagination",
      });
      break; // report once
    }
  }
  // Suppress unused variable warning
  void orderByRe;

  return violations;
}

/* ── TRIGGER-specific checks ── */

function checkTriggerNameFormat(objectName: string): Violation[] {
  const violations: Violation[] = [];
  // TR_TableNameNoUnderscores_Action
  if (!objectName.startsWith("TR_")) {
    violations.push({
      rule_id: "TR-001",
      severity: "ERROR",
      message: `Trigger name must start with TR_. Got: '${objectName}'`,
      suggestion: `TR_${objectName.replace(/_/g, "")}_{Action}`,
    });
    return violations;
  }
  const afterPrefix = objectName.slice(3);
  const parts = afterPrefix.split("_");
  if (parts.length !== 2) {
    violations.push({
      rule_id: "TR-001",
      severity: "ERROR",
      message: `Trigger must follow format TR_TableNameNoUnderscores_Action. Got: '${objectName}'`,
      suggestion: "Example: TR_TOportunidad_Insertar, TR_TAlumno_Actualizar",
    });
  } else {
    const [tablePart] = parts;
    if (/_/.test(tablePart)) {
      violations.push({
        rule_id: "TR-002",
        severity: "ERROR",
        message: `Trigger table name part must not contain underscores. Got: '${tablePart}'`,
        suggestion: `Write without underscores: TOportunidadDetalle instead of T_Oportunidad_Detalle`,
      });
    }
  }
  return violations;
}

/* ── COMMON checks ── */

function checkPrefix(
  objectName: string,
  type: string
): Violation | null {
  const prefixMap: Record<string, string> = {
    TABLE: "T_",
    VIEW: "V_",
    SP: "SP_",
    FUNCTION: "F_",
    TRIGGER: "TR_",
  };
  const expected = prefixMap[type];
  if (!expected) return null;
  if (!objectName.startsWith(expected)) {
    return {
      rule_id: "NM-001",
      severity: "ERROR",
      message: `Object name '${objectName}' must start with prefix '${expected}' for type ${type}.`,
      suggestion: `Rename to ${expected}${objectName}`,
    };
  }
  return null;
}

function checkPascalCase(objectName: string, prefix: string): Violation | null {
  const body = objectName.startsWith(prefix) ? objectName.slice(prefix.length) : objectName;
  // For objects with additional underscores (SP, TRIGGER), check only first segment
  const firstSegment = body.split("_")[0];
  if (!isPascalCase(firstSegment)) {
    return {
      rule_id: "NM-002",
      severity: "ERROR",
      message: `Object name body '${firstSegment}' must be PascalCase after prefix '${prefix}'.`,
      suggestion: `Use: ${prefix}${firstSegment.charAt(0).toUpperCase()}${firstSegment.slice(1)}`,
    };
  }
  return null;
}

function checkDboSchema(sql: string): Violation[] {
  const violations: Violation[] = [];
  if (/\[dbo\]/i.test(sql)) {
    const line = lineOf(sql, /\[dbo\]/i);
    violations.push({
      rule_id: "GEN-001",
      severity: "ERROR",
      message: "Usage of [dbo] schema detected. BSG standard forbids using the dbo schema.",
      line,
      suggestion: "Use a business schema like [com], [mkt], [rrhh], etc.",
    });
  }
  return violations;
}

function checkSchemaUsage(sql: string, expectedSchema?: string): Violation[] {
  if (!expectedSchema) return [];
  const violations: Violation[] = [];
  // Detect schema from CREATE statement
  const schemaMatch = sql.match(/CREATE(?:\s+OR\s+ALTER)?\s+\w+\s+\[([^\]]+)\]\./i);
  const foundSchema = schemaMatch ? schemaMatch[1] : null;
  if (foundSchema && foundSchema.toLowerCase() !== expectedSchema.toLowerCase()) {
    violations.push({
      rule_id: "GEN-002",
      severity: "ERROR",
      message: `Object schema '[${foundSchema}]' does not match expected schema '[${expectedSchema}]'.`,
      suggestion: `Change schema to [${expectedSchema}]`,
    });
  }
  return violations;
}

function checkDocHeader(sql: string): Violation[] {
  const violations: Violation[] = [];
  const hasAuthor = /Author\s*:/i.test(sql);
  const hasFecha = /Fecha\s+Creacion\s*:/i.test(sql);
  if (!hasAuthor) {
    violations.push({
      rule_id: "DOC-001",
      severity: "WARNING",
      message: "Documentation header is missing 'Author:' field.",
      suggestion: "Add a header block with Author: and Fecha Creacion: fields above the CREATE statement.",
    });
  }
  if (!hasFecha) {
    violations.push({
      rule_id: "DOC-002",
      severity: "WARNING",
      message: "Documentation header is missing 'Fecha Creacion:' field.",
      suggestion: "Add 'Fecha Creacion: YYYY-MM-DD' to the documentation header.",
    });
  }
  return violations;
}

/* ── SCORE calculation ── */

function calculateScore(violations: Violation[]): number {
  let score = 100;
  for (const v of violations) {
    if (v.severity === "ERROR") score -= 15;
    else if (v.severity === "WARNING") score -= 5;
    else if (v.severity === "INFO") score -= 2;
  }
  return Math.max(0, score);
}

/* ── Main export ── */

export function validateSqlObject(input: ValidateSqlObjectInput): ValidateSqlObjectResult {
  const { sql, object_type, schema } = input;
  const violations: Violation[] = [];

  const objectName = extractObjectName(sql, object_type);
  const lines = sql.split("\n");
  const headerEndLine = findHeaderEndLine(lines);

  /* 1. Prefix check */
  const prefixMap: Record<string, string> = {
    TABLE: "T_",
    VIEW: "V_",
    SP: "SP_",
    FUNCTION: "F_",
    TRIGGER: "TR_",
  };
  const prefix = prefixMap[object_type] ?? "";
  const prefixViolation = checkPrefix(objectName, object_type);
  if (prefixViolation) violations.push(prefixViolation);

  /* 2. PascalCase check */
  if (!prefixViolation) {
    const pcViolation = checkPascalCase(objectName, prefix);
    if (pcViolation) violations.push(pcViolation);
  }

  /* 3. Tildes/ñ check */
  if (hasTildes(sql)) {
    const tildeLines = findTildeLines(sql);
    violations.push({
      rule_id: "GEN-003",
      severity: "ERROR",
      message: `SQL contains accented characters (tildes or ñ) on line(s): ${tildeLines.join(", ")}. These are forbidden.`,
      line: tildeLines[0],
      suggestion: "Remove all accented characters. Use unaccented equivalents: a, e, i, o, u, n.",
    });
  }

  /* 4. No [dbo] schema */
  violations.push(...checkDboSchema(sql));

  /* 5. Schema match */
  violations.push(...checkSchemaUsage(sql, schema));

  /* 6. Documentation header */
  violations.push(...checkDocHeader(sql));

  /* 7. No -- comments in body */
  const bodyCommentLines = findBodyCommentLines(lines, headerEndLine);
  if (bodyCommentLines.length > 0) {
    violations.push({
      rule_id: "DOC-003",
      severity: "WARNING",
      message: `Inline '--' comments found in code body at line(s): ${bodyCommentLines.join(", ")}. Only allowed in documentation header.`,
      line: bodyCommentLines[0],
      suggestion: "Remove inline comments from the code body. Use /* block comments */ for inline documentation.",
    });
  }

  /* 8. No SELECT * */
  const selectStarLines = findSelectStarLines(sql);
  for (const ln of selectStarLines) {
    violations.push({
      rule_id: "PERF-001",
      severity: "ERROR",
      message: `SELECT * found at line ${ln}. Never use SELECT *.`,
      line: ln,
      suggestion: "Enumerate all required columns explicitly.",
    });
  }

  /* 9. No queries without WHERE or TOP */
  const missingWhereLines = findMissingWhereLines(sql);
  for (const ln of missingWhereLines) {
    violations.push({
      rule_id: "PERF-002",
      severity: "ERROR",
      message: `SELECT/UPDATE/DELETE at line ${ln} has no WHERE clause or TOP N — this could scan the entire table.`,
      line: ln,
      suggestion: "Add a WHERE clause or use TOP N to limit results.",
    });
  }

  /* 10. Hardcoded values in WHERE */
  const hardcodedValues = findHardcodedWhereValues(sql);
  for (const hv of hardcodedValues) {
    violations.push({
      rule_id: "QUAL-001",
      severity: "ERROR",
      message: `Hardcoded value in WHERE condition at line ${hv.line}: '${hv.match}'. Use a variable or parameter instead.`,
      line: hv.line,
      suggestion: `Replace literal value with a declared variable or SP parameter, e.g., WHERE ${hv.match.split(" = ")[0]} = @${hv.match.split(" = ")[0]}`,
    });
  }

  /* Type-specific checks */
  if (object_type === "TABLE") {
    violations.push(...checkTableAuditFields(sql));
    violations.push(...checkTableConstraints(sql, objectName));
    violations.push(...checkTableSingular(objectName));
    violations.push(...checkAmbiguousFieldNames(sql));
  }

  if (object_type === "VIEW") {
    violations.push(...checkViewJoinAliases(sql));
  }

  if (object_type === "SP") {
    violations.push(...checkSPRules(sql));
  }

  if (object_type === "TRIGGER") {
    violations.push(...checkTriggerNameFormat(objectName));
  }

  const score = calculateScore(violations);
  const valid = violations.filter((v) => v.severity === "ERROR").length === 0;

  return {
    valid,
    score,
    object_name: objectName,
    violations,
  };
}
