import { getUILanguage } from '../lib/i18n';

const isJa = getUILanguage().toLowerCase().startsWith('ja');

// Inline Japanese / English text for the GIF editor.
export const tt = (ja: string, en: string) => (isJa ? ja : en);
