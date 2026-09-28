export const validAddonKey = /^[a-z0-9][a-z0-9_-]{0,99}$/;

export function addonKeyFromText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+/g, '-').slice(0, 100);
}