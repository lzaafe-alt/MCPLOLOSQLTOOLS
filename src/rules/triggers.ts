import type { Rule } from "./general.js";

export const triggerRules: Rule[] = [
  {
    id: "TR-001",
    category: "naming",
    rule: "Triggers must use the prefix TR_ followed by PascalCase table name and action — format: TR_NombreTabla_Accion. No underscores allowed in the table name part.",
    example_bad: "TR_T_Alumno_Actualizar (has underscore in table name), trig_Alumno_Ins",
    example_good: "TR_TAlumno_Actualizar, TR_TOportunidad_Insertar",
    severity: "ERROR",
  },
  {
    id: "TR-002",
    category: "naming",
    rule: "The table name portion of the trigger name must NOT contain underscores (write table name without separator)",
    example_bad: "TR_T_Oportunidad_Detalle_Insertar",
    example_good: "TR_TOportunidadDetalle_Insertar",
    severity: "ERROR",
  },
  {
    id: "TR-003",
    category: "formatting",
    rule: "Trigger code must be properly indented",
    severity: "WARNING",
  },
  {
    id: "TR-004",
    category: "naming",
    rule: "No tildes or ñ in any part of the trigger name",
    example_bad: "TR_TAlumnoInformación_Actualizar",
    example_good: "TR_TAlumnoInformacion_Actualizar",
    severity: "ERROR",
  },
  {
    id: "TR-005",
    category: "documentation",
    rule: "All triggers must have a documentation header with Author, Fecha Creacion, and Descripcion. The -- format is ONLY allowed in the header.",
    example_good:
      "-- =============================================\n-- Author:        \n-- Fecha Creacion: \n-- Descripcion:   \n-- =============================================",
    severity: "ERROR",
  },
  {
    id: "TR-006",
    category: "naming",
    rule: "Use triggers only as a last resort — only when the logic cannot be placed in a SP or application layer",
    severity: "WARNING",
  },
];

export const triggerRulesText = `# BSG SQL Standards — Trigger Rules

## TR-001: Prefix and Format TR_NombreTabla_Accion
Triggers must use TR_ prefix with format: TR_{TableNameNoUnderscores}_{Action}
- BAD:  trig_Alumno_Ins, TR_T_Alumno_Actualizar
- GOOD: TR_TAlumno_Actualizar, TR_TOportunidad_Insertar

## TR-002: No Underscores in Table Name Part
The table name between TR_ and the action must have no underscores.
Write the full table name without separators.
- BAD:  TR_T_Oportunidad_Detalle_Insertar
- GOOD: TR_TOportunidadDetalle_Insertar

## TR-003: Code Indentation
Trigger code must be properly indented.

## TR-004: No Tildes or Ñ
No tildes or ñ anywhere in the trigger name.
- BAD:  TR_TAlumnoInformación_Actualizar
- GOOD: TR_TAlumnoInformacion_Actualizar

## TR-005: Documentation Header
Required in every trigger (-- allowed ONLY in header):
\`\`\`
-- =============================================
-- Author:
-- Fecha Creacion:
-- Descripcion:
-- =============================================
\`\`\`

## TR-006: Last Resort Only
Use triggers only when logic cannot go in SP or application layer.

## Trigger Template
\`\`\`sql
-- =============================================
-- Author:           [Author]
-- Fecha Creacion:   [YYYY-MM-DD]
-- Descripcion:      [What this trigger does and WHY it exists]
-- =============================================
CREATE OR ALTER TRIGGER [schema].[TR_TNombreTabla_Accion]
ON [schema].[T_NombreTabla]
AFTER [INSERT|UPDATE|DELETE]
AS
BEGIN
    SET NOCOUNT ON;

    /* Trigger logic here */

END
\`\`\`
`;
