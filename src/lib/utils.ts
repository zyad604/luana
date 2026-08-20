import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function baseName(p: string) {
  return p.split(/[/\\]/).filter(Boolean).pop() || p;
}
