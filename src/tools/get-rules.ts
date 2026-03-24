import { z } from "zod";
import {
  generalRules,
  tableRules,
  viewRules,
  procedureRules,
  functionRules,
  triggerRules,
  type Rule,
} from "../rules/index.js";

export const GetRulesSchema = z.object({
  object_type: z
    .enum(["TABLE", "VIEW", "SP", "FUNCTION", "TRIGGER", "GENERAL"])
    .optional(),
  topic: z
    .enum([
      "naming",
      "audit_fields",
      "documentation",
      "aliases",
      "constraints",
      "performance",
      "process",
      "all",
    ])
    .optional(),
});

export type GetRulesInput = z.infer<typeof GetRulesSchema>;

interface RulesResult {
  title: string;
  rules: Rule[];
}

const ALL_RULES: Record<string, Rule[]> = {
  GENERAL: generalRules,
  TABLE: tableRules,
  VIEW: viewRules,
  SP: procedureRules,
  FUNCTION: functionRules,
  TRIGGER: triggerRules,
};

export function getRules(input: GetRulesInput): RulesResult {
  const { object_type, topic } = input;

  let candidateRules: Rule[] = [];
  let titleParts: string[] = [];

  if (!object_type) {
    /* Return all rules */
    candidateRules = [
      ...generalRules,
      ...tableRules,
      ...viewRules,
      ...procedureRules,
      ...functionRules,
      ...triggerRules,
    ];
    titleParts.push("All BSG SQL Standards");
  } else {
    candidateRules = ALL_RULES[object_type] ?? [];
    const typeLabels: Record<string, string> = {
      GENERAL: "General",
      TABLE: "Table",
      VIEW: "View",
      SP: "Stored Procedure",
      FUNCTION: "Function",
      TRIGGER: "Trigger",
    };
    titleParts.push(`BSG SQL Standards — ${typeLabels[object_type] ?? object_type} Rules`);
  }

  if (topic && topic !== "all") {
    candidateRules = candidateRules.filter((r) => r.category === topic);
    titleParts.push(`(filtered by topic: ${topic})`);
  }

  return {
    title: titleParts.join(" "),
    rules: candidateRules,
  };
}
