"use client";

// Adapted from DevClub UI's github-activity for the Kestrel site:
// - it draws only the days it is given (the original generated random activity when it had none);
// - the grid is one image with a text summary, instead of hundreds of unlabelled, clickable cells;
// - Kestrel's green scale, and no spring or scale-up under reduced motion.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type HTMLAttributes, useMemo, useRef, useState } from "react";
import { type Day, formatDay, levelFor, monthLabels, summarize, weeksOf } from "@/lib/heatmap";
import { cn } from "@/lib/utils";

const LEVEL_CLASSES = [
  "bg-white/4 border border-white/5",
  "bg-k-green/20 border border-k-green/25",
  "bg-k-green/45 border border-k-green/40",
  "bg-k-green/75 border border-k-green/60 shadow-[0_0_8px_rgba(166,227,161,0.3)]",
  "bg-k-green border border-k-green shadow-[0_0_12px_rgba(166,227,161,0.55)]",
] as const;

/** The tooltip keeps this far from the card's edges, so it never spills out. */
const TOOLTIP_EDGE = 75;

export interface GitHubActivityProps extends HTMLAttributes<HTMLDivElement> {
  /** Real days, oldest first or not. Never padded or made up here. */
  days: Day[];
  title: string;
  subtitle?: string;
  blockSize?: number;
  blockGap?: number;
}

type Hovered = { day: Day; x: number; y: number; below: boolean };

export function GitHubActivity({ days, title, subtitle, blockSize = 12, blockGap = 3, className, ...props }: GitHubActivityProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  const weeks = useMemo(() => weeksOf(days), [days]);
  const labels = useMemo(() => monthLabels(weeks), [weeks]);
  const { total, activeDays, busiest } = useMemo(() => summarize(days), [days]);
  const max = busiest?.count ?? 0;
  const width = weeks.length * (blockSize + blockGap) - blockGap;
  const summary = `${total} commits on ${activeDays} of the last ${days.length} days${busiest ? `; the busiest was ${formatDay(busiest.date)}, with ${busiest.count}` : ""}.`;

  const show = (day: Day, cell: HTMLElement) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const rect = cell.getBoundingClientRect();
    const x = Math.max(TOOLTIP_EDGE, Math.min(box.width - TOOLTIP_EDGE, rect.left - box.left + rect.width / 2));
    const top = rect.top - box.top;
    setHovered({ day, x, y: top, below: top < 60 });
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full max-w-full rounded-2xl border border-white/10 bg-zinc-950/75 p-4 sm:p-6 backdrop-blur-xl shadow-[0_20px_48px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.14)] select-none",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col border-b border-white/6 pb-3 sm:pb-4">
        <span className="text-sm font-semibold tracking-tight text-k-text">{title}</span>
        {subtitle && <span className="text-xs text-k-muted">{subtitle}</span>}
      </div>

      {days.length === 0 ? (
        <p className="py-8 text-center text-sm text-k-muted">Commit activity isn&apos;t available right now.</p>
      ) : (
        <>
          <div className="overflow-x-auto pt-2.5 pb-2" onScroll={() => setHovered(null)} onPointerLeave={() => setHovered(null)}>
            <div className="relative mb-2 h-4 text-[11px] font-medium text-k-muted" style={{ width }} aria-hidden="true">
              {labels.map(({ label, week }) => (
                <span key={`${label}-${week}`} className="absolute top-0" style={{ left: week * (blockSize + blockGap) }}>
                  {label}
                </span>
              ))}
            </div>
            <div role="img" aria-label={summary} className="flex" style={{ gap: blockGap, width }}>
              {weeks.map((week, w) => (
                <div key={week.find(Boolean)?.date ?? w} className="flex flex-col" style={{ gap: blockGap }}>
                  {week.map((day, d) =>
                    day ? (
                      <span
                        key={day.date}
                        data-count={day.count}
                        onPointerEnter={(e) => show(day, e.currentTarget)}
                        style={{ width: blockSize, height: blockSize }}
                        className={cn(
                          "rounded-[3px] transition-transform duration-150",
                          !reduceMotion && "hover:z-20 hover:scale-125 hover:ring-1 hover:ring-white/50",
                          LEVEL_CLASSES[levelFor(day.count, max)],
                        )}
                      />
                    ) : (
                      <span key={`pad-${d}`} style={{ width: blockSize, height: blockSize }} />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {hovered && (
              <motion.div
                key="activity-tooltip"
                aria-hidden="true"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1, x: hovered.x, y: hovered.below ? hovered.y + blockSize + 8 : hovered.y - 8 }}
                exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12 } }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 32, mass: 0.5 }}
                style={{ left: 0, top: 0, translateX: "-50%", translateY: hovered.below ? "0%" : "-100%" }}
                className="pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-white/15 bg-zinc-900/95 px-3 py-1.5 text-xs font-medium text-white shadow-2xl backdrop-blur-md"
              >
                <span className="font-bold tabular-nums text-k-green">
                  {hovered.day.count} {hovered.day.count === 1 ? "commit" : "commits"}
                </span>
                <span className="text-zinc-400"> on </span>
                <span className="tabular-nums text-zinc-200">{formatDay(hovered.day.date)}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/6 pt-3 text-xs text-k-muted">
            <p>{summary}</p>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span>Less</span>
              {LEVEL_CLASSES.map((cls) => (
                <span key={cls} className={cn("rounded-[3px]", cls)} style={{ width: blockSize, height: blockSize }} />
              ))}
              <span>More</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default GitHubActivity;
