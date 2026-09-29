import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: { alias: { '@': `${import.meta.dirname}/src` } },
    test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
