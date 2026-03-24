import { z } from "zod";

const FieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  description: z.string(),
});

const ParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
});

export const GenerateTemplateSchema = z.object({
  object_type: z.enum(["TABLE", "VIEW", "SP", "FUNCTION", "TRIGGER"]),
  name: z.string().min(1, "Name cannot be empty"),
  schema: z.string().min(1, "Schema cannot be empty"),
  author: z.string().min(1, "Author cannot be empty"),
  description: z.string().min(1, "Description cannot be empty"),
  fields: z.array(FieldSchema).optional(),
  parameters: z.array(ParameterSchema).optional(),
  action: z.enum(["Insertar", "Actualizar", "Eliminar", "Obtener"]).optional(),
  returns: z.string().optional(),
  trigger_action: z
    .enum([
      "INSERT",
      "UPDATE",
      "DELETE",
      "INSERT, UPDATE",
      "INSERT, DELETE",
      "UPDATE, DELETE",
      "INSERT, UPDATE, DELETE",
    ])
    .optional(),
  table_name: z.string().optional(),
});

export type GenerateTemplateInput = z.infer<typeof GenerateTemplateSchema>;

interface TemplateResult {
  sql: string;
  object_full_name: string;
  notes: string[];
}

function padRight(s: string, width: number): string {
  return s.padEnd(width);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateTableTemplate(input: GenerateTemplateInput): TemplateResult {
  const tableName = `T_${input.name}`;
  const fullName = `[${input.schema}].[${tableName}]`;
  const fields = input.fields ?? [];

  const fieldLines: string[] = [];

  /* Id PK */
  fieldLines.push(`    [Id]                    INT             NOT NULL    IDENTITY(1,1),`);

  /* Custom fields */
  for (const f of fields) {
    const nullStr = f.nullable ? "NULL" : "NOT NULL";
    const nameCol = padRight(`[${f.name}]`, 24);
    const typeCol = padRight(f.type, 16);
    fieldLines.push(`    ${nameCol}${typeCol}${nullStr},`);
  }

  /* Audit fields */
  fieldLines.push(`    /* Campos de auditoría (obligatorios) */`);
  fieldLines.push(
    `    [Estado]                BIT             NOT NULL    CONSTRAINT DF_${tableName}_Estado DEFAULT(1),`
  );
  fieldLines.push(`    [UsuarioCreacion]       VARCHAR(50)     NOT NULL,`);
  fieldLines.push(`    [UsuarioModificacion]   VARCHAR(50)     NOT NULL,`);
  fieldLines.push(
    `    [FechaCreacion]         DATETIME        NOT NULL    CONSTRAINT DF_${tableName}_FechaCreacion DEFAULT(GETDATE()),`
  );
  fieldLines.push(
    `    [FechaModificacion]     DATETIME        NOT NULL    CONSTRAINT DF_${tableName}_FechaModificacion DEFAULT(GETDATE()),`
  );
  fieldLines.push(`    [RowVersion]            TIMESTAMP       NOT NULL,`);
  fieldLines.push(
    `    -- [IdMigracion]        UNIQUEIDENTIFIER NULL,      -- Descomentar si migrado desde v3`
  );
  fieldLines.push(`    CONSTRAINT PK_${tableName} PRIMARY KEY (Id)`);

  const sql = `-- =============================================
-- Tabla:       ${fullName}
-- Author:      ${input.author}
-- Fecha:       ${today()}
-- Descripcion: ${input.description}
-- =============================================
CREATE TABLE ${fullName} (
${fieldLines.join("\n")}
);
`;

  const notes: string[] = [
    `Full object name: ${fullName}`,
    `All 6 mandatory audit fields have been included.`,
    `IdMigracion is commented out — uncomment only if migrating from v3.`,
    `Add FK constraints below: CONSTRAINT FK_${tableName}_{ReferencedTable}_{FieldName} FOREIGN KEY...`,
    `Remember: no object should belong to [dbo] schema.`,
    `Verify all field names are in PascalCase Spanish with no tildes/ñ.`,
    `Consider adding field descriptions via EXEC sp_addextendedproperty for each column.`,
  ];

  return { sql, object_full_name: fullName, notes };
}

function generateViewTemplate(input: GenerateTemplateInput): TemplateResult {
  const viewName = `V_${input.name}`;
  const fullName = `[${input.schema}].[${viewName}]`;
  const fields = input.fields ?? [];

  const selectLines =
    fields.length > 0
      ? fields
          .map((f, i) => {
            const comma = i === 0 ? " " : ",";
            return `    ${comma}T.${f.name}`;
          })
          .join("\n")
      : "     T.Id AS Id${TableName}   /* alias all Id fields */\n    ,T.Campo1\n    ,T.Campo2";

  const sql = `-- =============================================
-- Author:        ${input.author}
-- Fecha Creacion: ${today()}
-- Descripcion:   ${input.description}
-- =============================================
CREATE OR ALTER VIEW ${fullName}
AS
SELECT
${selectLines}
    ,T.Estado
FROM [${input.schema}].[T_${input.name}] AS T
WHERE T.Estado = 1;
`;

  const notes: string[] = [
    `Full object name: ${fullName}`,
    `View name follows multi-join format (one underscore after V_). If this is a single-table view, rename to V_T${input.name}_TipoInformacion.`,
    `All table aliases required: use first letters of each word in UPPERCASE.`,
    `Never expose a bare 'Id' field in JOINs — alias all Id fields with their table context.`,
    `No hardcoded values except Estado = 1 filter.`,
    `The -- comment format is ONLY allowed in the header above.`,
  ];

  return { sql, object_full_name: fullName, notes };
}

function generateSPTemplate(input: GenerateTemplateInput): TemplateResult {
  const action = input.action ?? "Obtener";
  const tableName = `T_${input.name}`;
  const spName = `SP_T${input.name}_${action}`;
  const fullName = `[${input.schema}].[${spName}]`;
  const params = input.parameters ?? [];
  const returns = input.returns ?? "N/A";

  const paramDeclarations =
    params.length > 0
      ? params.map((p) => `    ${p.name.startsWith("@") ? p.name : "@" + p.name}    ${p.type}`).join(",\n")
      : "    /* No parameters */";

  const paramDocs =
    params.length > 0
      ? params
          .map(
            (p) =>
              `--     ${(p.name.startsWith("@") ? p.name : "@" + p.name).padEnd(20)} ${p.type.padEnd(16)} - ${p.description}`
          )
          .join("\n")
      : "--     (none)";

  const exampleParams =
    params.length > 0
      ? params
          .map((p) => {
            const pname = p.name.startsWith("@") ? p.name : "@" + p.name;
            return `${pname} = [value]`;
          })
          .join(", ")
      : "";

  let body = "";
  switch (action) {
    case "Insertar":
      body = generateInsertBody(tableName, input.schema, params);
      break;
    case "Actualizar":
      body = generateUpdateBody(tableName, input.schema, params);
      break;
    case "Eliminar":
      body = generateDeleteBody(tableName, input.schema, params);
      break;
    case "Obtener":
    default:
      body = generateSelectBody(tableName, input.schema, params);
      break;
  }

  const sql = `-- =============================================
-- Author:           ${input.author}
-- Fecha Creacion:   ${today()}
-- Descripcion:      ${input.description}
-- Parametros entrada:
${paramDocs}
-- Excepciones:      N/A
-- Retorna:          ${returns}
-- Version:          1.0.0
-- Ejemplo Validacion:
--     EXEC ${fullName}${exampleParams ? " " + exampleParams : ""}
-- =============================================
CREATE OR ALTER PROCEDURE ${fullName}
${params.length > 0 ? paramDeclarations : "    /* No parameters */"}
AS
BEGIN
    SET NOCOUNT ON;

${body}
END
`;

  const notes: string[] = [
    `Full object name: ${fullName}`,
    `Remember to fill in Excepciones and Retorna in the header.`,
    `All queries must use table aliases (first letters of each word, uppercase).`,
    `No hardcoded values — use declared variables or parameters.`,
    `No functions on filtered columns (use date ranges instead of DATEPART/MONTH/YEAR).`,
    `Parameters starting with @Id are reserved for PK/FK values only.`,
  ];

  return { sql, object_full_name: fullName, notes };
}

function generateInsertBody(tableName: string, schema: string, params: { name: string; type: string; description: string }[]): string {
  const fields = params.map((p) => `[${p.name.replace("@", "")}]`);
  const values = params.map((p) => `${p.name.startsWith("@") ? p.name : "@" + p.name}`);

  const fieldLines =
    fields.length > 0
      ? fields.map((f, i) => `         ${i === 0 ? " " : ","}${f}`).join("\n")
      : "         [Campo1]\n        ,[Campo2]";

  const valueLines =
    values.length > 0
      ? values.map((v, i) => `         ${i === 0 ? " " : ","}${v}`).join("\n")
      : "         @Campo1\n        ,@Campo2";

  return `    INSERT INTO [${schema}].[${tableName}] (
${fieldLines}
        ,[UsuarioCreacion]
        ,[UsuarioModificacion]
        ,[FechaCreacion]
        ,[FechaModificacion]
        ,[Estado]
    )
    VALUES (
${valueLines}
        ,SYSTEM_USER
        ,SYSTEM_USER
        ,GETDATE()
        ,GETDATE()
        ,1
    );

    SELECT SCOPE_IDENTITY() AS Id;`;
}

function generateUpdateBody(tableName: string, schema: string, params: { name: string; type: string; description: string }[]): string {
  const setFields = params
    .filter((p) => !p.name.toLowerCase().includes("id"))
    .map((p) => {
      const field = p.name.replace("@", "");
      const param = p.name.startsWith("@") ? p.name : "@" + p.name;
      return `         [${field}] = ${param}`;
    });

  const setLines =
    setFields.length > 0
      ? setFields.join(",\n") + ",\n        ,[UsuarioModificacion] = SYSTEM_USER\n        ,[FechaModificacion]  = GETDATE()"
      : "         [Campo1]             = @Campo1\n        ,[UsuarioModificacion] = SYSTEM_USER\n        ,[FechaModificacion]  = GETDATE()";

  const idParam = params.find((p) => p.name.toLowerCase().includes("id"));
  const whereClause = idParam
    ? `WHERE T.Id = ${idParam.name.startsWith("@") ? idParam.name : "@" + idParam.name}`
    : `WHERE T.Id = @Id   /* replace with correct PK parameter */`;

  return `    UPDATE T
    SET
${setLines}
    FROM [${schema}].[${tableName}] AS T
    ${whereClause}
      AND T.Estado = 1;`;
}

function generateDeleteBody(tableName: string, schema: string, params: { name: string; type: string; description: string }[]): string {
  const idParam = params.find((p) => p.name.toLowerCase().includes("id"));
  const whereClause = idParam
    ? `WHERE T.Id = ${idParam.name.startsWith("@") ? idParam.name : "@" + idParam.name}`
    : `WHERE T.Id = @Id   /* replace with correct PK parameter */`;

  return `    /* Logical delete — set Estado = 0 instead of physical DELETE */
    UPDATE T
    SET
         [Estado]              = 0
        ,[UsuarioModificacion] = SYSTEM_USER
        ,[FechaModificacion]   = GETDATE()
    FROM [${schema}].[${tableName}] AS T
    ${whereClause};`;
}

function generateSelectBody(tableName: string, schema: string, params: { name: string; type: string; description: string }[]): string {
  const whereLines = params.map((p) => {
    const field = p.name.replace("@", "");
    const param = p.name.startsWith("@") ? p.name : "@" + p.name;
    return `      AND T.${field} = ${param}`;
  });

  const whereBlock =
    whereLines.length > 0
      ? "    WHERE T.Estado = 1\n" + whereLines.join("\n")
      : "    WHERE T.Estado = 1";

  return `    SELECT TOP 1000
         T.Id
        ,T./* Campo1 */
        ,T./* Campo2 */
        ,T.Estado
    FROM [${schema}].[${tableName}] AS T
${whereBlock};`;
}

function generateFunctionTemplate(input: GenerateTemplateInput): TemplateResult {
  const funcName = `F_${input.name}`;
  const fullName = `[${input.schema}].[${funcName}]`;
  const params = input.parameters ?? [];
  const returns = input.returns ?? "VARCHAR(255)";

  const paramDeclarations =
    params.length > 0
      ? params
          .map((p) => `    ${p.name.startsWith("@") ? p.name : "@" + p.name}    ${p.type}`)
          .join(",\n")
      : "    /* No parameters */";

  const paramDocs =
    params.length > 0
      ? params
          .map(
            (p) =>
              `--     ${(p.name.startsWith("@") ? p.name : "@" + p.name).padEnd(20)} ${p.type.padEnd(16)} - ${p.description}`
          )
          .join("\n")
      : "--     (none)";

  const sql = `-- =============================================
-- Author:           ${input.author}
-- Fecha Creacion:   ${today()}
-- Descripcion:      ${input.description}
-- Parametros:
${paramDocs}
-- =============================================
CREATE OR ALTER FUNCTION ${fullName}
(
${params.length > 0 ? paramDeclarations : "    /* No parameters */"}
)
RETURNS ${returns}
AS
BEGIN
    DECLARE @Resultado ${returns};

    SELECT @Resultado = T./* Campo */
    FROM [${input.schema}].[T_${input.name}] AS T
    WHERE T.Id = ${params.length > 0 && params[0].name ? (params[0].name.startsWith("@") ? params[0].name : "@" + params[0].name) : "@Param1"}
      AND T.Estado = 1;

    RETURN @Resultado;
END
`;

  const notes: string[] = [
    `Full object name: ${fullName}`,
    `Replace @Resultado type with the actual return type.`,
    `All queries must use table aliases.`,
    `No hardcoded values — use variables.`,
    `Id prefix is reserved for PK/FK fields only.`,
  ];

  return { sql, object_full_name: fullName, notes };
}

function generateTriggerTemplate(input: GenerateTemplateInput): TemplateResult {
  const triggerAction = input.trigger_action ?? "INSERT";
  const targetTable = input.table_name ?? input.name;
  /* Remove underscores from table name per TR-002 */
  const tableNameNoUnderscores = targetTable.replace(/_/g, "");
  const actionName =
    triggerAction.includes("INSERT") && triggerAction.includes("UPDATE") && triggerAction.includes("DELETE")
      ? "InsercionActualizacionEliminacion"
      : triggerAction.includes("INSERT") && triggerAction.includes("UPDATE")
      ? "InsercionActualizacion"
      : triggerAction.includes("INSERT") && triggerAction.includes("DELETE")
      ? "InsercionEliminacion"
      : triggerAction.includes("UPDATE") && triggerAction.includes("DELETE")
      ? "ActualizacionEliminacion"
      : triggerAction === "INSERT"
      ? "Insertar"
      : triggerAction === "UPDATE"
      ? "Actualizar"
      : "Eliminar";

  const triggerName = `TR_${tableNameNoUnderscores}_${actionName}`;
  const fullName = `[${input.schema}].[${triggerName}]`;
  const tableFullName = `[${input.schema}].[${targetTable}]`;

  const sql = `-- =============================================
-- Author:           ${input.author}
-- Fecha Creacion:   ${today()}
-- Descripcion:      ${input.description}
-- =============================================
CREATE OR ALTER TRIGGER ${fullName}
ON ${tableFullName}
AFTER ${triggerAction}
AS
BEGIN
    SET NOCOUNT ON;

    /* Access inserted/deleted virtual tables as needed */
    /* Example: SELECT Id FROM INSERTED */
    /* Example: SELECT Id FROM DELETED */

    /* Trigger logic here */

END
`;

  const notes: string[] = [
    `Full object name: ${fullName}`,
    `Trigger target table: ${tableFullName}`,
    `Use triggers only as a last resort — prefer SP or application logic.`,
    `INSERTED and DELETED virtual tables are available inside the trigger body.`,
    `The -- comment format is ONLY allowed in the header above.`,
    `Ensure code is properly indented.`,
  ];

  return { sql, object_full_name: fullName, notes };
}

export function generateTemplate(input: GenerateTemplateInput): TemplateResult {
  switch (input.object_type) {
    case "TABLE":
      return generateTableTemplate(input);
    case "VIEW":
      return generateViewTemplate(input);
    case "SP":
      return generateSPTemplate(input);
    case "FUNCTION":
      return generateFunctionTemplate(input);
    case "TRIGGER":
      return generateTriggerTemplate(input);
  }
}
