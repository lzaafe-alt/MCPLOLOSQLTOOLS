import {
  generalRulesText,
  tableRulesText,
  viewRulesText,
  procedureRulesText,
  functionRulesText,
  triggerRulesText,
} from "../rules/index.js";

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCES: ResourceDefinition[] = [
  {
    uri: "bsg://rules/general",
    name: "BSG General Rules",
    description: "General SQL standardization rules applicable to all objects",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://rules/tables",
    name: "BSG Table Rules",
    description: "Rules for creating and naming SQL tables",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://rules/views",
    name: "BSG View Rules",
    description: "Rules for creating and naming SQL views",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://rules/procedures",
    name: "BSG Stored Procedure Rules",
    description: "Rules for creating and naming stored procedures",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://rules/functions",
    name: "BSG Function Rules",
    description: "Rules for creating and naming SQL functions",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://rules/triggers",
    name: "BSG Trigger Rules",
    description: "Rules for creating and naming SQL triggers",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://examples/table",
    name: "Table Example",
    description: "Complete example of a BSG-compliant SQL table",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://examples/view",
    name: "View Example",
    description: "Complete example of a BSG-compliant SQL view",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://examples/procedure",
    name: "Stored Procedure Example",
    description: "Complete example of a BSG-compliant stored procedure",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://examples/function",
    name: "Function Example",
    description: "Complete example of a BSG-compliant SQL function",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://constraints/naming",
    name: "Constraint Naming Rules",
    description: "All constraint naming conventions (PK, FK, DF, CHK, UQ)",
    mimeType: "text/plain",
  },
  {
    uri: "bsg://constraints/audit-fields",
    name: "Audit Fields Reference",
    description: "Mandatory audit fields for all tables",
    mimeType: "text/plain",
  },
];

const TABLE_EXAMPLE = `-- =============================================
-- Tabla:       [com].[T_Alumno]
-- Author:      Juan Perez
-- Fecha:       2026-03-24
-- Descripcion: Almacena la información de los alumnos del sistema
-- =============================================
CREATE TABLE [com].[T_Alumno] (
    [Id]                    INT             NOT NULL    IDENTITY(1,1),
    /* Campos específicos */
    [Nombre]                VARCHAR(100)    NOT NULL,
    [Apellido]              VARCHAR(100)    NOT NULL,
    [Email]                 VARCHAR(255)    NOT NULL,
    [IdTipoAlumno]          INT             NOT NULL,
    /* Campos de auditoría (obligatorios) */
    [Estado]                BIT             NOT NULL    CONSTRAINT DF_T_Alumno_Estado DEFAULT(1),
    [UsuarioCreacion]       VARCHAR(50)     NOT NULL,
    [UsuarioModificacion]   VARCHAR(50)     NOT NULL,
    [FechaCreacion]         DATETIME        NOT NULL    CONSTRAINT DF_T_Alumno_FechaCreacion DEFAULT(GETDATE()),
    [FechaModificacion]     DATETIME        NOT NULL    CONSTRAINT DF_T_Alumno_FechaModificacion DEFAULT(GETDATE()),
    [RowVersion]            TIMESTAMP       NOT NULL,
    -- [IdMigracion]        UNIQUEIDENTIFIER NULL,      -- Descomentar si migrado desde v3
    CONSTRAINT PK_T_Alumno PRIMARY KEY (Id),
    CONSTRAINT FK_T_Alumno_T_TipoAlumno_IdTipoAlumno
        FOREIGN KEY (IdTipoAlumno) REFERENCES [com].[T_TipoAlumno] (Id),
    CONSTRAINT UQ_T_Alumno_Email UNIQUE (Email)
);
`;

