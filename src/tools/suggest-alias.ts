import { z } from "zod";

export const SuggestAliasSchema = z.object({
  table_name: z.string().min(1, "Table name cannot be empty"),
  existing_aliases: z.array(z.string()).optional(),
});

export type SuggestAliasInput = z.infer<typeof SuggestAliasSchema>;

interface SuggestAliasResult {
  alias: string;
  conflicts: boolean;
  alternatives: string[];
}

/* ── helpers ── */

/** Strip standard SQL object prefixes */
function stripPrefix(name: string): string {
  if (name.startsWith("T_")) return name.slice(2);
  if (name.startsWith("V_")) return name.slice(2);
  if (name.startsWith("SP_")) return name.slice(3);
  if (name.startsWith("F_")) return name.slice(2);
  if (name.startsWith("TR_")) return name.slice(3);
  return name;
}

/** Split a PascalCase string into its component words */
function splitPascalCase(s: string): string[] {
  // Insert boundary before each uppercase letter that follows a lowercase letter or digit
  const result = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ");
  return result.filter((w) => w.length > 0);
}

/** Build the primary alias: first letter of each word, uppercase */
function buildAlias(words: string[]): string {
  return words.map((w) => w[0].toUpperCase()).join("");
}

/** Generate alternative aliases when the primary conflicts */
function buildAlternatives(
  words: string[],
  primaryAlias: string,
  existing: Set<string>
): string[] {
  const alts: string[] = [];

  // Strategy 1: indexed suffix (FO2, FO3, ...)
  for (let i = 2; i <= 9; i++) {
    const candidate = `${primaryAlias}${i}`;
    if (!existing.has(candidate)) {
      alts.push(candidate);
      break;
    }
  }

  // Strategy 2: use two letters from first word + first letters of subsequent words
  if (words.length >= 1) {
    const twoLetters =
      words[0].length >= 2
        ? words[0].slice(0, 2).charAt(0).toUpperCase() + words[0].slice(0, 2).charAt(1).toLowerCase()
        : words[0][0].toUpperCase();
    const rest = words.slice(1).map((w) => w[0].toUpperCase()).join("");
    const candidate = twoLetters + rest;
    if (!existing.has(candidate) && candidate !== primaryAlias && !alts.includes(candidate)) {
      alts.push(candidate);
    }
  }

  // Strategy 3: first letters + lowercase second letter of first word
  if (words.length >= 2) {
    const alt3 =
      words[0][0].toUpperCase() +
      (words[0][1] ? words[0][1].toLowerCase() : "") +
      words.slice(1).map((w) => w[0].toUpperCase()).join("");
    if (!existing.has(alt3) && alt3 !== primaryAlias && !alts.includes(alt3)) {
      alts.push(alt3);
    }
  }

  // Strategy 4: suggest underscore differentiator (descriptive hint only — won't conflict)
  if (words.length > 0) {
    alts.push(`${primaryAlias}_Origen`);
    alts.push(`${primaryAlias}_Destino`);
  }

  return alts;
}

/* ── Main export ── */

export function suggestAlias(input: SuggestAliasInput): SuggestAliasResult {
  const { table_name, existing_aliases = [] } = input;
  const existingSet = new Set(existing_aliases.map((a) => a.toUpperCase()));

  const stripped = stripPrefix(table_name);
  const words = splitPascalCase(stripped);
  const primaryAlias = buildAlias(words);

  const conflicts = existingSet.has(primaryAlias.toUpperCase());
  const alternatives = conflicts ? buildAlternatives(words, primaryAlias, existingSet) : [];

  return {
    alias: primaryAlias,
    conflicts,
    alternatives,
  };
}
