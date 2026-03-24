import type { Rule } from "./general.js";

export const functionRules: Rule[] = [
  {
    id: "FN-001",
    category: "naming",
    rule: "Functions must use the prefix F_ followed by PascalCase in Spanish with no tildes or ñ",
    example_bad: "fn_calcularTotal, Func_Total, UFN_Total",
    example_good: "F_CalcularMontoTotal, F_ObtenerNombreCompleto",
    severity: "ERROR",
  },
  {
    id: "FN-002",
    category: "naming",
    rule: "All parameters and returned fields must use PascalCase, Spanish, no tildes or ñ",
    example_bad: "@alumno_id, @nombre_completo",
    example_good: "@IdAlumno, @NombreCompleto",
    severity: "ERROR",
  },
  {
    id: "FN-003",
    category: "documentation",
    rule: "All functions must have a documentation header with Author, Fecha Creacion, Descripcion, and Parametros. The -- format is ONLY allowed in the header.",
    example_good:
      "-- =============================================\n-- Author:        \n-- Fecha Creacion: yyyy-mm-dd\n-- Descripcion:   \n-- Parametros:    \n-- =============================================",
    severity: "ERROR",
  },
  {
    id: "FN-004",
    category: "aliases",
    rule: "All queries inside functions must use table aliases (same rules as views and SPs)",
    example_bad: "FROM T_Oportunidad JOIN T_Alumno ON ...",
    example_good: "FROM T_Oportunidad AS O JOIN T_Alumno AS A ON ...",
    severity: "ERROR",
  },
  {
    id: "FN-005",
    category: "naming",
    rule: "Field aliases in functions must accurately represent the returned data",
    example_bad: "SELECT O.Nombre AS Dato, O.Monto AS Valor",
    example_good: "SELECT O.Nombre AS NombreOportunidad, O.Monto AS MontoTotal",
    severity: "ERROR",
  },
  {
    id: "FN-006",
    category: "documentation",
    rule: "No unnecessary comments inside functions",
    severity: "WARNING",
  },
  {
    id: "FN-007",
    category: "naming",
    rule: "The 'Id' prefix in field/variable names is reserved exclusively for PK and FK fields",
    example_bad: "@IdResultado (when not a PK/FK)",
    example_good: "@Resultado, @TotalCalculado",
    severity: "ERROR",
  },
  {
    id: "FN-008",
    category: "performance",
    rule: "No hardcoded values inside functions — declare variables",
    example_bad: "WHERE Estado = 1 /* hardcoded */",
    example_good: "DECLARE @EstadoActivo BIT = 1; ... WHERE Estado = @EstadoActivo",
    severity: "ERROR",
  },
];

export const functionRulesText = `# BSG SQL Standards — Function Rules

## FN-001: Prefix F_
Functions must use F_ prefix, PascalCase, Spanish, no tildes/ñ.
- BAD:  fn_calcularTotal, UFN_Total
- GOOD: F_CalcularMontoTotal, F_ObtenerNombreCompleto

## FN-002: Parameters and Fields
All parameters and returned fields: PascalCase, Spanish, no tildes/ñ.
- BAD:  @alumno_id, @nombre_completo
- GOOD: @IdAlumno, @NombreCompleto

## FN-003: Documentation Header
Required in every function (-- allowed ONLY in header):
\`\`\`
-- =============================================
-- Author:
-- Fecha Creacion: yyyy-mm-dd
-- Descripcion:
-- Parametros:
-- =============================================
\`\`\`

## FN-004: Table Aliases Required
All queries inside functions must use aliases.
Alias = first letter(s) of each word in table name (uppercase).

## FN-005: Meaningful Field Aliases
Aliases must represent the data accurately.
- BAD:  O.Nombre AS Dato
- GOOD: O.Nombre AS NombreOportunidad

## FN-006: No Unnecessary Comments
Comments must add value. Remove obvious/redundant comments.

## FN-007: Id Prefix Reserved for PK/FK
Do not use Id prefix for non-PK/FK variables.
- BAD:  @IdResultado, @IdTotal
- GOOD: @Resultado, @Total

## FN-008: No Hardcoded Values
Declare variables for literal values.

## Function Template
\`\`\`sql
-- =============================================
-- Author:           [Author]
-- Fecha Creacion:   [YYYY-MM-DD]
-- Descripcion:      [What this function calculates/returns]
-- Parametros:
--     @IdAlumno    INT    - Id del alumno
-- =============================================
CREATE OR ALTER FUNCTION [com].[F_NombreFuncion]
(
    @IdAlumno INT
)
RETURNS [return_type]
AS
BEGIN
    DECLARE @Resultado [type];

    SELECT @Resultado = [expression]
    FROM [schema].[T_Tabla] AS T
    WHERE T.Id = @IdAlumno
      AND T.Estado = 1;

    RETURN @Resultado;
END
\`\`\`
`;
