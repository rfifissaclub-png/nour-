const RESERVED_SHEET_NAMES = new Set(["résumé", "sync log"]);

export function sanitizeWorksheetTitle(levelName: string, levelId?: string): string {
  const cleanName = levelName
    .trim()
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^'+|'+$/g, "")
    .trim() || "Niveau";
  const suffix = levelId ? ` (${levelId.replace(/-/g, "")})` : "";
  const base = cleanName.slice(0, Math.max(1, 100 - suffix.length)).trim() || "Niveau";
  let title = `${base}${suffix}`;
  if (!suffix && RESERVED_SHEET_NAMES.has(title.toLocaleLowerCase("fr"))) {
    title = `${title.slice(0, 90)} (Niveau)`;
  }
  return title;
}

export function formatDirhams(cents: number): string {
  const amount = (cents / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${amount} DH`;
}
