import { scalarText } from '../contracts/guards.js';
export function nameKey(value: unknown): string {
  return scalarText(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
export function countryKey(value: unknown): string {
  const key = nameKey(value);
  const aliases: Record<string, string> = {
    usa: 'unitedstates',
    uk: 'unitedkingdom',
    uae: 'unitedarabemirates',
  };
  return (aliases[key] || key).replace(/^the/, '');
}
