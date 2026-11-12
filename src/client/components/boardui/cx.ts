export function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
