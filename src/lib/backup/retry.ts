export const MAX_BACKUP_EVENT_ATTEMPTS = 20;

export function retryDelaySeconds(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error("Retry attempt must be a positive integer");
  return Math.min(24 * 60 * 60, 30 * 2 ** Math.min(attempt - 1, 12));
}

export function isPermanentBackupError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const response = "response" in error && typeof error.response === "object" && error.response !== null
    ? error.response
    : null;
  const status = response && "status" in response && typeof response.status === "number"
    ? response.status
    : "code" in error && typeof error.code === "number"
      ? error.code
      : null;
  return status !== null && status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}
