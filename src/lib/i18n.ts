// Platform-agnostic i18n.
// - In the Chrome extension, delegates to chrome.i18n so behavior is identical.
// - In the web build (no chrome.i18n), uses the bundled locale messages.
import enRaw from '../../public/_locales/en/messages.json';
import jaRaw from '../../public/_locales/ja/messages.json';

type RawMessages = Record<string, { message: string }>;

const flatten = (raw: RawMessages): Record<string, string> =>
    Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value.message]));

const dicts: Record<string, Record<string, string>> = {
    en: flatten(enRaw as RawMessages),
    ja: flatten(jaRaw as RawMessages),
};

const hasChromeI18n = typeof chrome !== 'undefined' && !!chrome?.i18n?.getMessage;

export function getUILanguage(): string {
    if (typeof chrome !== 'undefined' && chrome?.i18n?.getUILanguage) {
        return chrome.i18n.getUILanguage();
    }
    return navigator.language || 'en';
}

export function t(key: string, substitutions?: string | string[]): string {
    if (hasChromeI18n) {
        return chrome.i18n.getMessage(key, substitutions);
    }
    const lang = getUILanguage().toLowerCase().startsWith('ja') ? 'ja' : 'en';
    return dicts[lang][key] ?? dicts.en[key] ?? key;
}
