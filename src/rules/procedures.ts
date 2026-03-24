import type { Rule } from "./general.js";

export const procedureRules: Rule[] = [
  {
    id: "SP-001",
    category: "naming",
    rule: "Stored procedures must use the prefix SP_ followed by PascalCase in Spanish with no tildes or ñ",
    example_bad: "USP_Alumno, spAlumno, usp_alumno",
    example_good: "SP_Alumno_Obtener, SP_TAlumno_Insertar",
    severity: "ERROR",
  },
  {
    id: "SP-002",
    category: "naming",
    rule: "Multi-join SPs must have EXACTLY ONE underscore after SP_ prefix — no additional underscores. Single-table DML SPs with action ARE valid with two underscores.",
    example_bad: "SP_TDocumentoPWDuracion_ObtenerRows (extra underscore for multi-join)",
    example_good: "SP_OportunidadDetalle (multi-join), SP_TAlumno_Insertar (single-table DML)",
    severity: "ERROR",
  },
  {
    id: "SP-003",
    category: "naming",
    rule: "Single-table DML procedures format: SP_NombreTabla(SinSeparadores)_Accion — same schema as the table",
    example_bad: "SP_Alumno_Insert, SP_InsertarAlumno",
    example_good:
      "SP_TAlumno_Insertar, SP_TAlumno_Actualizar, SP_TAlumno_Eliminar, SP_TAlumno_Obtener",
    severity: "ERROR",
  },
  {
    id: "SP-004",
    category: "naming",
    rule: "Update SP for specific field groups: SP_NombreTabla_Actualizar (full update) or SP_NombreTabla_Actualizar_Estado (Estado update omits field name in suffix)",
    example_bad: "SP_TAlumno_ActualizarEstado, SP_TAlumno_Update_Estado",
    example_good: "SP_TAlumno_Actualizar_Estado (Estado update) or SP_TAlumno_Actualizar (full)",
    severity: "WARNING",
  },
  {
    id: "SP-005",
    category: "naming",
    rule: "Parameters must use PascalCase, Spanish, no tildes/ñ, and must match the field name being filtered or operated on",
    example_bad: "@id, @IdOpp, @alumno_id",
    example_good: "@IdOportunidad, @IdFaseOportunidad_Seguimiento, @Nombre",
    severity: "ERROR",
  },
  {
    id: "SP-006",
    category: "documentation",
    rule: "All stored procedures must have a documentation header with Author, Fecha Creacion, Descripcion, Parametros entrada, Excepciones, Retorna, Version, and Ejemplo Validacion. The -- format is ONLY allowed in the header.",
    example_good:
      "-- =============================================\n-- Author:        \n-- Fecha Creacion: yyyy-mm-dd\n-- Descripcion:   \n-- Parametros entrada:\n-- Excepciones:   \n-- Retorna:       \n-- Version:       \n-- Ejemplo Validacion:\n-- =============================================",
    severity: "ERROR",
  },
  {
    id: "SP-007",
    category: "aliases",
    rule: "All queries inside SPs must use table aliases (same rules as views: first letters of each word in uppercase)",
    example_bad: "FROM T_Oportunidad JOIN T_Alumno ON ...",
    example_good: "FROM T_Oportunidad AS O JOIN T_Alumno AS A ON ...",
    severity: "ERROR",
  },
  {
    id: "SP-008",
    category: "performance",
    rule: "No hardcoded values — declare variables for any literal values used in the logic",
    example_bad: "WHERE O.TipoId = 3",
    example_good:
      "DECLARE @TipoActivo INT = 3;\nWHERE O.TipoId = @TipoActivo /* or receive as parameter */",
    severity: "ERROR",
  },
  {
    id: "SP-009",
    category: "performance",
    rule: "No functions on filtered columns in WHERE — use date ranges instead of DATEPART, MONTH, YEAR, etc.",
    example_bad: "WHERE YEAR(O.FechaCreacion) = 2026 AND MONTH(O.FechaCreacion) = 3",
    example_good: "WHERE O.FechaCreacion >= '2026-03-01' AND O.FechaCreacion < '2026-04-01'",
    severity: "ERROR",
  },
  {
    id: "SP-010",
    category: "naming",
    rule: "Temp table and variable names must be specific — match the actual field/table they represent",
    example_bad: "@Id (generic), @IdAsesor (if FK references T_Personal)",
    example_good: "@IdOportunidad, @IdPersonal_Asignado",
    severity: "ERROR",
  },
  {
    id: "SP-011",
    category: "naming",
    rule: "The 'Id' prefix in field/variable names is reserved exclusively for PK and FK fields — do not use it for anything else",
    example_bad: "@IdResultado (when it is not a PK/FK), @IdContador",
    example_good: "@Resultado, @Contador, @CantidadRegistros",
    severity: "ERROR",
  },
];

