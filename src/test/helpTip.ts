import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { helpPage } from '@/content/help';

/**
 * The "?" named `What is ${label}?` inside `scope`: it stands beside its number (never inside a
 * button or link), opens the sheet for help page `pageId` with a link to it, and gives focus back.
 */
export async function expectHelpTip(scope: HTMLElement, label: string, pageId: string) {
  const tip = within(scope).getByRole('button', { name: `What is ${label}?` });
  expect(tip.parentElement?.closest('a, button')).toBeNull();
  await userEvent.click(tip);
  const sheet = screen.getByRole('dialog', { name: helpPage(pageId)!.title });
  expect(within(sheet).getByRole('link', { name: "How it's worked out ›" })).toHaveAttribute(
    'href',
    `/help/${pageId}`,
  );
  await userEvent.keyboard('{Escape}');
  expect(tip).toHaveFocus();
}
