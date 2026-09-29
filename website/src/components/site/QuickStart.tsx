'use client';

import { useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { TaskList } from '@/components/ui/task-list';
import cli from '@/generated/cli.json';
import { INSTALL } from '@/lib/site';
import { TerminalWindow } from './TerminalWindow';

// The output of --version and init is captured from the real CLI (scripts/website/generate.jsx).
const STEPS = [
    { task: 'Install Kestrel', command: INSTALL.npm, output: 'added 2 packages' },
    { task: 'Check it runs', command: 'kestrel --version', output: cli.version },
    { task: 'Describe the stack', command: 'cd myapp && kestrel init --yes', output: cli.init },
    { task: 'Run it', command: 'kestrel pm', output: '→ the dashboard at the top of this page, with your stack starting' },
] as const;

const CHAR_MS = 26;
const PAUSE_MS = 650;

/** Types the four commands of a first run, one after another, ticking them off beside the terminal. */
export function QuickStart() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: '-20% 0px' });
    const reduced = useReducedMotion();
    const [step, setStep] = useState(0); // steps fully shown
    const [chars, setChars] = useState(0); // characters of the current command typed

    useEffect(() => {
        if (reduced) {
            setStep(STEPS.length);
            return;
        }
        if (!inView || step >= STEPS.length) return;
        const command = STEPS[step]?.command ?? '';
        const timer =
            chars < command.length
                ? setTimeout(() => setChars((c) => c + 1), CHAR_MS)
                : setTimeout(() => {
                      setStep((s) => s + 1);
                      setChars(0);
                  }, PAUSE_MS);
        return () => clearTimeout(timer);
    }, [inView, reduced, step, chars]);

    const replay = () => {
        setStep(0);
        setChars(0);
    };

    const tasks = STEPS.map((s, i) => ({ id: `step-${i}`, label: s.task, done: i < step }));

    return (
        <div ref={ref} className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
            <TerminalWindow title="zsh — ~/code">
                <div className="min-h-72 font-mono text-sm leading-relaxed" aria-live="off">
                    {STEPS.map((s, i) => {
                        if (i > step) return null;
                        const typing = i === step;
                        return (
                            <div key={s.command} className="mb-3">
                                <p className="text-k-text">
                                    <span className="text-k-mauve">~/code</span> <span className="text-k-green">$</span> {typing ? s.command.slice(0, chars) : s.command}
                                    {typing && <span aria-hidden="true" className="ml-0.5 inline-block h-[1.1em] w-[0.55em] translate-y-[0.15em] animate-[blink_1.1s_steps(1)_infinite] bg-k-text" />}
                                </p>
                                {!typing && <pre className="whitespace-pre-wrap text-k-subtext">{s.output}</pre>}
                            </div>
                        );
                    })}
                    {step >= STEPS.length && (
                        <button type="button" onClick={replay} className="mt-2 rounded-md border border-white/10 px-3 py-1 text-k-subtext text-xs transition-colors hover:border-k-mauve/50 hover:text-k-text">
                            ↻ replay
                        </button>
                    )}
                </div>
            </TerminalWindow>
            <div>
                <TaskList tasks={tasks} onTasksChange={() => {}} reorderCompleted={false} accent="#a6e3a1" size="md" />
                <p className="mt-6 text-sm leading-relaxed">
                    No stack yet? <code className="font-mono text-k-teal">kestrel init</code> reads a Procfile or your package.json scripts, and{' '}
                    <code className="font-mono text-k-teal">kestrel import pm2</code> converts a pm2 setup.
                </p>
            </div>
            <p className="sr-only">
                Four commands: {STEPS.map((s) => s.command).join(', then ')}. kestrel init prints: {cli.init}
            </p>
        </div>
    );
}
