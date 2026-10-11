type XmlCode = { code: string; description: string; type: 'fiat' | 'crypto' };

/** Filter the complete approved catalogue; never silently truncate valid options. */
export function getRatesXmlCodeOptions<T extends XmlCode>(
  catalogue: readonly T[],
  type: XmlCode['type'],
  search = '',
): T[] {
  const query = search.trim().toLowerCase();
  return catalogue.filter(entry => entry.type === type && (
    !query || entry.code.toLowerCase().includes(query) || entry.description.toLowerCase().includes(query)
  ));
}
