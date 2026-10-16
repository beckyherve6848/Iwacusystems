export type PhoneStatusStyle = 'dynamic-island' | 'camera-cutout';
export type PhoneThemeMode = 'light' | 'dark';

export const PHONE_STATUS_STYLE_KEY = 'phone-status-style';
export const PHONE_STATUS_STYLE_EVENT = 'app:phone-status-style-change';
export const PHONE_THEME_MODE_KEY = 'phone-theme-mode';
export const PHONE_THEME_MODE_EVENT = 'app:phone-theme-mode-change';

export function getPhoneStatusStyle(): PhoneStatusStyle {
  return window.localStorage.getItem(PHONE_STATUS_STYLE_KEY) === 'camera-cutout'
    ? 'camera-cutout'
    : 'dynamic-island';
}

export function savePhoneStatusStyle(style: PhoneStatusStyle) {
  window.localStorage.setItem(PHONE_STATUS_STYLE_KEY, style);
  window.dispatchEvent(new CustomEvent<PhoneStatusStyle>(PHONE_STATUS_STYLE_EVENT, { detail: style }));
}

export function getPhoneThemeMode(): PhoneThemeMode {
  return window.localStorage.getItem(PHONE_THEME_MODE_KEY) === 'dark' ? 'dark' : 'light';
}

export function savePhoneThemeMode(mode: PhoneThemeMode) {
  window.localStorage.setItem(PHONE_THEME_MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent<PhoneThemeMode>(PHONE_THEME_MODE_EVENT, { detail: mode }));
}
