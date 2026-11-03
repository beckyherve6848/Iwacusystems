import { getCountries, getCountryCallingCode } from 'libphonenumber-js';

export function getPhoneCountryOptions(language: string) {
  const countryNames = new Intl.DisplayNames([language], { type: 'region' });
  return getCountries()
    .map(country => ({
      countryCode: country,
      code: getCountryCallingCode(country),
      name: countryNames.of(country) ?? country,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, language));
}

export function normalizePhoneNumber(phone: string, defaultCallingCode = '257'): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  const defaultCode = defaultCallingCode.replace(/\D/g, '');
  if (!digits || !defaultCode) return null;

  let internationalDigits: string;
  if (trimmed.startsWith('+')) {
    internationalDigits = digits;
  } else if (trimmed.startsWith('00')) {
    internationalDigits = digits.slice(2);
  } else if (digits.startsWith(defaultCode) && digits.length > defaultCode.length + 6) {
    internationalDigits = digits;
  } else {
    internationalDigits = `${defaultCode}${digits.replace(/^0+/, '')}`;
  }

  return /^\d{7,15}$/.test(internationalDigits) ? `+${internationalDigits}` : null;
}
