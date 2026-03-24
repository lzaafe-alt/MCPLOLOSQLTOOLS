import { z } from "zod";

export const GenerateAccessRequestSchema = z.object({
  solicitante: z.string(),
  project_area: z.enum([
    "IA",
    "Integra-PLA",
    "Integra-COM",
    "Integra-GP",
    "Simuladores",
    "Aula Virtual",
    "Otros",
  ]),
  database: z.string().default("integraDB"),
  justification: z.string(),
  objects: z
    .array(
      z.object({
        type: z.enum(["TABLE", "VIEW", "SP", "FUNCTION"]),
        name: z.string(),
        permissions: z
          .array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "EXECUTE"]))
          .min(1),
      })
    )
    .min(1),
});

export type GenerateAccessRequestInput = z.infer<typeof GenerateAccessRequestSchema>;

interface AccessObject {
  type: "TABLE" | "VIEW" | "SP" | "FUNCTION";
  name: string;
  permissions: Array<"SELECT" | "INSERT" | "UPDATE" | "DELETE" | "EXECUTE">;
}

interface GenerateAccessRequestResult {
  email: string;
  warnings: string[];
}

const TYPE_LABELS: Record<string, string> = {
  TABLE: "Tablas",
  VIEW: "Vistas",
  SP: "Procedimientos Almacenados",
  FUNCTION: "Funciones",
};

const TYPE_ORDER: Array<"TABLE" | "VIEW" | "SP" | "FUNCTION"> = [
  "TABLE",
  "VIEW",
  "SP",
  "FUNCTION",
];

export function generateAccessRequest(
  input: GenerateAccessRequestInput
): GenerateAccessRequestResult {
  const warnings: string[] = [];

  // Check DELETE permission
  for (const obj of input.objects) {
    if (obj.permissions.includes("DELETE")) {
      warnings.push(
        "Se está solicitando permiso DELETE. Asegurarse de que sea estrictamente necesario."
      );
      break;
    }
  }

  // Check short justification
  if (input.justification.length < 20) {
    warnings.push(
      "La justificación técnica es muy breve. BSG requiere una descripción técnica adecuada."
    );
  }

  // Check schema prefix
  for (const obj of input.objects) {
    if (!obj.name.includes(".")) {
      warnings.push(
        `El objeto '${obj.name}' no especifica schema. Se recomienda incluir schema (ej: com.T_Alumno).`
      );
    }
  }

  // Check "Otros" project area
  if (input.project_area === "Otros") {
    warnings.push(
      "Proyecto/Área marcado como 'Otros'. Verificar si corresponde a un área específica."
    );
  }

  // Check EXECUTE on TABLE or VIEW
  for (const obj of input.objects) {
    if (
      (obj.type === "TABLE" || obj.type === "VIEW") &&
      obj.permissions.includes("EXECUTE")
    ) {
      warnings.push(
        `EXECUTE no aplica para ${obj.type}. Solo aplica para SP y FUNCTION.`
      );
    }
  }

  // Group objects by type
  const grouped: Record<string, AccessObject[]> = {};
  for (const obj of input.objects) {
    if (!grouped[obj.type]) grouped[obj.type] = [];
    grouped[obj.type].push(obj as AccessObject);
  }

  // Build detail section in fixed order
  const detailSections: string[] = [];
  for (const type of TYPE_ORDER) {
    if (!grouped[type] || grouped[type].length === 0) continue;
    const label = TYPE_LABELS[type];
    const lines: string[] = [`${label}:`];
    for (const obj of grouped[type]) {
      lines.push(`  - ${obj.name}`);
      lines.push(`    Permisos: ${obj.permissions.join(", ")}`);
    }
    detailSections.push(lines.join("\n"));
  }

  const detailBlock = detailSections.join("\n\n");

  const email = `Asunto: Solicitud de Acceso a Base de Datos - ${input.project_area} - ${input.solicitante}

Para: gquispe@bsginstitute.com;ddelcarpio@bsginstitute.com
CC: ccrispin@bsginstitute.com

Mensaje:
Equipo BD,

Solicito los siguientes accesos a base de datos:

Nombre del Solicitante: ${input.solicitante}
Proyecto/Área: ${input.project_area}
Base de Datos: ${input.database}
Justificación Técnica: ${input.justification}

Detalle de Accesos Requeridos:

${detailBlock}

Nota: Esta solicitud cumple con los requisitos de especificación de objetos
concretos y justificación técnica según la política de accesos BSG.

Quedo atento a la confirmación.`;

  return {
    email,
    warnings,
  };
}
