"use client";

// Adapted from DevClub UI's spotlight-search for the Kestrel site:
// - the filters and the ranking come from the caller (the site's own groups and lib/search.ts), not a demo list;
// - the geometry scales with `width` and `height`, so the bar can be macOS-Spotlight sized;
// - the combobox pattern (listbox, options, aria-activedescendant, a live result count), and instant motion under
//   reduced motion.
import { AnimatePresence, motion, type Transition, useReducedMotion } from "motion/react";
import { type ChangeEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SpotlightFilter {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface SpotlightItem {
  id: string;
  title: string;
  category: string;
  subtitle?: string;
  /** Shown at the right of a result: a key, or where it goes. */
  hint?: string;
  /** Titles set in monospace (commands, keys). */
  mono?: boolean;
}

export interface SpotlightSearchProps {
  items: SpotlightItem[];
  filters: SpotlightFilter[];
  /** Ranks the items for a query (already narrowed to the active filter). */
  rank: (items: SpotlightItem[], query: string) => SpotlightItem[];
  onSelect: (item: SpotlightItem) => void;
  placeholder?: string;
  /** The bar's full width and its height, in px. */
  width?: number;
  height?: number;
  autoFocus?: boolean;
  className?: string;
}

const INSTANT: Transition = { duration: 0 };
const fluidSpring: Transition = { type: "spring", stiffness: 170, damping: 24, mass: 1.0 };
const microSpring: Transition = { type: "spring", stiffness: 380, damping: 26, mass: 0.8 };
/** The space between the bar and its first bubble, and between bubbles. */
const GAP = 10;
const MAX_RESULTS = 8;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7.5" />
      <path d="m20.5 20.5-4.2-4.2" />
    </svg>
  );
}

