export function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The data is unavailable.';
}
export function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}
export function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
export function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);
}
