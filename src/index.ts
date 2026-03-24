import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  ValidateObjectNameSchema,
  validateObjectName,
} from "./tools/validate-object-name.js";
import { GenerateTemplateSchema, generateTemplate } from "./tools/generate-template.js";
import { GetRulesSchema, getRules } from "./tools/get-rules.js";
import { ValidateSqlObjectSchema, validateSqlObject } from "./tools/validate-sql-object.js";
import { CheckAuditFieldsSchema, checkAuditFields } from "./tools/check-audit-fields.js";
import { SuggestAliasSchema, suggestAlias } from "./tools/suggest-alias.js";
import { FormatSqlSchema, formatSql } from "./tools/format-sql.js";
import {
  CheckPerformancePatternsSchema,
  checkPerformancePatterns,
} from "./tools/check-performance-patterns.js";
import {
  GenerateProductionRequestSchema,
  generateProductionRequest,
} from "./tools/generate-production-request.js";
import {
  GenerateAccessRequestSchema,
  generateAccessRequest,
} from "./tools/generate-access-request.js";
import { RESOURCES, getResourceContent } from "./resources/index.js";

const server = new Server(
  { name: "lolosqltools", version: "1.0.0" },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/* ─────────────────────────────────────────────
   LIST TOOLS
───────────────────────────────────────────── */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "validate_object_name",
        description:
          "Validates a SQL object name against BSG Institute naming standards. Returns a list of violations with rule references and suggestions.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The SQL object name to validate",
            },
            object_type: {
              type: "string",
              enum: [
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
              ],
              description: "Type of SQL object being validated",
            },
            context: {
              type: "string",
              description:
                "Optional context: parent table name for constraint validation (e.g., 'T_Alumno')",
            },
          },
          required: ["name", "object_type"],
        },
      },
      {
        name: "generate_template",
        description:
          "Generates a complete, BSG-compliant SQL template for a given object type. Includes all mandatory fields, documentation headers, and constraint naming.",
        inputSchema: {
          type: "object",
          properties: {
            object_type: {
              type: "string",
              enum: ["TABLE", "VIEW", "SP", "FUNCTION", "TRIGGER"],
              description: "Type of SQL object to generate",
            },
            name: {
              type: "string",
              description:
                "Base name WITHOUT prefix (e.g., 'Alumno' → T_Alumno, SP_TAlumno_Insertar)",
            },
            schema: {
              type: "string",
              description: "SQL schema name (e.g., 'com', 'mkt', 'rrhh')",
            },
            author: {
              type: "string",
              description: "Author name for documentation header",
            },
            description: {
              type: "string",
              description: "Description for documentation header",
            },
            fields: {
              type: "array",
              description: "For TABLE: field definitions (audit fields are auto-appended)",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
                  nullable: { type: "boolean" },
                  description: { type: "string" },
                },
                required: ["name", "type", "nullable", "description"],
              },
            },
            parameters: {
              type: "array",
              description: "For SP/FUNCTION: parameter definitions",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
                  description: { type: "string" },
                },
                required: ["name", "type", "description"],
              },
            },
            action: {
              type: "string",
              enum: ["Insertar", "Actualizar", "Eliminar", "Obtener"],
              description: "For SP: the DML action",
            },
            returns: {
              type: "string",
              description: "For SP/FUNCTION: what the object returns",
            },
            trigger_action: {
              type: "string",
              enum: [
                "INSERT",
                "UPDATE",
                "DELETE",
                "INSERT, UPDATE",
                "INSERT, DELETE",
                "UPDATE, DELETE",
                "INSERT, UPDATE, DELETE",
              ],
              description: "For TRIGGER: which DML actions fire the trigger",
            },
            table_name: {
              type: "string",
              description: "For TRIGGER: the table name the trigger belongs to",
            },
          },
          required: ["object_type", "name", "schema", "author", "description"],
        },
      },
      {
        name: "get_rules",
        description:
          "Retrieves BSG SQL standardization rules, optionally filtered by object type and/or topic.",
        inputSchema: {
          type: "object",
          properties: {
            object_type: {
              type: "string",
              enum: ["TABLE", "VIEW", "SP", "FUNCTION", "TRIGGER", "GENERAL"],
              description: "Filter rules by SQL object type",
            },
            topic: {
              type: "string",
              enum: [
                "naming",
                "audit_fields",
                "documentation",
                "aliases",
                "constraints",
                "performance",
                "process",
                "all",
              ],
              description: "Filter rules by topic category",
            },
          },
          required: [],
        },
      },
      {
        name: "validate_sql_object",
        description:
          "Performs full structural validation of a SQL block (CREATE TABLE, VIEW, SP, FUNCTION, TRIGGER) against BSG standards. Returns a compliance score (0-100) and a list of violations with severity and suggestions.",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "The full SQL block to validate",
            },
            object_type: {
              type: "string",
              enum: ["TABLE", "VIEW", "SP", "FUNCTION", "TRIGGER"],
              description: "Type of SQL object being validated",
            },
            schema: {
              type: "string",
              description: "Expected schema (e.g., 'com', 'mkt') — optional. If provided, verifies the object uses this schema.",
            },
          },
          required: ["sql", "object_type"],
        },
      },
      {
        name: "check_audit_fields",
        description:
          "Validates that a CREATE TABLE statement includes all mandatory BSG audit fields (Estado, UsuarioCreacion, UsuarioModificacion, FechaCreacion, FechaModificacion, RowVersion) with correct types and a properly named PRIMARY KEY.",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "The CREATE TABLE SQL statement to check",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "suggest_alias",
        description:
          "Generates a BSG-standard table alias from a SQL object name. The alias is built from the first letter of each PascalCase word after stripping the prefix. Detects conflicts with existing aliases and suggests alternatives.",
        inputSchema: {
          type: "object",
          properties: {
            table_name: {
              type: "string",
              description: "The SQL object name (e.g., 'T_FaseOportunidad', 'T_ActividadDetalle')",
            },
            existing_aliases: {
              type: "array",
              items: { type: "string" },
              description: "Already-used aliases in the query context (to detect conflicts)",
            },
          },
          required: ["table_name"],
        },
      },
      {
        name: "format_sql",
        description:
          "Applies BSG-standard formatting to SQL: uppercases keywords, reformats SELECT columns to leading-comma style, normalizes clause indentation (FROM/WHERE/JOIN), separates AND/OR conditions to their own lines, normalizes BEGIN...END indentation to 4 spaces, and removes inline -- comments from the code body.",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "The SQL text to format",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "check_performance_patterns",
        description:
          "Detects SQL anti-patterns and performance bad practices against BSG standards. Returns categorized violations sorted by severity (CRITICAL > HIGH > MEDIUM > LOW).",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "The SQL text to analyze for performance anti-patterns",
            },
            context: {
              type: "string",
              enum: ["QUERY", "VIEW", "SP", "ALL"],
              default: "ALL",
              description: "Context filter: run only patterns applicable to this object type. ALL runs every pattern.",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "generate_production_request",
        description:
          "Generates a formatted production deployment request email following BSG's mandatory format. Includes automatic warnings for schedule issues, schema problems, and BSG policy compliance.",
        inputSchema: {
          type: "object",
          properties: {
            solicitante: {
              type: "string",
              description: "Name of the person making the request",
            },
            requirement_id: {
              type: "string",
              description: "Requirement identifier (e.g. 'OP-1234')",
            },
            requirement_description: {
              type: "string",
              description: "Brief description of the requirement",
            },
            db_origin: {
              type: "string",
              description: "Source database name",
              default: "integraDBData",
            },
            db_destination: {
              type: "string",
              description: "Target database name",
              default: "integraDB",
            },
            change_description: {
              type: "string",
              description: "Brief and direct description of the DDL change",
            },
            scheduled_date: {
              type: "string",
              description: "Scheduled deployment date in YYYY-MM-DD format (optional)",
            },
            time_window: {
              type: "string",
              description: "Time window for deployment e.g. '18:00 - 20:00 hrs' (optional)",
            },
            script_filename: {
              type: "string",
              description: "Attached script filename (optional)",
            },
            validations: {
              type: "array",
              items: { type: "string" },
              description: "List of validations performed in DEV environment",
              minItems: 1,
            },
          },
          required: [
            "solicitante",
            "requirement_id",
            "requirement_description",
            "change_description",
            "validations",
          ],
        },
      },
      {
        name: "generate_access_request",
        description:
          "Generates a formatted database access request email following BSG's mandatory format. Groups objects by type, validates permissions, and checks compliance with BSG access policy.",
        inputSchema: {
          type: "object",
          properties: {
            solicitante: {
              type: "string",
              description: "Name of the person requesting access",
            },
            project_area: {
              type: "string",
              enum: [
                "IA",
                "Integra-PLA",
                "Integra-COM",
                "Integra-GP",
                "Simuladores",
                "Aula Virtual",
                "Otros",
              ],
              description: "Project or area associated with the access request",
            },
            database: {
              type: "string",
              description: "Target database name",
              default: "integraDB",
            },
            justification: {
              type: "string",
              description: "Technical justification for the access request",
            },
            objects: {
              type: "array",
              description: "List of database objects requiring access",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["TABLE", "VIEW", "SP", "FUNCTION"],
                    description: "Type of database object",
                  },
                  name: {
                    type: "string",
                    description: "Full object name including schema (e.g. 'com.T_Alumno')",
                  },
                  permissions: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["SELECT", "INSERT", "UPDATE", "DELETE", "EXECUTE"],
                    },
                    description: "Permissions requested for this object",
                    minItems: 1,
                  },
                },
                required: ["type", "name", "permissions"],
              },
            },
          },
          required: ["solicitante", "project_area", "justification", "objects"],
        },
      },
    ],
  };
});

