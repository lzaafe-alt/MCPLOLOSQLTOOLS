import { z } from "zod";

export const ValidateObjectNameSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  object_type: z.enum([
    "TABLE",
    "VIEW",
    "SP",
    "FUNCTION",
    "TRIGGER",
    "FIELD",
    "PARAMETER",
    "CONSTRAINT_PK",
    "CONSTRAINT_FK",
    "CONSTRAINT_DF",
    "CONSTRAINT_CHECK",
    "CONSTRAINT_UQ",
  ]),
  context: z.string().optional(),
});

export type ValidateObjectNameInput = z.infer<typeof ValidateObjectNameSchema>;

interface Violation {
  rule: string;
  message: string;
  suggestion?: string;
}

interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

const TILDE_PATTERN = /[áéíóúÁÉÍÓÚñÑ]/;
const AMBIGUOUS_FIELDS = new Set(["Valor", "Dato", "Info", "Descripcion"]);

function hasTildesOrNtilde(name: string): boolean {
  return TILDE_PATTERN.test(name);
}

function isPascalCase(s: string): boolean {
  if (s.length === 0) return false;
  return /^[A-Z][A-Za-z0-9]*$/.test(s);
}

function validateTable(name: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("T_")) {
    violations.push({
      rule: "TBL-001",
      message: `Table name must start with prefix 'T_'. Got: '${name}'`,
      suggestion: `T_${name}`,
    });
    return violations;
  }

  const body = name.slice(2);

  if (body.length === 0) {
    violations.push({
      rule: "TBL-001",
      message: "Table name is empty after T_ prefix",
    });
    return violations;
  }

  if (!isPascalCase(body)) {
    violations.push({
      rule: "TBL-001",
      message: `Table body after T_ must be PascalCase. Got: '${body}'`,
      suggestion: `T_${body.charAt(0).toUpperCase()}${body.slice(1)}`,
    });
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "TBL-001",
      message: `Table name contains tildes or ñ: '${name}'. Remove accented characters.`,
    });
  }

  return violations;
}

function validateView(name: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("V_")) {
    violations.push({
      rule: "VW-001",
      message: `View name must start with prefix 'V_'. Got: '${name}'`,
      suggestion: `V_${name}`,
    });
    return violations;
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "VW-001",
      message: `View name contains tildes or ñ: '${name}'. Remove accented characters.`,
    });
  }

  const afterPrefix = name.slice(2);

  if (afterPrefix.length === 0) {
    violations.push({
      rule: "VW-001",
      message: "View name is empty after V_ prefix",
    });
    return violations;
  }

  const underscoreCount = (afterPrefix.match(/_/g) || []).length;

  /* Single-table format: V_TTableName_InfoType — has exactly ONE underscore after V_ prefix
     That means afterPrefix like "TAlumno_DatosContacto" has 1 underscore → valid.
     Multi-join format: V_Name — has ZERO underscores → valid.
     Invalid: V_Something_Else_Another → afterPrefix has 2+ underscores → invalid for multi-join.
     BUT we allow the single-table pattern (exactly 1 underscore) if the part before underscore starts with T. */
  if (underscoreCount > 1) {
    violations.push({
      rule: "VW-003",
      message: `Multi-join view names must have EXACTLY ONE underscore after V_ prefix. Found ${underscoreCount} underscores in '${afterPrefix}'.`,
      suggestion: `Remove extra underscores. Multi-join example: V_OportunidadDetalle. Single-table example: V_TAlumno_DatosContacto`,
    });
  }

  const firstPart = underscoreCount >= 1 ? afterPrefix.split("_")[0] : afterPrefix;
  if (!isPascalCase(firstPart)) {
    violations.push({
      rule: "VW-001",
      message: `View name body must be PascalCase. Got: '${firstPart}'`,
    });
  }

  return violations;
}

function validateSP(name: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("SP_")) {
    violations.push({
      rule: "SP-001",
      message: `Stored procedure name must start with 'SP_'. Got: '${name}'`,
      suggestion: `SP_${name}`,
    });
    return violations;
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "SP-001",
      message: `SP name contains tildes or ñ: '${name}'.`,
    });
  }

  const afterPrefix = name.slice(3);

  if (afterPrefix.length === 0) {
    violations.push({
      rule: "SP-001",
      message: "SP name is empty after SP_ prefix",
    });
    return violations;
  }

  const underscoreCount = (afterPrefix.match(/_/g) || []).length;

  /* Single-table DML: SP_TAlumno_Insertar → afterPrefix = "TAlumno_Insertar" → 1 underscore → VALID
     SP_TAlumno_Actualizar_Estado → afterPrefix = "TAlumno_Actualizar_Estado" → 2 underscores → also VALID
     Multi-join: SP_OportunidadDetalle → 0 underscores → VALID
     INVALID for multi-join: SP_TDocumentoPWDuracion_ObtenerRows when it is multi-join with extra underscore
     We flag if there are more than 2 underscores in afterPrefix as likely a multi-join with too many. */
  if (underscoreCount > 2) {
    violations.push({
      rule: "SP-002",
      message: `SP name has too many underscores (${underscoreCount} after SP_). Multi-join SPs must have max ONE underscore after SP_; single-table DML max TWO (table_action or table_action_subtype).`,
      suggestion: `Multi-join example: SP_OportunidadDetalle. Single-table: SP_TAlumno_Insertar or SP_TAlumno_Actualizar_Estado`,
    });
  }

  const firstPart = afterPrefix.split("_")[0];
  if (!isPascalCase(firstPart)) {
    violations.push({
      rule: "SP-001",
      message: `SP body after SP_ must be PascalCase. Got: '${firstPart}'`,
    });
  }

  return violations;
}

