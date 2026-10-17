import { cn } from '@/lib/cn';

/** One underline tab: muted, or ink with a 2px line under it when it is the choice. At least 44px tall and wide, its label centred. */
export const underlineTab = (on: boolean) =>
  cn(
    'flex min-h-11 min-w-11 items-center justify-center border-b-2 text-sm font-extrabold',
    on ? 'border-text text-text' : 'text-muted border-transparent',
  );
