import { GlowingBadge } from '@/components/ui/glowing-badge';
import { LINKS, VERSION } from '@/lib/site';
import { CopyButton } from './CopyButton';

const ITEMS = [
    {
        title: 'No install scripts',
        body: 'npm installs a launcher and one prebuilt binary for your platform. Nothing runs while it installs.',
        command: 'npm install -g kestrel-tui --ignore-scripts',
        badge: 'verifiable',
    },
    {
        title: 'npm provenance',
        body: 'Every package is published by GitHub Actions from a tagged commit, and its npm page links to that exact build.',
        command: 'npm audit signatures',
        badge: 'verifiable',
    },
    {
        title: 'Build attestations and checksums',
        body: 'The release archives carry GitHub build attestations, and install.sh refuses any download whose SHA-256 differs from SHA256SUMS.',
        command: `gh attestation verify kestrel-v${VERSION}-darwin-arm64.tar.gz --repo 3ncryptor/kestrel`,
        badge: 'verifiable',
    },
    {
        title: 'No telemetry',
        body: 'Kestrel sends nothing anywhere. The network is used only for readiness checks you configure and for kestrel update.',
        command: null,
        badge: 'open source',
    },
] as const;

export function Trust() {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {ITEMS.map((item) => (
                <div key={item.title} className="flex min-w-0 flex-col rounded-xl border border-white/10 bg-k-mantle/60 p-6">
                    <div className="flex items-center justify-between gap-4">
                        <h3 className="font-medium text-k-text">{item.title}</h3>
                        <GlowingBadge variant="emerald" className="rounded-full">
                            {item.badge}
                        </GlowingBadge>
                    </div>
                    <p className="mt-3 flex-1 text-sm leading-relaxed">{item.body}</p>
                    {item.command && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-k-base py-1.5 pr-1.5 pl-3">
                            <code className="min-w-0 flex-1 break-all font-mono text-k-subtext text-xs">{item.command}</code>
                            <CopyButton text={item.command} />
                        </div>
                    )}
                </div>
            ))}
            <p className="text-sm sm:col-span-2">
                Found a security problem? <a href={LINKS.security} className="text-k-mauve underline underline-offset-4">Report it privately</a>.
            </p>
        </div>
    );
}
