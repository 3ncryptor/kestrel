import type { ThemeRegistration } from 'shiki';

// Code blocks in Kestrel's palette (ui/theme/tokens.js), so docs read like the product.
export const kestrelTheme: ThemeRegistration = {
    name: 'kestrel',
    type: 'dark',
    colors: { 'editor.background': '#121212', 'editor.foreground': '#cdd6f4' },
    tokenColors: [
        { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#7f849c', fontStyle: 'italic' } },
        { scope: ['string', 'string.quoted', 'string.unquoted'], settings: { foreground: '#a6e3a1' } },
        { scope: ['constant.numeric', 'constant.language', 'constant.character'], settings: { foreground: '#fab387' } },
        { scope: ['support.type.property-name', 'meta.object-literal.key', 'entity.name.tag', 'meta.mapping.key'], settings: { foreground: '#89b4fa' } },
        { scope: ['keyword', 'storage', 'keyword.operator.logical'], settings: { foreground: '#cba6f7' } },
        { scope: ['entity.name.function', 'support.function', 'entity.name.command'], settings: { foreground: '#94e2d5' } },
        { scope: ['variable', 'variable.other', 'variable.parameter'], settings: { foreground: '#cdd6f4' } },
        { scope: ['punctuation', 'meta.brace'], settings: { foreground: '#a6adc8' } },
    ],
};
