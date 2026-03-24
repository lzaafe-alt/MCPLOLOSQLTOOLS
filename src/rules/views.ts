import type { Rule } from "./general.js";

export const viewRules: Rule[] = [
  {
    id: "VW-001",
    category: "naming",
    rule: "Views must use the prefix V_ followed by PascalCase in Spanish with no tildes or ñ",
    example_bad: "Vista_Alumno, v_alumno, VAlumno",
    example_good: "V_AlumnoDetalle, V_OportunidadResumen",
    severity: "ERROR",
  },
  {
    id: "VW-002",
    category: "naming",
    rule: "Single-table views format: V_NombreTabla(SinSeparadores)_TipoInformacionDevuelta — same schema as the source table. This format with two underscores IS valid for single-table views.",
    example_bad: "V_TAlumno_Datos (too generic)",
    example_good: "V_TAlumno_DatosContacto, V_TOportunidad_ResumenEjecutivo",
    severity: "ERROR",
  },
  {
    id: "VW-003",
    category: "naming",
    rule: "Multi-join views must have EXACTLY ONE underscore after V_ prefix — no additional underscores in the name",
    example_bad: "V_TDocumentoPWDuracion_ObtenerRows (has extra underscore), V_Oportunidad_Detalle",
    example_good: "V_OportunidadDetalle, V_AlumnoResumen, V_CampanaResultado",
    severity: "ERROR",
  },
  {
    id: "VW-004",
    category: "documentation",
    rule: "All views must have a documentation header. The -- comment format is ONLY allowed in the header block, never inside the view body.",
    example_good:
      "-- =============================================\n-- Author:        \n-- Fecha Creacion: yyyy-mm-dd\n-- Descripcion:   \n-- =============================================",
    severity: "ERROR",
  },
  {
    id: "VW-005",
    category: "naming",
    rule: "Views with JOINs must NOT have a field named just 'Id' — all Id fields must be aliased with context (IdOportunidad, IdAlumno, etc.)",
    example_bad: "SELECT O.Id, A.Id FROM T_Oportunidad AS O JOIN T_Alumno AS A...",
    example_good: "SELECT O.Id AS IdOportunidad, A.Id AS IdAlumno FROM...",
    severity: "ERROR",
  },
  {
    id: "VW-006",
    category: "aliases",
    rule: "Views with JOINs MUST use table aliases. Alias = first letters of each word in the table name in uppercase (excluding the T_ prefix convention for aliases)",
    example_bad: "FROM T_Oportunidad JOIN T_ActividadDetalle ON ...",
    example_good:
      "FROM T_Oportunidad AS O JOIN T_ActividadDetalle AS AD JOIN T_FaseOportunidad AS FO ON ...",
    severity: "ERROR",
  },
  {
    id: "VW-007",
    category: "aliases",
    rule: "Multiple JOINs to the same table: use underscore differentiator in the alias",
    example_bad: "T_Personal AS P, T_Personal AS P2",
    example_good: "T_Personal AS P_Solicitante, T_Personal AS P_Revision, T_Personal AS P_Solucion",
    severity: "ERROR",
  },
  {
    id: "VW-008",
    category: "naming",
    rule: "Field aliases must accurately represent the data they return — never misleading or generic",
    example_bad: "SELECT O.Nombre AS Dato, O.Id AS Codigo",
    example_good: "SELECT O.Nombre AS NombreOportunidad, O.Id AS IdOportunidad",
    severity: "ERROR",
  },
  {
    id: "VW-009",
    category: "naming",
    rule: "PK/FK field names must NOT change nomenclature — IdAlumno cannot become Id, IdCliente, Alumno, or any other variation",
    example_bad: "SELECT A.Id AS IdCliente, O.IdAlumno AS Alumno",
    example_good: "SELECT A.Id AS IdAlumno, O.IdAlumno AS IdAlumno",
    severity: "ERROR",
  },
  {
    id: "VW-010",
    category: "performance",
    rule: "No hardcoded values in views except for the Estado audit field filter (Estado = 1 is acceptable)",
    example_bad: "WHERE O.TipoId = 3 /* hardcoded tipo */",
    example_good: "WHERE O.Estado = 1",
    severity: "WARNING",
  },
  {
    id: "VW-011",
    category: "naming",
    rule: "Report views go in the schema where they will be consumed, not necessarily the source table schema",
    severity: "INFO",
  },
];

export const viewRulesText = `# BSG SQL Standards — View Rules

## VW-001: Prefix V_
Views must use V_ prefix, PascalCase, Spanish, no tildes/ñ.
- BAD:  Vista_Alumno, v_alumno
- GOOD: V_AlumnoDetalle

## VW-002: Single-Table View Format
Format: V_NombreTabla(SinSeparadores)_TipoInformacionDevuelta
Two underscores IS valid for single-table views (one after V_, one before info type).
Same schema as the source table.
- GOOD: V_TAlumno_DatosContacto, V_TOportunidad_ResumenEjecutivo

## VW-003: Multi-Join View — EXACTLY ONE Underscore After V_
Multi-join views must have only ONE underscore (after V_). No additional underscores.
- BAD:  V_TDocumentoPWDuracion_ObtenerRows (extra underscore = INVALID)
- BAD:  V_Oportunidad_Detalle (has second underscore)
- GOOD: V_OportunidadDetalle, V_AlumnoResumen

## VW-004: Documentation Header (-- allowed ONLY here)
Every view must start with this header (-- is the ONLY place where -- comments are allowed):
\`\`\`sql
-- =============================================
-- Author:
-- Fecha Creacion: yyyy-mm-dd
-- Descripcion:
-- =============================================
\`\`\`

## VW-005: No Bare 'Id' in JOINs
In views with JOINs, every Id field must be aliased with its table context.
- BAD:  SELECT O.Id, A.Id FROM ...
- GOOD: SELECT O.Id AS IdOportunidad, A.Id AS IdAlumno FROM ...

## VW-006: Table Aliases Required in JOINs
Alias = first letter of each word in the table name (uppercase, ignore T_ prefix).
  T_Oportunidad      → O
  T_ActividadDetalle → AD
  T_FaseOportunidad  → FO
- BAD:  FROM T_Oportunidad JOIN T_ActividadDetalle ON ...
- GOOD: FROM T_Oportunidad AS O JOIN T_ActividadDetalle AS AD ON ...

## VW-007: Multiple Joins to Same Table
Use underscore differentiator in alias.
- BAD:  T_Personal AS P, T_Personal AS P2
- GOOD: T_Personal AS P_Solicitante, T_Personal AS P_Revision, T_Personal AS P_Solucion

## VW-008: Meaningful Field Aliases
Field aliases must match the data they represent.
- BAD:  O.Nombre AS Dato
- GOOD: O.Nombre AS NombreOportunidad

## VW-009: PK/FK Names Must Not Change
IdAlumno stays IdAlumno — never alias it to Id, IdCliente, Alumno, etc.

## VW-010: No Hardcoded Values
Avoid hardcoded values except Estado = 1 filter.

## VW-011: Report Views Schema
Place report views in the schema where they will be consumed.
`;
