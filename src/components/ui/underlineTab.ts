import { cn } from '@/lib/cn';

/** One underline tab: muted, or ink with a 2px line under it when it is the choice. 44px tall. */
export const underlineTab = (on: boolean) =>
  cn(
    'flex min-h-11 items-center border-b-2 px-0.5 text-sm font-extrabold',
    on ? 'border-text text-text' : 'text-muted border-transparent',
  );