/* ─────────────────────────────────────────────
   CALL TOOL
───────────────────────────────────────────── */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "validate_object_name": {
        const parsed = ValidateObjectNameSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = validateObjectName(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "generate_template": {
        const parsed = GenerateTemplateSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = generateTemplate(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_rules": {
        const parsed = GetRulesSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = getRules(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "validate_sql_object": {
        const parsed = ValidateSqlObjectSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = validateSqlObject(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "check_audit_fields": {
        const parsed = CheckAuditFieldsSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = checkAuditFields(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "suggest_alias": {
        const parsed = SuggestAliasSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = suggestAlias(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "format_sql": {
        const parsed = FormatSqlSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = formatSql(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "check_performance_patterns": {
        const parsed = CheckPerformancePatternsSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = checkPerformancePatterns(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "generate_production_request": {
        const parsed = GenerateProductionRequestSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = generateProductionRequest(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "generate_access_request": {
        const parsed = GenerateAccessRequestSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid input: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
              },
            ],
          };
        }
        const result = generateAccessRequest(parsed.data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool '${name}': ${message}`,
        },
      ],
      isError: true,
    };
  }
});

/* ─────────────────────────────────────────────
   LIST RESOURCES
───────────────────────────────────────────── */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: RESOURCES.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  };
});

/* ─────────────────────────────────────────────
   READ RESOURCE
───────────────────────────────────────────── */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const content = getResourceContent(uri);

  if (!content) {
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: `Resource not found: ${uri}`,
        },
      ],
    };
  }

  return {
    contents: [
      {
        uri,
        mimeType: "text/plain",
        text: content,
      },
    ],
  };
});

/* ─────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────── */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BSG SQL Standards MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
