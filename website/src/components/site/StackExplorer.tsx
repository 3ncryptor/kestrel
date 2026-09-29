'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { type TreeNode, TreeView } from '@/components/ui/file-tree';
import { cn } from '@/lib/cn';

type Key = 'version' | 'cmd' | 'ready' | 'dependsOn' | 'restart';

const NOTES: Record<Key, { title: string; body: string }> = {
    version: { title: 'version', body: 'The file format. Always 1 for now; Kestrel tells you if a file is newer than it understands.' },
    cmd: { title: 'cmd', body: 'What to run, through your shell, in the folder of kestrel.json (or cwd). Each process gets its own process group, so stopping it stops its children too.' },
    ready: { title: 'ready', body: 'When a process counts as up: a port accepts connections, an HTTP check returns 2xx or 3xx, or a log line appears. Dependents wait for it.' },
    dependsOn: { title: 'dependsOn', body: 'Start order. api waits until db is ready; if db fails, api is shown as blocked instead of crashing on its own.' },
    restart: { title: 'restart', body: 'on-failure (the default), always or never, with backoff between tries and maxRestarts before giving up.' },
};

/** Which process each annotated line belongs to, so the graph can light it up. */
type Line = { indent: number; parts: Array<string | { key: Key; text: string }>; process?: 'db' | 'api' | 'worker' };

const k = (key: Key) => ({ key, text: `"${key}"` });

const LINES: Line[] = [
    { indent: 0, parts: ['{'] },
    { indent: 1, parts: [k('version'), ': 1,'] },
    { indent: 1, parts: ['"processes": {'] },
    { indent: 2, parts: ['"db": {'], process: 'db' },
    { indent: 3, parts: [k('cmd'), ': "docker run --rm -p 5432:5432 postgres:16",'], process: 'db' },
    { indent: 3, parts: [k('ready'), ': { "port": 5432 }'], process: 'db' },
    { indent: 2, parts: ['},'] },
    { indent: 2, parts: ['"api": {'], process: 'api' },
    { indent: 3, parts: [k('cmd'), ': "npm run dev",'], process: 'api' },
    { indent: 3, parts: [k('dependsOn'), ': ["db"],'], process: 'api' },
    { indent: 3, parts: [k('ready'), ': { "http": "http://localhost:3000/health" }'], process: 'api' },
    { indent: 2, parts: ['},'] },
    { indent: 2, parts: ['"worker": {'], process: 'worker' },
    { indent: 3, parts: [k('cmd'), ': "node worker.js",'], process: 'worker' },
    { indent: 3, parts: [k('dependsOn'), ': ["api"],'], process: 'worker' },
    { indent: 3, parts: [k('restart'), ': "always"'], process: 'worker' },
    { indent: 2, parts: ['}'] },
    { indent: 1, parts: ['}'] },
    { indent: 0, parts: ['}'] },
];

const TREE: TreeNode[] = [
    {
        id: 'myapp',
        label: 'myapp',
        children: [
            { id: 'kestrel.json', label: 'kestrel.json' },
            { id: 'package.json', label: 'package.json' },
            { id: 'src', label: 'src', children: [{ id: 'server.js', label: 'server.js' }] },
            { id: 'worker.js', label: 'worker.js' },
            {
                id: '.kestrel',
                label: '.kestrel  (git-ignored)',
                children: [
                    { id: 'logs', label: 'logs', children: [{ id: 'api.log', label: 'api.log' }, { id: 'db.log', label: 'db.log' }, { id: 'worker.log', label: 'worker.log' }] },
                    { id: 'run.json', label: 'run.json' },
                ],
            },
        ],
    },
];

const GRAPH = ['db', 'api', 'worker'] as const;

export function StackExplorer() {
    const [key, setKey] = useState<Key>('dependsOn');
    const [process, setProcess] = useState<Line['process']>('api');
    const note = NOTES[key];

    const focus = (next: Key, owner: Line['process']) => {
        setKey(next);
        if (owner) setProcess(owner);
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.6fr]">
            <div className="rounded-xl border border-white/10 bg-k-mantle/60 p-4">
                <p className="mb-3 font-mono text-k-muted text-xs">your project</p>
                <TreeView data={TREE} defaultExpandedIds={['myapp', '.kestrel', 'logs']} showLines />
                <p className="mt-4 text-xs leading-relaxed">
                    Logs are saved per process and rotated at 10 MB. <code className="font-mono">run.json</code> is how Kestrel finds what it left running after a crash.
                </p>
            </div>
            <div className="grid gap-4">
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-k-base p-5 font-mono text-[13px] leading-relaxed">
                    <code>
                        {LINES.map((line, i) => (
                            <span
                                // biome-ignore lint/suspicious/noArrayIndexKey: the lines of a fixed file
                                key={i}
                                className={cn('block transition-colors duration-200', line.process && line.process === process ? 'bg-k-mauve/[0.06]' : '')}
                                style={{ paddingLeft: `${line.indent * 2}ch` }}
                            >
                                {line.parts.map((part, j) =>
                                    typeof part === 'string' ? (
                                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed tokens of a line
                                        <span key={j} className="text-k-subtext">{part}</span>
                                    ) : (
                                        <button
                                            // biome-ignore lint/suspicious/noArrayIndexKey: fixed tokens of a line
                                            key={j}
                                            type="button"
                                            onMouseEnter={() => focus(part.key, line.process)}
                                            onFocus={() => focus(part.key, line.process)}
                                            onClick={() => focus(part.key, line.process)}
                                            className={cn('rounded px-0.5 font-mono transition-colors', key === part.key ? 'bg-k-mauve/20 text-k-mauve' : 'text-k-blue hover:text-k-mauve')}
                                        >
                                            {part.text}
                                        </button>
                                    ),
                                )}
                            </span>
                        ))}
                    </code>
                </pre>
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <motion.div key={key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-k-mauve/30 bg-k-mauve/[0.05] p-5" aria-live="polite">
                        <p className="font-mono text-k-mauve text-sm">{note.title}</p>
                        <p className="mt-2 text-sm leading-relaxed">{note.body}</p>
                    </motion.div>
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-k-mantle/60 px-5 py-4 font-mono text-sm" aria-hidden="true">
                        {GRAPH.map((p, i) => (
                            <span key={p} className="flex items-center gap-2">
                                <span className={cn('rounded-md border px-2 py-1 transition-all duration-300', process === p ? 'border-k-teal/60 bg-k-teal/10 text-k-teal' : 'border-white/10 text-k-muted')}>
                                    ● {p}
                                </span>
                                {i < GRAPH.length - 1 && <span className="text-k-muted">→</span>}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
