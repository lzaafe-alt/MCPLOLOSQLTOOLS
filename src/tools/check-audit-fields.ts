import { z } from "zod";

export const CheckAuditFieldsSchema = z.object({
  sql: z.string().min(1, "SQL cannot be empty"),
});

export type CheckAuditFieldsInput = z.infer<typeof CheckAuditFieldsSchema>;

interface MissingField {
  field: string;
  type: string;
  required: boolean;
}

interface WrongType {
  field: string;
  expected: string;
  found: string;
}

interface CheckAuditFieldsResult {
  valid: boolean;
  table_name: string;
  present_fields: string[];
  missing_fields: MissingField[];
  wrong_types: WrongType[];
  has_primary_key: boolean;
  primary_key_name?: string;
  primary_key_valid: boolean;
  id_field_type?: string;
}

/* ── Audit field definitions ── */

interface AuditFieldDef {
  field: string;
  /** Expected SQL type token — we do a case-insensitive prefix check */
  expectedType: string;
  required: boolean;
  /** Alternatives accepted (e.g., IdMigracion can be UNIQUEIDENTIFIER or INT) */
  alternativeType?: string;
}

const AUDIT_FIELDS: AuditFieldDef[] = [
  { field: "Estado",              expectedType: "BIT",              required: true },
  { field: "UsuarioCreacion",     expectedType: "VARCHAR",          required: true },
  { field: "UsuarioModificacion", expectedType: "VARCHAR",          required: true },
  { field: "FechaCreacion",       expectedType: "DATETIME",         required: true },
  { field: "FechaModificacion",   expectedType: "DATETIME",         required: true },
  { field: "RowVersion",          expectedType: "TIMESTAMP",        required: true },
  { field: "IdMigracion",         expectedType: "UNIQUEIDENTIFIER", required: false, alternativeType: "INT" },
];

/* ── helpers ── */

function extractTableName(sql: string): string {
  const re = /CREATE\s+TABLE\s+(?:\[[^\]]+\]\.)?\[?([^\]\s(,]+)\]?/i;
  const m = sql.match(re);
  return m ? m[1].replace(/[\[\]]/g, "") : "UNKNOWN";
}

/**
 * Parses the field definitions from inside the CREATE TABLE body.
 * Returns a map of fieldName (lower) → declared SQL type (upper).
 */
function parseTableFields(sql: string): Map<string, string> {
  const fields = new Map<string, string>();

  // Extract the content between the first ( and the matching )
  const openIdx = sql.indexOf("(");
  if (openIdx === -1) return fields;

  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) { closeIdx = i; break; }
    }
  }

  const body = closeIdx === -1 ? sql.slice(openIdx + 1) : sql.slice(openIdx + 1, closeIdx);
  const rows = body.split("\n");

  for (const row of rows) {
    const trimmed = row.trim();
    // Skip constraint lines, comments, blank lines
    if (!trimmed || /^(CONSTRAINT|\/\*|--)/i.test(trimmed)) continue;

    // Match [FieldName] TYPE or FieldName TYPE
    const fieldRe = /^\[?(\w+)\]?\s+(\w+)/;
    const m = trimmed.match(fieldRe);
    if (m) {
      fields.set(m[1].toLowerCase(), m[2].toUpperCase());
    }
  }

  return fields;
}

/** Extract PRIMARY KEY info from the sql */
function extractPrimaryKey(sql: string): { name?: string; exists: boolean } {
  const re = /CONSTRAINT\s+(\w+)\s+PRIMARY\s+KEY/i;
  const m = sql.match(re);
  if (m) return { name: m[1], exists: true };
  // Inline PRIMARY KEY without named constraint
  if (/PRIMARY\s+KEY/i.test(sql)) return { exists: true };
  return { exists: false };
}

/** Detect Id field type (INT or BIGINT) */
function extractIdFieldType(fields: Map<string, string>): string | undefined {
  const idType = fields.get("id");
  if (!idType) return undefined;
  if (idType === "INT" || idType === "BIGINT") return idType;
  return idType; // return whatever we found
}

/* ── Main export ── */

export function checkAuditFields(input: CheckAuditFieldsInput): CheckAuditFieldsResult {
  const { sql } = input;

  const tableName = extractTableName(sql);
  const fields = parseTableFields(sql);
  const pkInfo = extractPrimaryKey(sql);
  const idFieldType = extractIdFieldType(fields);

  const presentFields: string[] = [];
  const missingFields: MissingField[] = [];
  const wrongTypes: WrongType[] = [];

  for (const def of AUDIT_FIELDS) {
    const key = def.field.toLowerCase();
    const foundType = fields.get(key);

    if (!foundType) {
      missingFields.push({ field: def.field, type: def.expectedType, required: def.required });
      continue;
    }

    presentFields.push(def.field);

    // Type check — foundType must start with expectedType (handles VARCHAR(50) etc.)
    const typeMatches =
      foundType.startsWith(def.expectedType) ||
      (def.alternativeType !== undefined && foundType.startsWith(def.alternativeType));

    if (!typeMatches) {
      const expected = def.alternativeType
        ? `${def.expectedType} or ${def.alternativeType}`
        : def.expectedType;
      wrongTypes.push({ field: def.field, expected, found: foundType });
    }
  }

  // PK validity
  let primaryKeyValid = false;
  if (pkInfo.exists && pkInfo.name) {
    primaryKeyValid = pkInfo.name === `PK_${tableName}`;
  } else if (pkInfo.exists) {
    // Unnamed PK — not valid per BSG standards
    primaryKeyValid = false;
  }

  // valid = all required fields present with correct types, no wrong types on required fields
  const requiredMissing = missingFields.filter((f) => f.required);
  const requiredWrongTypes = wrongTypes.filter((wt) => {
    const def = AUDIT_FIELDS.find((d) => d.field.toLowerCase() === wt.field.toLowerCase());
    return def?.required;
  });

  const valid =
    requiredMissing.length === 0 &&
    requiredWrongTypes.length === 0 &&
    pkInfo.exists &&
    primaryKeyValid;

  return {
    valid,
    table_name: tableName,
    present_fields: presentFields,
    missing_fields: missingFields,
    wrong_types: wrongTypes,
    has_primary_key: pkInfo.exists,
    primary_key_name: pkInfo.name,
    primary_key_valid: primaryKeyValid,
    id_field_type: idFieldType,
  };
}
