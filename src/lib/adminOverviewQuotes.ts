export const ADMIN_OVERVIEW_QUOTE_COLORS = [
  { value: 'green', hex: '#008000' },
  { value: 'black', hex: '#000000' },
  { value: 'red', hex: '#ff0000' },
  { value: 'blue', hex: '#0000ff' },
  { value: 'gray', hex: '#808080' },
] as const;

export const MAX_ADMIN_OVERVIEW_QUOTE_WORDS = 15;

export type AdminOverviewQuoteColor = typeof ADMIN_OVERVIEW_QUOTE_COLORS[number]['value'];

export interface AdminOverviewPhotoQuote {
  text: string;
  color: AdminOverviewQuoteColor;
}

export const createEmptyOverviewQuotes = (): AdminOverviewPhotoQuote[] =>
  Array.from({ length: 5 }, () => ({ text: '', color: 'green' }));

export function countAdminOverviewQuoteWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function parseAdminOverviewPhotoQuotes(value: unknown): AdminOverviewPhotoQuote[] {
  if (value === undefined || value === null || value === '') return createEmptyOverviewQuotes();
  if (!Array.isArray(value) || value.length > 5) {
    throw new Error('Overview photo quotes must be an array of up to five quotes.');
  }

  const parsed = value.map((quote, index) => {
    if (
      typeof quote !== 'object'
      || quote === null
      || !('text' in quote)
      || typeof quote.text !== 'string'
      || !('color' in quote)
      || typeof quote.color !== 'string'
    ) {
      throw new Error(`Overview photo quote ${index + 1} is invalid.`);
    }
    if (countAdminOverviewQuoteWords(quote.text) > MAX_ADMIN_OVERVIEW_QUOTE_WORDS) {
      throw new Error(`Overview photo quote ${index + 1} exceeds the 15-word limit.`);
    }
    const color = ADMIN_OVERVIEW_QUOTE_COLORS.find(option => option.value === quote.color);
    if (!color) throw new Error(`Overview photo quote ${index + 1} has an unsupported color.`);
    return { text: quote.text, color: color.value };
  });

  return [...parsed, ...createEmptyOverviewQuotes().slice(parsed.length)];
}