export const procedureRulesText = `# BSG SQL Standards — Stored Procedure Rules

## SP-001: Prefix SP_
SPs must use SP_ prefix, PascalCase, Spanish, no tildes/ñ.
- BAD:  USP_Alumno, spAlumno
- GOOD: SP_TAlumno_Insertar, SP_OportunidadDetalle

## SP-002: Underscore Rule — Multi-Join vs Single-Table
Multi-join SPs: EXACTLY ONE underscore after SP_ (no additional underscores).
Single-table DML SPs with action: TWO underscores IS valid.
- BAD (multi-join): SP_TDocumentoPWDuracion_ObtenerRows
- GOOD (multi-join): SP_OportunidadDetalle
- GOOD (single-table DML): SP_TAlumno_Insertar

## SP-003: Single-Table DML Format
Format: SP_NombreTabla(SinSeparadores)_Accion
Actions: Insertar, Actualizar, Eliminar, Obtener
- GOOD: SP_TAlumno_Insertar, SP_TAlumno_Actualizar, SP_TAlumno_Eliminar

## SP-004: Partial Update Naming
Full update:   SP_TAlumno_Actualizar
Estado update: SP_TAlumno_Actualizar_Estado
Other partial: SP_TAlumno_Actualizar_DatosContacto

## SP-005: Parameters
PascalCase, Spanish, no tildes/ñ. Must match the field being filtered.
- BAD:  @id, @alumno_id
- GOOD: @IdOportunidad, @IdFaseOportunidad_Seguimiento

## SP-006: Documentation Header
Required in every SP (-- allowed ONLY in header):
\`\`\`
-- =============================================
-- Author:
-- Fecha Creacion: yyyy-mm-dd
-- Descripcion:
-- Parametros entrada:
-- Excepciones:
-- Retorna:
-- Version:
-- Ejemplo Validacion:
-- =============================================
\`\`\`

## SP-007: Table Aliases Required
Same as views — all queries must use aliases.
Alias = first letter(s) of each word in table name (uppercase).

## SP-008: No Hardcoded Values
Declare variables for literals.
- BAD:  WHERE O.TipoId = 3
- GOOD: DECLARE @TipoId INT = 3; ... WHERE O.TipoId = @TipoId

## SP-009: No Functions on Filtered Columns
Use date ranges instead of DATEPART/MONTH/YEAR in WHERE.
- BAD:  WHERE YEAR(O.FechaCreacion) = 2026
- GOOD: WHERE O.FechaCreacion >= '2026-01-01' AND O.FechaCreacion < '2027-01-01'

## SP-010: Specific Temp/Variable Names
Variable names must reflect the actual data.
- BAD:  @Id, @IdAsesor (when FK is to T_Personal)
- GOOD: @IdOportunidad, @IdPersonal_Asignado

## SP-011: Id Prefix Reserved for PK/FK Only
Do not use Id prefix for non-PK/FK variables.
- BAD:  @IdResultado, @IdContador
- GOOD: @Resultado, @Contador

## SP Template: SP_TAlumno_Insertar
\`\`\`sql
-- =============================================
-- Author:           [Author]
-- Fecha Creacion:   [YYYY-MM-DD]
-- Descripcion:      Inserta un nuevo registro en T_Alumno
-- Parametros entrada:
--     @Nombre    VARCHAR(100)
-- Excepciones:      N/A
-- Retorna:          Id del registro creado
-- Version:          1.0.0
-- Ejemplo Validacion:
--     EXEC [com].[SP_TAlumno_Insertar] @Nombre = 'Juan Perez'
-- =============================================
CREATE OR ALTER PROCEDURE [com].[SP_TAlumno_Insertar]
    @Nombre    VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO [com].[T_Alumno] (
         [Nombre]
        ,[UsuarioCreacion]
        ,[UsuarioModificacion]
        ,[FechaCreacion]
        ,[FechaModificacion]
        ,[Estado]
    )
    VALUES (
         @Nombre
        ,SYSTEM_USER
        ,SYSTEM_USER
        ,GETDATE()
        ,GETDATE()
        ,1
    );

    SELECT SCOPE_IDENTITY() AS Id;
END
\`\`\`
`;
