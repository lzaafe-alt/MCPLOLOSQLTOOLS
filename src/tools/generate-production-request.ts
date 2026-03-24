import { z } from "zod";

export const GenerateProductionRequestSchema = z.object({
  solicitante: z.string(),
  requirement_id: z.string(),
  requirement_description: z.string(),
  db_origin: z.string().default("integraDBData"),
  db_destination: z.string().default("integraDB"),
  change_description: z.string(),
  scheduled_date: z.string().optional(),
  time_window: z.string().optional(),
  script_filename: z.string().optional(),
  validations: z.array(z.string()).min(1),
});

export type GenerateProductionRequestInput = z.infer<typeof GenerateProductionRequestSchema>;

interface GenerateProductionRequestResult {
  email: string;
  warnings: string[];
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseHour(timeStr: string): number | null {
  const match = timeStr.match(/(\d{1,2}):\d{2}/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

export function generateProductionRequest(
  input: GenerateProductionRequestInput
): GenerateProductionRequestResult {
  const warnings: string[] = [];

  // Validate scheduled_date format
  if (input.scheduled_date) {
    if (!DATE_REGEX.test(input.scheduled_date)) {
      warnings.push("El formato de fecha debe ser YYYY-MM-DD.");
    } else {
      // Check weekend
      const date = new Date(input.scheduled_date + "T12:00:00");
      const day = date.getDay();
      if (day === 0 || day === 6) {
        warnings.push(
          "La fecha programada cae en fin de semana. Verificar disponibilidad del equipo BD."
        );
      }
    }
  }

  // Validate time_window outside 9:00-18:00
  if (input.time_window) {
    const startHour = parseHour(input.time_window);
    if (startHour !== null && (startHour < 9 || startHour >= 18)) {
      warnings.push(
        "La ventana horaria está fuera del horario oficial BSG (9:00 - 18:00 hrs)."
      );
    }
    // Also check end time
    const endMatch = input.time_window.match(/-\s*(\d{1,2}):\d{2}/);
    if (endMatch) {
      const endHour = parseInt(endMatch[1], 10);
      if (endHour > 18) {
        warnings.push(
          "La ventana horaria está fuera del horario oficial BSG (9:00 - 18:00 hrs)."
        );
      }
    }
  }

  // Deduplicate the time_window warning if added twice
  const uniqueWarnings = [...new Set(warnings)];

  // Check dbo. in change_description
  if (input.change_description.includes("dbo.")) {
    uniqueWarnings.push(
      "La descripción menciona el schema [dbo]. Verificar que el objeto use el schema correcto."
    );
  }

  const scheduledDateLine =
    input.scheduled_date && DATE_REGEX.test(input.scheduled_date)
      ? input.scheduled_date
      : "A coordinar";

  const timeWindowLine = input.time_window ?? "9:00 - 18:00 hrs (horario BSG)";

  const scriptLine = input.script_filename
    ? `\nArchivo Script para Ejecución en Producción: ${input.script_filename}\n`
    : "";

  const validationsList = input.validations.map((v) => `- ${v}`).join("\n");

  const email = `Asunto: Solicitud de Pase a Producción - Requerimiento ${input.requirement_id}

Para: gquispe@bsginstitute.com;ddelcarpio@bsginstitute.com
CC: ccrispin@bsginstitute.com; (supervisordirecto@bsginstitute.com)

Mensaje:
Equipo BD,

Solicito el pase a producción de los siguientes cambios DDL:

Base de Datos Origen (desc): ${input.db_origin}
Base de Datos Destino (prod): ${input.db_destination}
Fecha Programada (opcional): ${scheduledDateLine}
Ventana Horaria (opcional): ${timeWindowLine}
Solicitante: ${input.solicitante}
Requerimiento Asociado: ${input.requirement_id} - ${input.requirement_description}

Descripción del Cambio:
${input.change_description}
${scriptLine}
Validaciones Realizadas en DEV:
${validationsList}

Quedo atento a la confirmación y programación de esta solicitud.`;

  return {
    email,
    warnings: uniqueWarnings,
  };
}