const VIEW_EXAMPLE = `-- =============================================
-- Author:        Juan Perez
-- Fecha Creacion: 2026-03-24
-- Descripcion:   Devuelve las oportunidades con su fase y alumno asignado
-- =============================================
CREATE OR ALTER VIEW [com].[V_OportunidadDetalle]
AS
SELECT
     O.Id       AS IdOportunidad
    ,O.Nombre   AS NombreOportunidad
    ,O.Monto    AS MontoOportunidad
    ,FO.Id      AS IdFaseOportunidad
    ,FO.Nombre  AS NombreFase
    ,A.Id       AS IdAlumno
    ,A.Nombre   AS NombreAlumno
    ,A.Email    AS EmailAlumno
    ,O.Estado
FROM [com].[T_Oportunidad]          AS O
JOIN [com].[T_FaseOportunidad]      AS FO  ON FO.Id = O.IdFaseOportunidad
                                          AND FO.Estado = 1
JOIN [com].[T_Alumno]               AS A   ON A.Id = O.IdAlumno
                                          AND A.Estado = 1
WHERE O.Estado = 1;
`;

const PROCEDURE_EXAMPLE = `-- =============================================
-- Author:           Juan Perez
-- Fecha Creacion:   2026-03-24
-- Descripcion:      Inserta un nuevo registro en T_Alumno
-- Parametros entrada:
--     @Nombre         VARCHAR(100)    - Nombre del alumno
--     @Apellido       VARCHAR(100)    - Apellido del alumno
--     @Email          VARCHAR(255)    - Email del alumno
--     @IdTipoAlumno   INT             - Id del tipo de alumno
-- Excepciones:      Lanza error si el email ya existe (UQ_T_Alumno_Email)
-- Retorna:          Id del registro creado
-- Version:          1.0.0
-- Ejemplo Validacion:
--     EXEC [com].[SP_TAlumno_Insertar]
--         @Nombre       = 'Juan',
--         @Apellido     = 'Perez',
--         @Email        = 'juan@ejemplo.com',
--         @IdTipoAlumno = 1
-- =============================================
CREATE OR ALTER PROCEDURE [com].[SP_TAlumno_Insertar]
     @Nombre         VARCHAR(100)
    ,@Apellido       VARCHAR(100)
    ,@Email          VARCHAR(255)
    ,@IdTipoAlumno   INT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO [com].[T_Alumno] (
         [Nombre]
        ,[Apellido]
        ,[Email]
        ,[IdTipoAlumno]
        ,[UsuarioCreacion]
        ,[UsuarioModificacion]
        ,[FechaCreacion]
        ,[FechaModificacion]
        ,[Estado]
    )
    VALUES (
         @Nombre
        ,@Apellido
        ,@Email
        ,@IdTipoAlumno
        ,SYSTEM_USER
        ,SYSTEM_USER
        ,GETDATE()
        ,GETDATE()
        ,1
    );

    SELECT SCOPE_IDENTITY() AS Id;

END
`;

const FUNCTION_EXAMPLE = `-- =============================================
-- Author:           Juan Perez
-- Fecha Creacion:   2026-03-24
-- Descripcion:      Obtiene el nombre completo de un alumno dado su Id
-- Parametros:
--     @IdAlumno    INT    - Id del alumno a consultar
-- =============================================
CREATE OR ALTER FUNCTION [com].[F_ObtenerNombreCompletoAlumno]
(
    @IdAlumno INT
)
RETURNS VARCHAR(255)
AS
BEGIN
    DECLARE @NombreCompleto VARCHAR(255);

    SELECT @NombreCompleto = A.Nombre + ' ' + A.Apellido
    FROM [com].[T_Alumno] AS A
    WHERE A.Id = @IdAlumno
      AND A.Estado = 1;

    RETURN @NombreCompleto;
END
`;

