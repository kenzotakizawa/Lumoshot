import { describe, it, expect, afterEach, vi } from 'vitest';
import { t, getUILanguage } from './i18n';

// `chrome` is undefined in this (jsdom) test environment, so these tests
// exercise the web-app fallback path in i18n.ts: language detection via
// navigator.language, and dictionary lookup with an en fallback.
describe('i18n (web fallback path)', () => {
    const originalLanguage = Object.getOwnPropertyDescriptor(window.navigator, 'language');

    afterEach(() => {
        if (originalLanguage) Object.defineProperty(window.navigator, 'language', originalLanguage);
        vi.unstubAllGlobals();
    });

    function setNavigatorLanguage(lang: string) {
        Object.defineProperty(window.navigator, 'language', { value: lang, configurable: true });
    }

    it('falls back to navigator.language when chrome.i18n is unavailable', () => {
        setNavigatorLanguage('fr-FR');
        expect(getUILanguage()).toBe('fr-FR');
    });

    it('returns the Japanese translation when the UI language is Japanese', () => {
        setNavigatorLanguage('ja-JP');
        expect(t('actionSave')).toBe('PNG保存');
    });

    it('returns the English translation for any non-Japanese language', () => {
        setNavigatorLanguage('en-US');
        expect(t('actionSave')).toBe('Save PNG');
        setNavigatorLanguage('fr-FR');
        expect(t('actionSave')).toBe('Save PNG');
    });

    it('falls back to the key itself when it exists in neither dictionary', () => {
        setNavigatorLanguage('en-US');
        expect(t('this_key_does_not_exist')).toBe('this_key_does_not_exist');
    });
});
