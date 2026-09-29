import cli from '@/generated/cli.json';

/** "kestrel 0.1.1" (captured from the real `kestrel --version`) → "0.1.1". */
export const VERSION = cli.version.replace(/^kestrel\s+/, '');

export const SITE = {
    name: 'Kestrel',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kestrel-tui.vercel.app',
    tagline: 'A system monitor and a process manager in one terminal app, for macOS and Linux.',
    description:
        'Kestrel shows what is using your machine, the way htop and btop do, and starts and supervises your project’s processes, the way pm2 or foreman do. One binary for macOS and Linux.',
    repo: 'https://github.com/3ncryptor/kestrel',
    npm: 'https://www.npmjs.com/package/kestrel-tui',
} as const;

export const LINKS = {
    changelog: `${SITE.repo}/blob/main/CHANGELOG.md`,
    security: `${SITE.repo}/blob/main/SECURITY.md`,
    license: `${SITE.repo}/blob/main/LICENSE`,
    issues: `${SITE.repo}/issues/new/choose`,
    releases: `${SITE.repo}/releases/latest`,
} as const;

export const INSTALL = {
    npm: 'npm install -g kestrel-tui',
    npx: 'npx kestrel-tui',
    curl: 'curl -fsSL https://raw.githubusercontent.com/3ncryptor/kestrel/main/packaging/install.sh | sh',
} as const;
