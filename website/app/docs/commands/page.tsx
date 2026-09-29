import type { Metadata } from 'next';
import { DocPage } from '@/components/docs/DocPage';
import cli from '@/generated/cli.json';
import { help, pageFor } from '@/lib/pages';

const page = pageFor('/docs/commands');
export const metadata: Metadata = { title: page.title, description: page.description, alternates: { canonical: page.href } };

function Rows({ rows }: { rows: Array<{ usage: string; description: string }> }) {
    return (
        <div className="table-scroll">
            <table>
                <thead>
                    <tr>
                        <th scope="col">Usage</th>
                        <th scope="col">What it does</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.usage}>
                            <td>
                                <code>{r.usage}</code>
                            </td>
                            <td>{r.description}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function Commands() {
    const { commands, options } = help();
    return (
        <DocPage
            href="/docs/commands"
            toc={[
                { id: 'commands', text: 'Commands', depth: 2 },
                { id: 'options', text: 'Options', depth: 2 },
                { id: 'help', text: 'kestrel --help', depth: 2 },
            ]}
        >
            <h2 id="commands">Commands</h2>
            <Rows rows={commands} />
            <h2 id="options">Options</h2>
            <Rows rows={options} />
            <h2 id="help">kestrel --help</h2>
            <p>This page is built from the real output, captured from the CLI when the site is generated:</p>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: it scrolls sideways, so keyboard users must be able to reach it (WCAG 2.1.1) */}
            <pre className="terminal-output" tabIndex={0}>
                <code>{cli.help}</code>
            </pre>
        </DocPage>
    );
}