function validateFunction(name: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("F_")) {
    violations.push({
      rule: "FN-001",
      message: `Function name must start with 'F_'. Got: '${name}'`,
      suggestion: `F_${name}`,
    });
    return violations;
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "FN-001",
      message: `Function name contains tildes or ñ: '${name}'.`,
    });
  }

  const body = name.slice(2);
  if (body.length === 0) {
    violations.push({ rule: "FN-001", message: "Function name is empty after F_ prefix" });
    return violations;
  }

  const firstPart = body.split("_")[0];
  if (!isPascalCase(firstPart)) {
    violations.push({
      rule: "FN-001",
      message: `Function body after F_ must be PascalCase. Got: '${firstPart}'`,
    });
  }

  return violations;
}

function validateTrigger(name: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("TR_")) {
    violations.push({
      rule: "TR-001",
      message: `Trigger name must start with 'TR_'. Got: '${name}'`,
      suggestion: `TR_${name}`,
    });
    return violations;
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "TR-004",
      message: `Trigger name contains tildes or ñ: '${name}'.`,
    });
  }

  const afterPrefix = name.slice(3);
  const parts = afterPrefix.split("_");

  /* Format must be TR_TableName_Action — exactly 2 parts after splitting by _ */
  if (parts.length !== 2) {
    violations.push({
      rule: "TR-001",
      message: `Trigger must follow format TR_NombreTabla_Accion (exactly one underscore after TR_). Got ${parts.length} parts: '${afterPrefix}'`,
      suggestion: `Example: TR_TAlumno_Actualizar, TR_TOportunidad_Insertar`,
    });
  } else {
    const [tablePart, action] = parts;

    if (/_/.test(tablePart)) {
      violations.push({
        rule: "TR-002",
        message: `The table name part of trigger must NOT contain underscores. Got: '${tablePart}'`,
        suggestion: `Write without underscores: e.g., TOportunidadDetalle not T_Oportunidad_Detalle`,
      });
    }

    if (!isPascalCase(tablePart)) {
      violations.push({
        rule: "TR-001",
        message: `Table name part must be PascalCase. Got: '${tablePart}'`,
      });
    }

    const validActions = ["Insertar", "Actualizar", "Eliminar", "Insert", "Update", "Delete"];
    if (action && !validActions.includes(action)) {
      violations.push({
        rule: "TR-001",
        message: `Trigger action should be in Spanish PascalCase: Insertar, Actualizar, or Eliminar. Got: '${action}'`,
        suggestion: `Use: TR_${tablePart}_Insertar, TR_${tablePart}_Actualizar, or TR_${tablePart}_Eliminar`,
      });
    }
  }

  return violations;
}

