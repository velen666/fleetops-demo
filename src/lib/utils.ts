import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Русская подпись счётчика без склейки фрагментов в шаблонах. */
export function ruCount(
  count: number,
  forms: readonly [singular: string, few: string, plural: string],
): string {
  const absolute = Math.abs(Math.trunc(count))
  const mod10 = absolute % 10
  const mod100 = absolute % 100
  const form =
    mod100 >= 11 && mod100 <= 14
      ? forms[2]
      : mod10 === 1
        ? forms[0]
        : mod10 >= 2 && mod10 <= 4
          ? forms[1]
          : forms[2]

  return `${count} ${form}`
}
