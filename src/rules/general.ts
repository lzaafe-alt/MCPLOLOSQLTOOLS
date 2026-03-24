export interface Rule {
  id: string;
  category: string;
  rule: string;
  example_bad?: string;
  example_good?: string;
  severity: "ERROR" | "WARNING" | "INFO";
}

export const generalRules: Rule[] = [
  {
    id: "GEN-001",
    category: "documentation",
    rule: "Date format in all documentation must be YYYY-MM-DD",
    example_bad: "03/24/2026 or 24-03-2026",
    example_good: "2026-03-24",
    severity: "WARNING",
  },
  {
    id: "GEN-002",
    category: "naming",
    rule: "All SQL reserved words must be written in UPPERCASE (SELECT, INSERT, UPDATE, DELETE, WHERE, FROM, JOIN, etc.)",
    example_bad: "select * from T_Alumno where Id = 1",
    example_good: "SELECT * FROM T_Alumno WHERE Id = 1",
    severity: "ERROR",
  },
  {
    id: "GEN-003",
    category: "naming",
    rule: "All object names must use PascalCase, be written in Spanish, and must NOT contain tildes (á,é,í,ó,ú) or ñ",
    example_bad: "T_Alumno_Información or T_AlumnoInformacion in camelCase",
    example_good: "T_AlumnoInformacion",
    severity: "ERROR",
  },
  {
    id: "GEN-004",
    category: "naming",
    rule: "No object must belong to the [dbo] schema — every object must use the project or area schema",
    example_bad: "[dbo].[T_Alumno]",
    example_good: "[com].[T_Alumno] or [mkt].[T_Alumno]",
    severity: "ERROR",
  },
  {
    id: "GEN-005",
    category: "formatting",
    rule: "All internal SQL code must be properly indented",
    example_bad: "SELECT Id,Nombre FROM T_Alumno WHERE Estado = 1",
    example_good:
      "SELECT\n     A.Id\n    ,A.Nombre\nFROM [com].[T_Alumno] AS A\nWHERE A.Estado = 1",
    severity: "WARNING",
  },
  {
    id: "GEN-006",
    category: "documentation",
    rule: "Comments inside stored procedures, functions, and triggers must ONLY use /* */ block format — NEVER use -- inline comments inside code blocks",
    example_bad: "-- This calculates the total",
    example_good: "/* This calculates the total */",
    severity: "ERROR",
  },
  {
    id: "GEN-007",
    category: "documentation",
    rule: "No unnecessary comments. Comments must add value and explain WHY, not WHAT the code does",
    example_bad: "/* Selects the Id */ SELECT Id FROM T_Alumno",
    example_good: "/* Only active records are returned per business rule BR-42 */",
    severity: "WARNING",
  },
  {
    id: "GEN-008",
    category: "naming",
    rule: "Objects belonging to a project must start with the project name as a prefix",
    example_bad: "SP_ObtenerAlumno (without project prefix when it belongs to a project)",
    example_good: "SP_PWAlumno_Obtener or SP_CRMAlumno_Obtener",
    severity: "WARNING",
  },
  {
    id: "GEN-009",
    category: "naming",
    rule: "Objects must be placed in the schema that matches their area or module",
    example_bad: "[dbo].[SP_MktCampana_Insertar]",
    example_good: "[mkt].[SP_Campana_Insertar]",
    severity: "ERROR",
  },
  {
    id: "GEN-010",
    category: "performance",
    rule: "CRITICAL: No queries without WHERE clause or TOP N are ever allowed in production code",
    example_bad: "SELECT * FROM T_Alumno",
    example_good: "SELECT TOP 100 A.Id, A.Nombre FROM [com].[T_Alumno] AS A WHERE A.Estado = 1",
    severity: "ERROR",
  },
  {
    id: "GEN-011",
    category: "process",
    rule: "Production deployments are only allowed between 9:00 AM and 6:00 PM",
    severity: "ERROR",
  },
];

export const generalRulesText = `# BSG SQL Standards — General Rules

## GEN-001: Date Format
All dates in documentation must use YYYY-MM-DD format.
- BAD:  03/24/2026
- GOOD: 2026-03-24

## GEN-002: SQL Reserved Words in UPPERCASE
SELECT, INSERT, UPDATE, DELETE, WHERE, FROM, JOIN, etc. must always be uppercase.
- BAD:  select * from T_Alumno where Id = 1
- GOOD: SELECT * FROM T_Alumno WHERE Id = 1

## GEN-003: PascalCase, Spanish, No Tildes/Ñ
Object names must be PascalCase, in Spanish, with no tildes or ñ.
- BAD:  T_Alumno_Información, t_alumno_informacion
- GOOD: T_AlumnoInformacion

## GEN-004: No [dbo] Schema
Every object must belong to a project or area schema, never [dbo].
- BAD:  [dbo].[T_Alumno]
- GOOD: [com].[T_Alumno]

## GEN-005: Code Indentation
All internal SQL code must be properly indented for readability.

## GEN-006: Comments — Block Format Only (Inside Code)
Inside procedures/functions/triggers, use only /* */ — NEVER use -- for code comments.
Exception: -- is allowed ONLY in the documentation header block.
- BAD (inside code):  -- This calculates the total
- GOOD (inside code): /* This calculates the total */

## GEN-007: No Unnecessary Comments
Comments must add value. Do not comment what is obvious from reading the code.

## GEN-008: Project Prefix
Objects belonging to a specific project must start with the project name.
- GOOD: SP_PWAlumno_Obtener (PW = project name)

## GEN-009: Objects in Matching Schema
Place each object in the schema that matches its area.
- BAD:  [dbo].[SP_MktCampana_Insertar]
- GOOD: [mkt].[SP_Campana_Insertar]

## GEN-010: CRITICAL — No Queries Without WHERE or TOP N
This is a hard rule. Never allow unbounded queries in production.
- BAD:  SELECT * FROM T_Alumno
- GOOD: SELECT TOP 100 A.Id FROM [com].[T_Alumno] AS A WHERE A.Estado = 1

## GEN-011: Deployment Window
Production deployments: 9:00 AM to 6:00 PM only.
`;
