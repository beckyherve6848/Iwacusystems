export type PhoneThemeMode = 'light' | 'dark';
export type ThemeDevice = 'phone' | 'desktop';

export const PHONE_THEME_MODE_KEY = 'phone-theme-mode';
export const DESKTOP_THEME_MODE_KEY = 'desktop-theme-mode';
export const PHONE_THEME_MODE_EVENT = 'app:theme-mode-change';

export function getPhoneThemeMode(): PhoneThemeMode {
  return window.localStorage.getItem(PHONE_THEME_MODE_KEY) === 'dark' ? 'dark' : 'light';
}

export function getDesktopThemeMode(): PhoneThemeMode {
  return window.localStorage.getItem(DESKTOP_THEME_MODE_KEY) === 'dark' ? 'dark' : 'light';
}

export function isPhoneViewport(): boolean {
  return window.matchMedia('(max-width: 767px)').matches;
}

export function getThemeModeForDevice(device: ThemeDevice): PhoneThemeMode {
  return device === 'phone' ? getPhoneThemeMode() : getDesktopThemeMode();
}

export function getThemeModeForCurrentDevice(): PhoneThemeMode {
  return getThemeModeForDevice(isPhoneViewport() ? 'phone' : 'desktop');
}

export function saveThemeModeForDevice(device: ThemeDevice, mode: PhoneThemeMode) {
  const key = device === 'phone' ? PHONE_THEME_MODE_KEY : DESKTOP_THEME_MODE_KEY;
  window.localStorage.setItem(key, mode);
  window.dispatchEvent(new CustomEvent<{ device: ThemeDevice; mode: PhoneThemeMode }>(PHONE_THEME_MODE_EVENT, {
    detail: { device, mode },
  }));
}

export function savePhoneThemeMode(mode: PhoneThemeMode) {
  saveThemeModeForDevice('phone', mode);
}
