import { CircleQuestionMark } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { helpPage } from '@/content/help';
import { Sheet } from './Sheet';

/**
 * A small "?" for the label of a key number. It opens the help page's title and summary in a
 * `Sheet`, with a link to the full page. The glyph is 16px; the 14px of padding around it make the
 * 44px tap area, and the equal negative margin keeps that padding from growing the row. Put it
 * beside the label, never inside a button or link the number already has.
 */
export function HelpTip({ pageId, label }: { pageId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const page = helpPage(pageId);
  if (!page) return null;
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-label={`What is ${label}?`}
        onClick={() => setOpen(true)}
        className="text-muted hover:text-text -m-3.5 inline-flex flex-none p-3.5"
      >
        <CircleQuestionMark aria-hidden="true" className="size-4" />
      </button>
      <Sheet open={open} title={page.title} onClose={close}>
        {/* The sheet is already named by its title; this is the drawn copy of it. */}
        <p
          aria-hidden="true"
          className="text-[21px] leading-tight font-extrabold tracking-[-0.02em]"
        >
          {page.title}
        </p>
        <p className="text-muted mt-1.5 text-[15px] font-semibold">{page.summary}</p>
        <Link
          to={`/help/${pageId}`}
          onClick={close}
          className="mt-1 inline-flex min-h-11 items-center text-[15px] font-extrabold"
        >
          How it&apos;s worked out ›
        </Link>
      </Sheet>
    </>
  );
}
