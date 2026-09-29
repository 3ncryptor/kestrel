import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves conflicting Tailwind classes (the last one wins). */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
