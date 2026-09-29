import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A flat macOS-style terminal window: traffic lights, a title, and the content. */
export function TerminalWindow({ title, children, className, footer }: { title: string; children: ReactNode; className?: string; footer?: ReactNode }) {
    return (
        <div className={cn('overflow-hidden rounded-[20px] border border-white/10 bg-[#0b0b0d] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]', className)}>
            <div className="flex h-10 items-center gap-2 border-white/[0.06] border-b bg-[#141417] px-4">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#febc2e]" />
                <span className="size-3 rounded-full bg-[#28c840]" />
                <span className="flex-1 text-center font-sans text-k-muted text-xs">{title}</span>
                <span className="w-[52px]" />
            </div>
            <div className="p-4 sm:p-6">{children}</div>
            {footer}
        </div>
    );
}
