'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import { BentoGrid } from '@/components/ui/bento-grid';
import { toast } from '@/components/ui/sonner';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/cn';

const SPOTLIGHT = 'rgba(203, 166, 247, 0.12)';

function Feature({ title, body, children, className }: { title: string; body: string; children: React.ReactNode; className?: string }) {
    return (
        <SpotlightCard spotlightColor={SPOTLIGHT} className={cn('flex flex-col rounded-xl border border-white/10 bg-k-mantle/60 p-6', className)}>
            <div className="min-h-32 flex-1">{children}</div>
            <h3 className="mt-6 font-medium text-k-text">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed">{body}</p>
        </SpotlightCard>
    );
}

/** Eight core meters that breathe, drawn with the same ■ blocks and colour steps as the app. */
function CoreMeters() {
    const cores = [34, 71, 22, 9, 48, 15, 63, 27].map((value, i) => ({ id: `C${i}`, value, delay: i * 0.35 }));
    const colour = (v: number) => (v >= 75 ? 'text-k-red' : v >= 50 ? 'text-k-peach' : v >= 25 ? 'text-k-yellow' : 'text-k-green');
    return (
        <div className="grid max-w-md grid-cols-2 gap-x-8 gap-y-1.5 font-mono text-xs" aria-hidden="true">
            {cores.map(({ id, value: v, delay }) => {
                const filled = Math.round(v / 10);
                return (
                    <div key={id} className="flex items-center gap-2">
                        <span className="w-6 text-k-muted">{id}</span>
                        <span className={cn('animate-[pulse_3s_ease-in-out_infinite]', colour(v))} style={{ animationDelay: `${delay}s` }}>
                            {'■'.repeat(filled)}
                            <span className="text-k-surface1">{'─'.repeat(10 - filled)}</span>
                        </span>
                        <span className="w-9 text-right text-k-subtext">{v}%</span>
                    </div>
                );
            })}
        </div>
    );
}

const STACK = [
    { id: 'db', ready: ':5432' },
    { id: 'api', ready: ':3000' },
    { id: 'worker', ready: 'log line' },
] as const;
const STEP_MS = 1100;

/** db → api → worker coming up in dependency order, like `kestrel pm` does it. */
function StartOrder() {
    const [step, setStep] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setStep((s) => (s + 1) % (STACK.length * 2 + 3)), STEP_MS);
        return () => clearInterval(timer);
    }, []);
    return (
        <ul className="space-y-2 font-mono text-sm" aria-hidden="true">
            {STACK.map((p, i) => {
                const state = step > i * 2 + 1 ? 'ready' : step > i * 2 ? 'starting' : 'waiting';
                return (
                    <li key={p.id} className="flex items-center gap-3">
                        <span className={cn('w-4 text-center', state === 'ready' ? 'text-k-green' : state === 'starting' ? 'text-k-yellow' : 'text-k-muted')}>
                            {state === 'ready' ? '●' : state === 'starting' ? '◌' : '○'}
                        </span>
                        <span className="w-14 text-k-text">{p.id}</span>
                        <span className="text-k-subtext">{state === 'ready' ? `ready ${p.ready}` : state === 'starting' ? 'starting…' : i ? `waits for ${STACK[i - 1]?.id}` : 'idle'}</span>
                    </li>
                );
            })}
        </ul>
    );
}

const LINES = ['GET /health 200 1ms', 'POST /api/login 401 9ms', 'GET /api/projects 200 18ms', 'POST /api/login 200 42ms', 'worker ready: polling queue'];

