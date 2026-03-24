import type { Rule } from "./general.js";

export const tableRules: Rule[] = [
  {
    id: "TBL-001",
    category: "naming",
    rule: "Tables must use the prefix T_ followed by a singular PascalCase name in Spanish with no tildes or ñ",
    example_bad: "Alumnos, tbl_alumno, T_alumnos",
    example_good: "T_Alumno, T_OportunidadDetalle",
    severity: "ERROR",
  },
  {
    id: "TBL-002",
    category: "naming",
    rule: "Table names must be in singular form",
    example_bad: "T_Alumnos, T_Oportunidades",
    example_good: "T_Alumno, T_Oportunidad",
    severity: "ERROR",
  },
  {
    id: "TBL-003",
    category: "naming",
    rule: "Relational/differentiator words must go AT THE END of the table name, not the beginning",
    example_bad: "T_SolicitudTipoDescuento, T_TipoAlumno (if Tipo is a differentiator, put it last)",
    example_good: "T_TipoDescuentoSolicitud, T_AlumnoTipo",
    severity: "ERROR",
  },
  {
    id: "TBL-004",
    category: "normalization",
    rule: "All tables must comply with 3rd Normal Form (3NF)",
    severity: "ERROR",
  },
  {
    id: "TBL-005",
    category: "audit_fields",
    rule: "MANDATORY: All tables must include these audit fields: Estado (BIT NOT NULL), UsuarioCreacion (VARCHAR(50) NOT NULL), UsuarioModificacion (VARCHAR(50) NOT NULL), FechaCreacion (DATETIME NOT NULL), FechaModificacion (DATETIME NOT NULL), RowVersion (TIMESTAMP NOT NULL)",
    severity: "ERROR",
  },
  {
    id: "TBL-006",
    category: "audit_fields",
    rule: "OPTIONAL: IdMigracion (UNIQUEIDENTIFIER or INT) — include only when migrating from v3",
    example_good: "/* [IdMigracion] UNIQUEIDENTIFIER NULL */ -- Uncomment if migrated from v3",
    severity: "INFO",
  },
  {
    id: "TBL-007",
    category: "naming",
    rule: "Primary key field must always be named 'Id', typed as INT (or BIGINT if >1M records expected), with IDENTITY(1,1)",
    example_bad: "IdAlumno INT, AlumnoId INT, Codigo INT",
    example_good: "Id INT NOT NULL IDENTITY(1,1)",
    severity: "ERROR",
  },
  {
    id: "TBL-008",
    category: "constraints",
    rule: "Primary Key constraint naming: PK_NombreTabla",
    example_bad: "PK_1, pk_alumno, PRIMARY KEY",
    example_good: "PK_T_Alumno, PK_T_Oportunidad",
    severity: "ERROR",
  },
  {
    id: "TBL-009",
    category: "constraints",
    rule: "Foreign Key constraint naming: FK_NombreTablaActual_NombreTablaReferenciada_NombreCampoFK",
    example_bad: "FK_Alumno, FK_1",
    example_good: "FK_T_Oportunidad_T_Alumno_IdAlumno",
    severity: "ERROR",
  },
  {
    id: "TBL-010",
    category: "constraints",
    rule: "DEFAULT constraint naming: DF_NombreTabla_Campo",
    example_bad: "DF_1, df_fecha",
    example_good: "DF_T_Alumno_FechaCreacion, DF_T_Oportunidad_Estado",
    severity: "ERROR",
  },
  {
    id: "TBL-011",
    category: "constraints",
    rule: "CHECK constraint naming: CHK_NombreTabla_Columna_DescripcionBreve",
    example_bad: "CHK_1, chk_precio",
    example_good: "CHK_T_MontoPago_Precio_MayorACero",
    severity: "ERROR",
  },
  {
    id: "TBL-012",
    category: "constraints",
    rule: "UNIQUE constraint naming: UQ_NombreTabla_Columna",
    example_bad: "UQ_1, uq_email",
    example_good: "UQ_T_Persona_Email",
    severity: "ERROR",
  },
  {
    id: "TBL-013",
    category: "naming",
    rule: "When multiple FK columns reference the same table, use _Diferenciador suffix on the FK field to distinguish them",
    example_bad: "IdOrigen1, IdOrigen2",
    example_good: "IdOrigen_Factura, IdOrigen_Proveedor",
    severity: "ERROR",
  },
  {
    id: "TBL-014",
    category: "naming",
    rule: "No ambiguous field names — avoid generic names like Valor, Dato, Info",
    example_bad: "Valor, Dato, Info, Descripcion (when the context is unclear)",
    example_good: "MontoPago, DatoContacto, InformacionAdicional",
    severity: "WARNING",
  },
  {
    id: "TBL-015",
    category: "naming",
    rule: "No triggers on tables unless absolutely necessary and justified",
    severity: "WARNING",
  },
  {
    id: "TBL-016",
    category: "documentation",
    rule: "All fields must have a description property documenting their purpose. The table itself must have a description documenting what it stores",
    severity: "WARNING",
  },
];