const CONSTRAINT_NAMING = `# BSG SQL Standards — Constraint Naming Reference

## Primary Key (PK)
Format:  PK_{TableName}
Example: PK_T_Alumno
         PK_T_Oportunidad

## Foreign Key (FK)
Format:  FK_{CurrentTable}_{ReferencedTable}_{FieldName}
Example: FK_T_Oportunidad_T_Alumno_IdAlumno
         FK_T_Detalle_T_TipoDescuento_IdTipoDescuento

## Default (DF)
Format:  DF_{TableName}_{FieldName}
Example: DF_T_Alumno_FechaCreacion
         DF_T_Oportunidad_Estado

## Check (CHK)
Format:  CHK_{TableName}_{Column}_{ShortDescription}
Example: CHK_T_MontoPago_Precio_MayorACero
         CHK_T_Alumno_Email_FormatoValido

## Unique (UQ)
Format:  UQ_{TableName}_{Column}
Example: UQ_T_Persona_Email
         UQ_T_Alumno_DocumentoIdentidad

## FK with Differentiator (multiple FKs to same table)
When a table has two FK fields referencing the same table,
add a differentiator suffix to the FIELD name and the FK constraint.
Example field names: IdOrigen_Factura, IdOrigen_Proveedor
Example constraints: FK_T_Pago_T_Documento_IdOrigen_Factura
                     FK_T_Pago_T_Documento_IdOrigen_Proveedor
`;

const AUDIT_FIELDS = `# BSG SQL Standards — Mandatory Audit Fields

Every table MUST include these 6 fields, placed at the END of the field list:

| Field               | Type            | Nullable | Default     | Notes                    |
|---------------------|-----------------|----------|-------------|--------------------------|
| Estado              | BIT             | NOT NULL | 1           | Logical active/inactive  |
| UsuarioCreacion     | VARCHAR(50)     | NOT NULL | —           | User who created record  |
| UsuarioModificacion | VARCHAR(50)     | NOT NULL | —           | User who last modified   |
| FechaCreacion       | DATETIME        | NOT NULL | GETDATE()   | Record creation time     |
| FechaModificacion   | DATETIME        | NOT NULL | GETDATE()   | Last modification time   |
| RowVersion          | TIMESTAMP       | NOT NULL | (automatic) | Concurrency control      |

## Optional (migration only)
| Field        | Type                        | Nullable | Notes                  |
|--------------|-----------------------------|----------|------------------------|
| IdMigracion  | UNIQUEIDENTIFIER or INT     | NULL     | Only for v3 migration  |

## SQL Template
\`\`\`sql
    [Estado]                BIT             NOT NULL    CONSTRAINT DF_T_{Name}_Estado DEFAULT(1),
    [UsuarioCreacion]       VARCHAR(50)     NOT NULL,
    [UsuarioModificacion]   VARCHAR(50)     NOT NULL,
    [FechaCreacion]         DATETIME        NOT NULL    CONSTRAINT DF_T_{Name}_FechaCreacion DEFAULT(GETDATE()),
    [FechaModificacion]     DATETIME        NOT NULL    CONSTRAINT DF_T_{Name}_FechaModificacion DEFAULT(GETDATE()),
    [RowVersion]            TIMESTAMP       NOT NULL,
    -- [IdMigracion]        UNIQUEIDENTIFIER NULL,      -- Descomentar si migrado desde v3
\`\`\`

## Important Notes
- Estado = 1 means ACTIVE; Estado = 0 means LOGICALLY DELETED
- UsuarioCreacion/Modificacion are populated with SYSTEM_USER in SPs
- Never physically DELETE records — set Estado = 0
- RowVersion is managed automatically by SQL Server
- FechaCreacion should never be updated after insert
`;

const RESOURCE_CONTENT: Record<string, string> = {
  "bsg://rules/general": generalRulesText,
  "bsg://rules/tables": tableRulesText,
  "bsg://rules/views": viewRulesText,
  "bsg://rules/procedures": procedureRulesText,
  "bsg://rules/functions": functionRulesText,
  "bsg://rules/triggers": triggerRulesText,
  "bsg://examples/table": TABLE_EXAMPLE,
  "bsg://examples/view": VIEW_EXAMPLE,
  "bsg://examples/procedure": PROCEDURE_EXAMPLE,
  "bsg://examples/function": FUNCTION_EXAMPLE,
  "bsg://constraints/naming": CONSTRAINT_NAMING,
  "bsg://constraints/audit-fields": AUDIT_FIELDS,
};

export function getResourceContent(uri: string): string | undefined {
  return RESOURCE_CONTENT[uri];
}