/** A logs panel you can search: type and the matches light up, as with `/` in Kestrel. */
function LogSearch() {
    const [query, setQuery] = useState('login');
    const id = useId();
    const q = query.trim().toLowerCase();
    return (
        <div className="font-mono text-xs">
            <label htmlFor={id} className="flex items-center gap-2 rounded-md border border-white/10 bg-k-base px-2 py-1.5">
                <span className="text-k-mauve">/</span>
                <input id={id} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the logs" className="w-full bg-transparent text-k-text outline-none" spellCheck={false} />
            </label>
            <ul className="mt-2 space-y-0.5">
                {LINES.map((line) => {
                    const hit = q && line.toLowerCase().includes(q);
                    return (
                        <li key={line} className={cn('truncate rounded px-1 transition-colors duration-200', hit ? 'bg-k-yellow/15 text-k-text' : q ? 'text-k-muted' : 'text-k-subtext')}>
                            {line}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

// Another user's process: Kestrel's 'system' tier asks for its exact name (PID 1 is blocked outright).
const TARGET = 'WindowServer';

/** Kestrel's tier for other users' processes: type the exact name to confirm. Nothing is ever killed here. */
function SafeKill() {
    const [typed, setTyped] = useState('');
    const id = useId();
    const armed = typed === TARGET;
    const confirm = () => {
        toast.success('Confirmed, and nothing was killed', { description: 'A demo. In Kestrel, another user’s process needs its exact name; PID 1 and Kestrel itself cannot be signalled at all.' });
        setTyped('');
    };
    return (
        <div className="font-mono text-xs">
            <p className="text-k-subtext">
                Kill <span className="text-k-red">WindowServer</span> (pid 402, _windowserver)?
            </p>
            <label htmlFor={id} className="mt-2 block text-k-muted">
                Type its name to confirm
            </label>
            <input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={TARGET} spellCheck={false} autoComplete="off" className="mt-1 w-full rounded-md border border-white/10 bg-k-base px-2 py-1.5 text-k-text outline-none focus:border-k-red/60" />
            <button
                type="button"
                disabled={!armed}
                onClick={confirm}
                className={cn('mt-2 w-full rounded-md px-2 py-1.5 transition-all duration-200', armed ? 'bg-k-red text-k-base active:scale-[0.98]' : 'cursor-not-allowed bg-white/[0.04] text-k-muted')}
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={armed ? 'armed' : 'safe'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="block">
                        {armed ? 'Send SIGTERM' : 'Locked until the name matches'}
                    </motion.span>
                </AnimatePresence>
            </button>
        </div>
    );
}

const PLACES = ['over SSH', 'EC2', 'Raspberry Pi', 'Graviton', 'tmux', '16 colours', 'NO_COLOR', 'one binary'];

export function Features() {
    return (
        <BentoGrid className="max-w-none">
            <Feature className="md:col-span-2" title="See the machine" body="CPU history and per-core meters, memory and swap, listening ports with their owners, and a process table or tree with filter, sort, details, kill and renice.">
                <CoreMeters />
            </Feature>
            <Feature title="Stay safe" body="Every kill and renice is confirmed in the engine: one key for your own processes, the exact name for another user’s. Kestrel itself and PID 1 are blocked.">
                <SafeKill />
            </Feature>
            <Feature title="Run the stack" body="Starts kestrel.json, a Procfile or package.json scripts in dependency order, waits for each to be ready, and restarts crashes with backoff.">
                <StartOrder />
            </Feature>
            <Feature title="Follow it" body="A live logs panel per process or all of them interleaved, with pause and search. Logs are saved to .kestrel/logs/ too.">
                <LogSearch />
            </Feature>
            <Feature title="Anywhere" body="One binary with nothing to install beside it. It works over SSH, on a server or a Pi, and in 16-colour and no-colour terminals.">
                <div className="flex flex-wrap gap-2" aria-hidden="true">
                    {PLACES.map((p) => (
                        <span key={p} className="rounded-full border border-white/10 bg-k-base px-3 py-1 font-mono text-k-subtext text-xs transition-colors hover:border-k-teal/50 hover:text-k-teal">
                            {p}
                        </span>
                    ))}
                </div>
            </Feature>
        </BentoGrid>
    );
}
