export interface CustomPaymentMethod {
  id: string;
  name: string;
  instructions: string;
}

function isCustomPaymentMethod(value: unknown): value is CustomPaymentMethod {
  if (typeof value !== 'object' || value === null) return false;
  const method = value as Record<string, unknown>;
  return typeof method.id === 'string' && method.id.length > 0 &&
    typeof method.name === 'string' &&
    typeof method.instructions === 'string';
}

export function parseCustomPaymentMethods(value: string | null | undefined): CustomPaymentMethod[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(isCustomPaymentMethod)) {
    throw new Error('Saved payment methods have an invalid format.');
  }
  return parsed as CustomPaymentMethod[];
}