function validateField(name: string): Violation[] {
  const violations: Violation[] = [];

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "TBL-001",
      message: `Field name contains tildes or ñ: '${name}'.`,
    });
  }

  if (!isPascalCase(name)) {
    violations.push({
      rule: "TBL-001",
      message: `Field name must be PascalCase. Got: '${name}'`,
      suggestion: `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
    });
  }

  if (name === "Id") {
    violations.push({
      rule: "TBL-007",
      message: `Standalone 'Id' as a field name is reserved for the primary key of a table. In views with JOINs, alias it as IdTableName (e.g., IdAlumno).`,
      suggestion: `Use IdTableName format in JOINs (e.g., IdAlumno, IdOportunidad)`,
    });
  }

  if (AMBIGUOUS_FIELDS.has(name)) {
    violations.push({
      rule: "TBL-014",
      message: `Field name '${name}' is too generic/ambiguous. Use a more descriptive name.`,
      suggestion: `Add context: e.g., MontoTotal instead of Valor, DatoContacto instead of Dato`,
    });
  }

  return violations;
}

function validateParameter(name: string): Violation[] {
  const violations: Violation[] = [];

  /* Parameters typically start with @ in SQL but we validate the logical name */
  const logicalName = name.startsWith("@") ? name.slice(1) : name;

  if (hasTildesOrNtilde(logicalName)) {
    violations.push({
      rule: "SP-005",
      message: `Parameter name contains tildes or ñ: '${name}'.`,
    });
  }

  if (!isPascalCase(logicalName)) {
    violations.push({
      rule: "SP-005",
      message: `Parameter name must be PascalCase. Got: '${logicalName}'`,
      suggestion: `@${logicalName.charAt(0).toUpperCase()}${logicalName.slice(1)}`,
    });
  }

  return violations;
}

function validateConstraintPK(name: string, context?: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("PK_")) {
    violations.push({
      rule: "TBL-008",
      message: `PK constraint must start with 'PK_'. Got: '${name}'`,
      suggestion: context ? `PK_${context}` : `PK_T_NombreTabla`,
    });
    return violations;
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "TBL-008",
      message: `PK constraint name contains tildes or ñ.`,
    });
  }

  if (context && name !== `PK_${context}`) {
    violations.push({
      rule: "TBL-008",
      message: `PK constraint should be 'PK_${context}'. Got: '${name}'`,
      suggestion: `PK_${context}`,
    });
  }

  return violations;
}

function validateConstraintFK(name: string, context?: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("FK_")) {
    violations.push({
      rule: "TBL-009",
      message: `FK constraint must start with 'FK_'. Got: '${name}'`,
      suggestion: `FK_NombreTablaActual_NombreTablaReferenciada_NombreCampoFK`,
    });
    return violations;
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "TBL-009",
      message: `FK constraint name contains tildes or ñ.`,
    });
  }

  const parts = name.split("_");
  /* FK_ prefix counts as 1, then needs: currentTable, referencedTable, fieldName — at least 4 parts */
  if (parts.length < 4) {
    violations.push({
      rule: "TBL-009",
      message: `FK constraint must follow format FK_NombreTablaActual_NombreTablaReferenciada_NombreCampoFK. Got ${parts.length - 1} parts after FK_.`,
      suggestion: `Example: FK_T_Oportunidad_T_Alumno_IdAlumno`,
    });
  }

  return violations;
}

function validateConstraintDF(name: string, context?: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("DF_")) {
    violations.push({
      rule: "TBL-010",
      message: `DEFAULT constraint must start with 'DF_'. Got: '${name}'`,
      suggestion: context ? `DF_${context}_Campo` : `DF_T_NombreTabla_Campo`,
    });
    return violations;
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "TBL-010",
      message: `DEFAULT constraint name contains tildes or ñ.`,
    });
  }

  const parts = name.split("_");
  if (parts.length < 3) {
    violations.push({
      rule: "TBL-010",
      message: `DEFAULT constraint must follow format DF_NombreTabla_Campo. Got: '${name}'`,
      suggestion: `Example: DF_T_Alumno_FechaCreacion`,
    });
  }

  return violations;
}

function validateConstraintCheck(name: string, context?: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("CHK_")) {
    violations.push({
      rule: "TBL-011",
      message: `CHECK constraint must start with 'CHK_'. Got: '${name}'`,
      suggestion: context
        ? `CHK_${context}_Columna_Descripcion`
        : `CHK_T_NombreTabla_Columna_Descripcion`,
    });
    return violations;
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "TBL-011",
      message: `CHECK constraint name contains tildes or ñ.`,
    });
  }

  const parts = name.split("_");
  if (parts.length < 4) {
    violations.push({
      rule: "TBL-011",
      message: `CHECK constraint must follow format CHK_NombreTabla_Columna_DescripcionBreve. Got too few parts.`,
      suggestion: `Example: CHK_T_MontoPago_Precio_MayorACero`,
    });
  }

  return violations;
}

function validateConstraintUQ(name: string, context?: string): Violation[] {
  const violations: Violation[] = [];

  if (!name.startsWith("UQ_")) {
    violations.push({
      rule: "TBL-012",
      message: `UNIQUE constraint must start with 'UQ_'. Got: '${name}'`,
      suggestion: context ? `UQ_${context}_Columna` : `UQ_T_NombreTabla_Columna`,
    });
    return violations;
  }

  if (hasTildesOrNtilde(name)) {
    violations.push({
      rule: "TBL-012",
      message: `UNIQUE constraint name contains tildes or ñ.`,
    });
  }

  const parts = name.split("_");
  if (parts.length < 3) {
    violations.push({
      rule: "TBL-012",
      message: `UNIQUE constraint must follow format UQ_NombreTabla_Columna. Got: '${name}'`,
      suggestion: `Example: UQ_T_Persona_Email`,
    });
  }

  return violations;
}

export function validateObjectName(input: ValidateObjectNameInput): ValidationResult {
  const { name, object_type, context } = input;
  let violations: Violation[] = [];

  switch (object_type) {
    case "TABLE":
      violations = validateTable(name);
      break;
    case "VIEW":
      violations = validateView(name);
      break;
    case "SP":
      violations = validateSP(name);
      break;
    case "FUNCTION":
      violations = validateFunction(name);
      break;
    case "TRIGGER":
      violations = validateTrigger(name);
      break;
    case "FIELD":
      violations = validateField(name);
      break;
    case "PARAMETER":
      violations = validateParameter(name);
      break;
    case "CONSTRAINT_PK":
      violations = validateConstraintPK(name, context);
      break;
    case "CONSTRAINT_FK":
      violations = validateConstraintFK(name, context);
      break;
    case "CONSTRAINT_DF":
      violations = validateConstraintDF(name, context);
      break;
    case "CONSTRAINT_CHECK":
      violations = validateConstraintCheck(name, context);
      break;
    case "CONSTRAINT_UQ":
      violations = validateConstraintUQ(name, context);
      break;
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
