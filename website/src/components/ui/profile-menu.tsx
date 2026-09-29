"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export type ProfileMenuStatusItem = {
  text: string;
  icon?: ReactNode;
};

export type StatusInput = string | ProfileMenuStatusItem;

export type ProfileMenuItem = {
  name: string;
  icon?: ReactNode;
  shortcut?: string;
  badge?: ReactNode;
  active?: boolean;
  centered?: boolean;
  danger?: boolean;
  closeOnSelect?: boolean;
  onSelect?: () => void;
};

export type ProfileMenuSection = {
  label?: string;
  grid?: boolean;
  items: ProfileMenuItem[];
};

export interface ProfileMenuProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Adapted: a node (the Kestrel mark), never a remote image, so the site loads nothing from elsewhere. */
  avatar?: ReactNode;
  status?: StatusInput[];
  statusInterval?: number;
  sections?: ProfileMenuSection[];
  /** Adapted for the Kestrel site: a plain key (no modifier) that toggles the menu, ignored while typing. */
  shortcutKey?: string;
  /** The accessible name of the menu button. */
  label?: string;
  online?: boolean;
  id?: string;
  className?: string;
}

const STYLES = `
@keyframes pm-slide-in {
  0% {
    opacity: 0;
    transform: translateY(5px);
    filter: blur(2px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}
`;