export const tableRulesText = `# BSG SQL Standards — Table Rules

## TBL-001: Prefix T_
Tables must use T_ prefix, singular, PascalCase, Spanish, no tildes/ñ.
- BAD:  Alumnos, tbl_alumno, T_alumnos
- GOOD: T_Alumno, T_OportunidadDetalle

## TBL-002: Singular Form
Table names must always be singular.
- BAD:  T_Alumnos, T_Oportunidades
- GOOD: T_Alumno, T_Oportunidad

## TBL-003: Differentiator Words at End
Relational/differentiator words must go at the END of the name.
- BAD:  T_SolicitudTipoDescuento
- GOOD: T_TipoDescuentoSolicitud

## TBL-004: 3rd Normal Form
All tables must comply with 3NF.

## TBL-005: MANDATORY Audit Fields (ALL tables)
Every table MUST include these 6 fields at the end:
  [Estado]               BIT             NOT NULL    DEFAULT(1)
  [UsuarioCreacion]      VARCHAR(50)     NOT NULL
  [UsuarioModificacion]  VARCHAR(50)     NOT NULL
  [FechaCreacion]        DATETIME        NOT NULL    DEFAULT(GETDATE())
  [FechaModificacion]    DATETIME        NOT NULL    DEFAULT(GETDATE())
  [RowVersion]           TIMESTAMP       NOT NULL

## TBL-006: Optional IdMigracion
Include only when migrating from v3:
  -- [IdMigracion] UNIQUEIDENTIFIER NULL  -- Uncomment if migrated from v3

## TBL-007: Primary Key Field = Id
PK field name is always 'Id', INT IDENTITY(1,1). Use BIGINT if >1M records expected.
- BAD:  IdAlumno INT, Codigo INT
- GOOD: Id INT NOT NULL IDENTITY(1,1)

## TBL-008: Constraint PK Naming
Format: PK_NombreTabla
- GOOD: PK_T_Alumno, CONSTRAINT PK_T_Oportunidad PRIMARY KEY (Id)

## TBL-009: Constraint FK Naming
Format: FK_NombreTablaActual_NombreTablaReferenciada_NombreCampoFK
- GOOD: FK_T_Oportunidad_T_Alumno_IdAlumno

## TBL-010: Constraint DEFAULT Naming
Format: DF_NombreTabla_Campo
- GOOD: DF_T_Alumno_FechaCreacion, DF_T_Oportunidad_Estado

## TBL-011: Constraint CHECK Naming
Format: CHK_NombreTabla_Columna_DescripcionBreve
- GOOD: CHK_T_MontoPago_Precio_MayorACero

## TBL-012: Constraint UNIQUE Naming
Format: UQ_NombreTabla_Columna
- GOOD: UQ_T_Persona_Email

## TBL-013: FK Differentiator Suffix
Multiple FKs to same table: use _Diferenciador suffix.
- BAD:  IdOrigen1, IdOrigen2
- GOOD: IdOrigen_Factura, IdOrigen_Proveedor

## TBL-014: No Ambiguous Field Names
Avoid: Valor, Dato, Info as standalone generic names.

## TBL-015: Triggers — Last Resort
No triggers unless absolutely necessary and documented.

## TBL-016: Documentation
Every field and the table itself must have a documented description.

## Audit Fields Template
\`\`\`sql
[Estado]                BIT             NOT NULL    CONSTRAINT DF_T_{Name}_Estado DEFAULT(1),
[UsuarioCreacion]       VARCHAR(50)     NOT NULL,
[UsuarioModificacion]   VARCHAR(50)     NOT NULL,
[FechaCreacion]         DATETIME        NOT NULL    CONSTRAINT DF_T_{Name}_FechaCreacion DEFAULT(GETDATE()),
[FechaModificacion]     DATETIME        NOT NULL    CONSTRAINT DF_T_{Name}_FechaModificacion DEFAULT(GETDATE()),
[RowVersion]            TIMESTAMP       NOT NULL,
-- [IdMigracion]        UNIQUEIDENTIFIER NULL,      -- Descomentar si migrado desde v3
\`\`\`
`;
