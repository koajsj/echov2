export const uuidPattern =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
export const uuidSchema = { type: "string", pattern: uuidPattern } as const;
export const sequenceSchema = {
  type: "string",
  pattern: "^(0|[1-9][0-9]{0,18})$",
} as const;
export function normalizeUsername(value: string): string {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(value)) throw new Error("Invalid username");
  return value.toLowerCase();
}