export function ProfileMenu({
  title,
  avatar,
  status = [],
  statusInterval = 3600,
  sections = [],
  shortcutKey = "m",
  label = "Menu",
  online = true,
  id = "profile-command-menu",
  className,
}: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [selected, setSelected] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const rawStatuses = status;
  const statusItems: ProfileMenuStatusItem[] = rawStatuses.map((s) =>
    typeof s === "string" ? { text: s } : s,
  );

  const resolvedSections: ProfileMenuSection[] = sections;

  const items = resolvedSections.flatMap((s) => s.items);
  const itemsRef = useRef(items);
  const selectedRef = useRef(selected);

  useEffect(() => {
    itemsRef.current = items;
    selectedRef.current = selected;
  }, [items, selected]);

  useLayoutEffect(() => {
    const hl = highlightRef.current;
    if (!hl) return;
    if (!isOpen || selected < 0) {
      hl.style.opacity = "0";
      return;
    }
    const element = itemRefs.current[selected];
    if (!element) return;
    hl.style.transform = `translate3d(${element.offsetLeft}px, ${element.offsetTop}px, 0)`;
    hl.style.width = `${element.offsetWidth}px`;
    hl.style.height = `${element.offsetHeight}px`;
    hl.style.opacity = "1";
  }, [isOpen, selected]);

  useEffect(() => {
    if (isOpen || statusItems.length < 2) return;
    const interval = setInterval(() => {
      if (!document.hidden) {
        setStatusIndex((prev) => (prev + 1) % statusItems.length);
      }
    }, statusInterval);
    return () => clearInterval(interval);
  }, [isOpen, statusItems.length, statusInterval]);

  const toggleMenu = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setSelected(0);
    setIsOpen((prev) => {
      const next = !prev;
      setIsPinned(next);
      return next;
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (!isOpen) {
      setSelected(0);
      setIsOpen(true);
    }
  }, [isOpen]);

  const handleMouseLeave = useCallback(() => {
    if (isPinned) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  }, [isPinned]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const typing = target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']"));
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === shortcutKey.toLowerCase()) {
        event.preventDefault();
        toggleMenu();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shortcutKey, toggleMenu]);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      const count = itemsRef.current.length;
      if (count === 0) return;

      const move = (delta: number) => {
        setSelected((prev) => (prev + delta + count) % count);
      };

      switch (event.key) {
        case "ArrowUp":
        case "k":
          event.preventDefault();
          move(-1);
          break;
        case "ArrowDown":
        case "j":
          event.preventDefault();
          move(1);
          break;
        case "Enter": {
          event.preventDefault();
          const target = itemsRef.current[selectedRef.current];
          if (target) {
            target.onSelect?.();
            if (target.closeOnSelect) {
              setIsOpen(false);
              setIsPinned(false);
            }
          }
          break;
        }
        case "Escape":
          event.preventDefault();
          setIsOpen(false);
          setIsPinned(false);
          triggerRef.current?.focus();
          break;
      }
    }

    function onClickOutside(event: MouseEvent) {
      if (!(event.target instanceof Element) || !event.target.closest(`#${id}`)) {
        setIsOpen(false);
        setIsPinned(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", onClickOutside);
    };
  }, [isOpen, id]);

  const currentStatus = statusItems[statusIndex];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only previews the menu; the button below is the real control
    <div
      id={id}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative w-90 max-w-[calc(100vw-2rem)] rounded-2xl select-none",
        "bg-background/95 dark:bg-zinc-950/90 text-foreground backdrop-blur-2xl",
        "border border-border/80 dark:border-white/10",
        "transition-shadow duration-300",
        isOpen
          ? "shadow-2xl shadow-black/10 dark:shadow-black/50"
          : "shadow-lg shadow-black/5 dark:shadow-black/30",
        className,
      )}
    >
      <style>{STYLES}</style>

      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        aria-label={label}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={`${id}-menu`}
        className="flex w-full items-center gap-3 p-2.5 cursor-pointer text-left select-none group"
      >
        <div className="relative shrink-0">
          {avatar}
          {online && (
            <span className="absolute bottom-0 right-0 flex size-2.5 items-center justify-center">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500 ring-2 ring-background dark:ring-zinc-950" />
            </span>
          )}
        </div>

        <div className="flex flex-1 min-w-0 flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans font-medium text-xs sm:text-sm text-foreground truncate">
              {title}
            </span>
          </div>

          {currentStatus && (
            <div className="relative h-4 overflow-hidden text-[11px] font-sans text-muted-foreground mt-0.5">
              <div
                key={statusIndex}
                style={{ animation: "pm-slide-in 0.3s ease-out backwards" }}
                className="absolute inset-0 flex items-center gap-1.5 truncate text-muted-foreground"
              >
                {currentStatus.icon && (
                  <span className="shrink-0 size-3 text-muted-foreground/80 flex items-center justify-center">
                    {currentStatus.icon}
                  </span>
                )}
                <span className="truncate">{currentStatus.text}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 pl-1">
          <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-border/70 bg-muted/60 text-[10px] font-mono text-muted-foreground">
            {shortcutKey}
          </kbd>
          <span
            className={cn(
              "text-muted-foreground/60 transition-transform duration-300 flex items-center justify-center size-4",
              isOpen && "rotate-180 text-foreground",
            )}
          >
            <ChevronDownIcon />
          </span>
        </div>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isOpen
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0 pointer-events-none",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              isOpen ? "translate-y-0" : "-translate-y-1.5",
            )}
          >
            <div className="mx-2.5 mb-1.5 h-px bg-border/60 dark:bg-white/10" />

            <div
              ref={panelRef}
              id={`${id}-menu`}
              role="menu"
              aria-label={label}
              aria-hidden={!isOpen}
              inert={!isOpen}
              className="relative flex flex-col gap-1 p-2 pt-0"
            >
              <div
                ref={highlightRef}
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0 rounded-xl bg-foreground/6 dark:bg-white/10 z-0 opacity-0 transition-[transform,width,height,opacity] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]"
              />

              {resolvedSections.map((section, sIdx) => (
                // biome-ignore lint/a11y/useSemanticElements: a group of menu items (ARIA menu pattern), not form fields
                <div key={section.label || sIdx} role="group" aria-label={section.label} className="space-y-1">
                  {sIdx > 0 && (
                    <div className="my-1.5 mx-1 h-px bg-border/40 dark:bg-white/5" />
                  )}
                  {section.label && (
                    <span aria-hidden="true" className="block px-2.5 pt-1 text-[10px] font-sans font-medium uppercase tracking-wider text-zinc-400 select-none">
                      {section.label}
                    </span>
                  )}
                  <div
                    className={
                      section.grid ? "grid grid-cols-3 gap-1.5" : "space-y-0.5"
                    }
                  >
                    {section.items.map((item) => {
                      const index = items.indexOf(item);
                      return (
                        <button
                          key={item.name}
                          ref={(node) => {
                            itemRefs.current[index] = node;
                          }}
                          type="button"
                          role="menuitem"
                          tabIndex={isOpen && index === selected ? 0 : -1}
                          onMouseEnter={() => setSelected(index)}
                          onClick={(e) => {
                            e.stopPropagation();
                            item.onSelect?.();
                            if (item.closeOnSelect) {
                              setIsOpen(false);
                              setIsPinned(false);
                            }
                          }}
                          className={cn(
                            "relative z-10 flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-sans transition-colors",
                            item.centered
                              ? "justify-center"
                              : "justify-between",
                            item.active
                              ? "text-foreground font-medium ring-1 ring-border/80 dark:ring-white/20 bg-foreground/5 dark:bg-white/5"
                              : "text-muted-foreground hover:text-foreground",
                            item.danger &&
                              "text-rose-500 dark:text-rose-400 hover:text-rose-600",
                          )}
                        >
                          <div
                            className={cn(
                              "flex items-center gap-2.5 min-w-0",
                              item.centered && "flex-col gap-1 py-0.5",
                            )}
                          >
                            {item.icon && (
                              <span className="shrink-0 size-4 flex items-center justify-center text-muted-foreground group-hover:text-foreground">
                                {item.icon}
                              </span>
                            )}
                            <span className="truncate">{item.name}</span>
                          </div>

                          {item.shortcut && !item.centered && (
                            <kbd className="font-mono text-[10px] text-muted-foreground/60 px-1 py-0.5 rounded bg-muted/40">
                              {item.shortcut}
                            </kbd>
                          )}

                          {item.badge && !item.centered && (
                            <span className="shrink-0 flex items-center">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className={cn("size-3.5", className)}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m19.5 8.25-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}
