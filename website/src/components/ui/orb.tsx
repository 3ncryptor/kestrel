"use client";

// Adapted from DevClub UI's orb for the Kestrel site: display only (its state comes from the page, never a click),
// and the canvas loads after hydration so it never blocks the first paint. thinking-orbs honours reduced motion
// and pauses off-screen on its own.
import dynamic from "next/dynamic";
import type { OrbState } from "thinking-orbs";
import { cn } from "@/lib/utils";

export type { OrbState };

const ThinkingOrb = dynamic(() => import("thinking-orbs").then((m) => m.ThinkingOrb), { ssr: false });

export interface OrbProps {
  state: OrbState;
  /** The canvas resolution the library draws at. */
  size?: 64 | 20;
  /** The size on screen, in CSS pixels (defaults to `size`). */
  display?: number;
  paused?: boolean;
  speed?: number;
  color?: string;
  className?: string;
}

export function Orb({ state, size = 64, display, paused = false, speed = 1, color, className }: OrbProps) {
  const px = display ?? size;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center select-none", className)}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <ThinkingOrb
        state={state}
        size={size}
        theme="dark"
        speed={speed}
        paused={paused}
        color={color}
        style={{ width: px, height: px, display: "block" }}
      />
    </span>
  );
}
