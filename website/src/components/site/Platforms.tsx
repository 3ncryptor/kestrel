const ROWS = [
    { arch: 'arm64', mac: 'Apple Silicon', linux: 'AWS Graviton, Raspberry Pi (64-bit)', macPkg: 'kestrel-tui-darwin-arm64', linuxPkg: 'kestrel-tui-linux-arm64' },
    { arch: 'x64', mac: 'Intel Macs', linux: 'Most servers and desktops', macPkg: 'kestrel-tui-darwin-x64', linuxPkg: 'kestrel-tui-linux-x64' },
] as const;

function Cell({ name, pkg }: { name: string; pkg: string }) {
    return (
        <td className="group p-0">
            <a href={`https://www.npmjs.com/package/${pkg}`} className="block h-full px-5 py-4 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.03]">
                <span className="flex items-center gap-2 text-k-text">
                    <span className="text-k-green">●</span>
                    {name}
                </span>
                <span className="mt-1 block font-mono text-k-muted text-xs transition-colors group-hover:text-k-teal">{pkg}</span>
            </a>
        </td>
    );
}

export function Platforms() {
    return (
        <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[560px] text-left text-sm">
                <caption className="sr-only">Supported platforms and their npm packages</caption>
                <thead className="bg-k-mantle/60 text-k-subtext">
                    <tr>
                        <th scope="col" className="px-5 py-3 font-normal">
                            <span className="sr-only">Architecture</span>
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">macOS 13 or newer</th>
                        <th scope="col" className="px-5 py-3 font-medium">Linux (glibc)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                    {ROWS.map((row) => (
                        <tr key={row.arch}>
                            <th scope="row" className="px-5 py-4 font-mono font-normal text-k-mauve">{row.arch}</th>
                            <Cell name={row.mac} pkg={row.macPkg} />
                            <Cell name={row.linux} pkg={row.linuxPkg} />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