export function SpotlightSearch({ items, filters, rank, onSelect, placeholder = "Spotlight Search", width = 640, height = 56, autoFocus = false, className }: SpotlightSearchProps) {
  const uid = useId().replace(/:/g, "");
  const filterId = `spotlight-gooey-${uid}`;
  const listId = `spotlight-results-${uid}`;
  const optionId = (index: number) => `spotlight-option-${uid}-${index}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const spring = reduceMotion ? INSTANT : fluidSpring;
  const micro = reduceMotion ? INSTANT : microSpring;

  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [hoveredButtonId, setHoveredButtonId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [currentFilter, setCurrentFilter] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // The bar gives up one bubble's width (plus a gap) per filter when it opens.
  const step = height + GAP;
  const expandedWidth = width - filters.length * step;
  const bubbleX = (index: number) => expandedWidth + GAP + index * step;
  const isExpanded = isHovered || isFocused || query.length > 0;

  const results = useMemo(() => {
    const scoped = currentFilter ? items.filter((item) => item.category === currentFilter) : items;
    if (!query.trim()) return currentFilter ? scoped.slice(0, MAX_RESULTS) : [];
    return rank(scoped, query).slice(0, MAX_RESULTS);
  }, [items, currentFilter, query, rank]);

  const safeIndex = results.length > 0 ? Math.min(Math.max(0, highlightedIndex), results.length - 1) : 0;
  const resultsOpen = isFocused && (query.trim().length > 0 || currentFilter !== null);
  const activeOption = resultsOpen && results.length > 0 ? optionId(safeIndex) : undefined;

  useEffect(() => {
    if (activeOption) document.getElementById(activeOption)?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setHighlightedIndex(0);
  };

  const handleFilterToggle = (id: string) => {
    setCurrentFilter((current) => (current === id ? null : id));
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((prev) => (prev + delta + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = results[safeIndex];
      if (selected) onSelect(selected);
    }
  };

  const activeFilter = filters.find((f) => f.id === currentFilter);
  const surface = "bg-[#1c1c1f]/85 backdrop-blur-2xl border border-white/12 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_1.5px_rgba(255,255,255,0.12)]";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only changes the look; focus and keys work without it
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredButtonId(null);
      }}
      className={cn("relative flex flex-col items-center select-none", className)}
      style={{ width }}
    >
      <svg width="0" height="0" className="pointer-events-none absolute -z-10 overflow-hidden opacity-0" aria-hidden="true">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5.5" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
          </filter>
        </defs>
      </svg>

      <div className="relative w-full overflow-visible" style={{ height }}>
        {/* The gooey layer: the bar and its bubbles melt into each other as they part. */}
        <div className="pointer-events-none absolute inset-0 overflow-visible" style={{ filter: `url(#${filterId})` }}>
          <motion.div initial={false} animate={{ width: isExpanded ? expandedWidth : width }} transition={spring} className="absolute top-0 left-0 rounded-full bg-[#1c1c1f]" style={{ height }} />
          {filters.map((f, idx) => (
            <motion.div
              key={`blob-${f.id}`}
              initial={false}
              animate={{ x: isExpanded ? bubbleX(idx) : expandedWidth, scale: isExpanded ? 1 : 0.3, opacity: isExpanded ? 1 : 0 }}
              transition={{ ...spring, delay: reduceMotion ? 0 : isExpanded ? idx * 0.035 : (filters.length - 1 - idx) * 0.025 }}
              className="absolute top-0 left-0 rounded-full bg-[#1c1c1f]"
              style={{ width: height, height }}
            />
          ))}
        </div>

        <motion.div
          initial={false}
          animate={{ width: isExpanded ? expandedWidth : width }}
          transition={spring}
          onClick={() => inputRef.current?.focus()}
          className={cn("absolute top-0 left-0 flex cursor-text items-center rounded-full px-5 transition-colors", surface, isFocused && "border-white/25")}
          style={{ height }}
        >
          <span className="mr-3 flex shrink-0 items-center justify-center text-zinc-400">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            // biome-ignore lint/a11y/noAutofocus: only set by the search dialog, which the user just opened
            autoFocus={autoFocus}
            type="text"
            role="combobox"
            aria-label={placeholder}
            aria-expanded={resultsOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOption}
            value={query}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={activeFilter ? `Search ${activeFilter.label}` : placeholder}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent font-normal text-xl text-zinc-100 caret-white outline-none placeholder:text-zinc-500"
          />
          {activeFilter && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleFilterToggle(activeFilter.id);
              }}
              aria-label={`Clear the ${activeFilter.label} filter`}
              className="ml-2 shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[11px] text-zinc-300 uppercase transition-colors hover:bg-white/20"
            >
              {activeFilter.label}
            </button>
          )}
        </motion.div>

        {filters.map((f, idx) => {
          const isActive = currentFilter === f.id;
          return (
            <motion.div
              key={f.id}
              initial={false}
              animate={{ x: isExpanded ? bubbleX(idx) : expandedWidth, scale: isExpanded ? 1 : 0.3, opacity: isExpanded ? 1 : 0, pointerEvents: isExpanded ? "auto" : "none" }}
              transition={{
                ...spring,
                delay: reduceMotion ? 0 : isExpanded ? idx * 0.035 : (filters.length - 1 - idx) * 0.025,
                opacity: { duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : isExpanded ? 0.05 + idx * 0.035 : 0 },
              }}
              className="absolute top-0 left-0"
              style={{ width: height, height }}
            >
              <motion.button
                type="button"
                whileHover={reduceMotion ? undefined : { scale: 1.08 }}
                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                transition={micro}
                onMouseEnter={() => setHoveredButtonId(f.id)}
                onMouseLeave={() => setHoveredButtonId(null)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleFilterToggle(f.id)}
                aria-label={`Only ${f.label}`}
                aria-pressed={isActive}
                className={cn(
                  "flex h-full w-full cursor-pointer items-center justify-center rounded-full transition-colors",
                  surface,
                  isActive ? "border-white/40 bg-white/20 text-white" : "text-zinc-400 hover:border-white/25 hover:text-white",
                )}
              >
                {f.icon}
              </motion.button>
              <AnimatePresence>
                {hoveredButtonId === f.id && isExpanded && (
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.9 }}
                    transition={micro}
                    className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/90 px-2 py-0.5 font-medium text-[10px] text-zinc-200 shadow-lg"
                  >
                    {f.label}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite">
        {resultsOpen ? `${results.length} ${results.length === 1 ? "result" : "results"}` : ""}
      </p>
      <AnimatePresence>
        {resultsOpen && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 10, scale: 1 }}
            exit={reduceMotion ? { opacity: 0, transition: INSTANT } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={spring}
            className={cn("absolute inset-x-0 top-full z-40 flex flex-col gap-1 overflow-hidden rounded-3xl p-2", surface, "bg-[#141416]/92")}
          >
            {results.length === 0 ? (
              <div className="py-6 text-center text-sm text-zinc-500">No results for “{query.trim()}”</div>
            ) : (
              <div id={listId} role="listbox" aria-label="Results" data-lenis-prevent className="flex max-h-[min(400px,55vh)] flex-col gap-0.5 overflow-y-auto">
                {results.map((item, idx) => {
                  const isHighlighted = idx === safeIndex;
                  const filter = filters.find((f) => f.id === item.category);
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input handles the keys (arrows and Enter)
                    <div
                      key={item.id}
                      id={optionId(idx)}
                      role="option"
                      aria-selected={isHighlighted}
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => setHighlightedIndex(idx)}
                      onClick={() => onSelect(item)}
                      className={cn("flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left", isHighlighted ? "bg-white/10 text-white" : "text-zinc-300")}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 [&_svg]:size-4">{filter?.icon}</span>
                        <div className="flex min-w-0 flex-col">
                          <span className={cn("truncate font-medium text-sm text-zinc-100", item.mono && "font-mono")}>{item.title}</span>
                          {item.subtitle && <span className="truncate text-xs text-zinc-500">{item.subtitle}</span>}
                        </div>
                      </div>
                      {item.hint && <span className="ml-2 hidden shrink-0 rounded-md border border-white/5 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:block">{item.hint}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
