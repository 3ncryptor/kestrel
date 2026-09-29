'use client';

import { DottedAccordion } from '@/components/ui/dotted-accordion';

const ITEMS = [
    {
        title: 'Does it replace htop or btop?',
        description:
            'For most day-to-day use, yes: CPU, memory, ports and a process table and tree with filter, sort, kill and renice. What it adds is your project: which of those processes are yours, their ports, their logs and their memory trend.',
    },
    {
        title: 'And pm2 or foreman?',
        description:
            'For development and small servers, yes: dependency order, readiness checks, restarts with backoff, env files and saved logs. It is not a cluster manager and does not daemonize; run it inside tmux to keep a stack up after you log out.',
    },
    {
        title: 'Is killing processes safe?',
        description:
            'Every kill and renice goes through confirmations enforced in the engine, not only the UI: one key for your own processes, the exact name typed for another user’s, and Kestrel itself, its shell and PID 1 can’t be signalled at all.',
    },
    {
        title: 'Windows?',
        description: 'Not natively. Kestrel reads macOS and Linux process tables; on Windows it runs inside WSL2.',
    },
    {
        title: 'Does it send any data?',
        description: 'No. There is no telemetry and no analytics, in the app or on this site. The network is used only for readiness checks you configure and when you run kestrel update.',
    },
    {
        title: 'Why is the download 30–40 MB?',
        description: 'It is one standalone binary: the Bun runtime, the terminal UI and its native renderer compiled together, so nothing else has to be installed on the machine.',
    },
];

export function Faq() {
    return <DottedAccordion items={ITEMS} defaultIndex={0} collapsible className="max-w-3xl" />;
}
