"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "@radix-ui/react-icons";

export interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "shimmer";
  showArrow?: boolean;
}

type Variant = NonNullable<AnimatedButtonProps["variant"]>;

/** The button's classes, shared with AnimatedLink (a link styled the same way). */
export function animatedButtonClasses(variant: Variant, className?: string) {
  return cn(
    "group relative inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs font-medium tracking-wide transition-all duration-200 cursor-pointer select-none overflow-hidden ease-[cubic-bezier(0.16,1,0.3,1)]",
    variant === "primary" &&
      "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:font-medium dark:hover:bg-zinc-200 active:scale-[0.96] shadow-sm",
    variant === "secondary" &&
      "bg-zinc-100 border border-zinc-200 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-900 dark:border-white/15 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:hover:border-white/30 active:scale-[0.96]",
    variant === "outline" &&
      "border border-zinc-300 text-zinc-700 hover:border-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/20 dark:text-zinc-300 dark:hover:border-white/50 dark:hover:bg-white/5 dark:hover:text-white active:scale-[0.96]",
    variant === "shimmer" &&
      "border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500 dark:border-white/20 dark:bg-black dark:text-zinc-100 dark:hover:border-white/50 active:scale-[0.96]",
    className,
  );
}

function Content({ variant, showArrow, children }: { variant: Variant; showArrow: boolean; children: React.ReactNode }) {
  return (
    <>
      {variant === "shimmer" && (
        <span className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.08),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)] pointer-events-none" />
      )}
      <span className="relative z-10 flex items-center gap-2">
        {children}
        {showArrow && (
          <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1" />
        )}
      </span>
    </>
  );
}

export interface AnimatedLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  showArrow?: boolean;
}

/** AnimatedButton's look on a link (a button inside a link is invalid HTML). */
export const AnimatedLink = React.forwardRef<HTMLAnchorElement, AnimatedLinkProps>(
  ({ className, children, variant = "primary", showArrow = false, ...props }, ref) => (
    <a ref={ref} className={animatedButtonClasses(variant, className)} {...props}>
      <Content variant={variant} showArrow={showArrow}>{children}</Content>
    </a>
  ),
);

AnimatedLink.displayName = "AnimatedLink";

export const AnimatedButton = React.forwardRef<
  HTMLButtonElement,
  AnimatedButtonProps
>(
  (
    { className, children, variant = "primary", showArrow = false, ...props },
    ref,
  ) => {
    return (
      <button ref={ref} className={animatedButtonClasses(variant, className)} {...props}>
        <Content variant={variant} showArrow={showArrow}>{children}</Content>
      </button>
    );
  },
);

AnimatedButton.displayName = "AnimatedButton";
