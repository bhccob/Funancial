import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CodeField } from './CodeField';

function Field({
  initial = '',
  error,
  label,
}: {
  initial?: string;
  error?: string;
  label?: string;
}) {
  const [value, setValue] = useState(initial);
  return <CodeField value={value} onChange={setValue} error={error} label={label} />;
}

/** What the six boxes show, a digit or nothing each. */
const boxes = () =>
  [...document.querySelectorAll<HTMLElement>('[data-code-box]')].map((box) => box.textContent);

describe('CodeField', () => {
  it('is one numeric field for a one-time code, named Code, drawn as six boxes', () => {
    render(<Field />);
    const field = screen.getByLabelText('Code');
    expect(field.tagName).toBe('INPUT');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field).toHaveAttribute('maxlength', '6');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(boxes()).toEqual(['', '', '', '', '', '']);
    // The boxes are a picture of the field's value: a screen reader meets the field alone.
    for (const box of document.querySelectorAll('[data-code-box]')) {
      expect(box.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('takes another name where it is given one', () => {
    render(<Field label="Email code" />);
    expect(screen.getByLabelText('Email code')).toBeInTheDocument();
  });

  it('takes focus as it appears when asked to, and not otherwise', () => {
    const { unmount } = render(<Field />);
    expect(screen.getByLabelText('Code')).not.toHaveFocus();
    unmount();
    render(<CodeField value="" onChange={() => {}} autoFocus />);
    expect(screen.getByLabelText('Code')).toHaveFocus();
  });

  it('shows each typed digit in its own box, and keeps letters out', async () => {
    render(<Field />);
    await userEvent.type(screen.getByLabelText('Code'), '4a8 1');
    expect(screen.getByLabelText('Code')).toHaveValue('481');
    expect(boxes()).toEqual(['4', '8', '1', '', '', '']);
  });

  it('stops at six digits', async () => {
    render(<Field />);
    await userEvent.type(screen.getByLabelText('Code'), '12345678');
    expect(screen.getByLabelText('Code')).toHaveValue('123456');
    expect(boxes()).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it.each(['481 529', '481-529', ' 481529 ', 'Your code is 481 529.'])(
    'fills from a pasted %j, digits only',
    async (pasted) => {
      render(<Field />);
      await userEvent.click(screen.getByLabelText('Code'));
      await userEvent.paste(pasted);
      expect(screen.getByLabelText('Code')).toHaveValue('481529');
      expect(boxes()).toEqual(['4', '8', '1', '5', '2', '9']);
    },
  );

  it('puts a pasted whole code in place of one already there', async () => {
    render(<Field initial="123456" />);
    await userEvent.click(screen.getByLabelText('Code'));
    await userEvent.paste('481 529');
    expect(screen.getByLabelText('Code')).toHaveValue('481529');
  });

  it('adds pasted digits after the ones typed, up to six', async () => {
    render(<Field />);
    await userEvent.type(screen.getByLabelText('Code'), '48');
    await userEvent.paste('1 5');
    expect(screen.getByLabelText('Code')).toHaveValue('4815');
    await userEvent.paste('2999');
    expect(screen.getByLabelText('Code')).toHaveValue('481529');
  });

  describe('text the keyboard puts in whole', () => {
    /**
     * What a keyboard does with text no key press makes (Gboard's suggested "481 529" from the
     * clipboard): a `beforeinput` with all of it, before the browser cuts it to the field's six
     * characters ("481 52") for the `input` that follows.
     */
    function insertByKeyboard(data: string) {
      const field = screen.getByLabelText<HTMLInputElement>('Code');
      const event = new InputEvent('beforeinput', {
        data,
        inputType: 'insertText',
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(event);
      return event;
    }

    it('fits a spaced code the length would cut, digits only', () => {
      const onChange = vi.fn();
      render(<CodeField value="" onChange={onChange} />);
      const event = insertByKeyboard('481 529');
      expect(onChange).toHaveBeenLastCalledWith('481529');
      // Put in by the field, not left to the browser, which would keep "481 52".
      expect(event.defaultPrevented).toBe(true);
    });

    it('puts a whole code in place of one already there, and a few digits at the caret', async () => {
      render(<Field initial="123456" />);
      act(() => void insertByKeyboard('481-529'));
      expect(screen.getByLabelText('Code')).toHaveValue('481529');

      await userEvent.clear(screen.getByLabelText('Code'));
      await userEvent.type(screen.getByLabelText('Code'), '48');
      act(() => void insertByKeyboard('1 5'));
      expect(screen.getByLabelText('Code')).toHaveValue('4815');
    });

    it('leaves a key press, and a deletion, to the browser', () => {
      const onChange = vi.fn();
      render(<CodeField value="48" onChange={onChange} />);
      expect(insertByKeyboard('1').defaultPrevented).toBe(false);
      const field = screen.getByLabelText('Code');
      const deletion = new InputEvent('beforeinput', {
        inputType: 'deleteContentBackward',
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(deletion);
      expect(deletion.defaultPrevented).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it("keeps only digits from what fills it another way (the keyboard's suggested code)", () => {
    const onChange = vi.fn();
    render(<CodeField value="" onChange={onChange} />);
    const field = screen.getByLabelText<HTMLInputElement>('Code');
    // An autofill sets the value whole, past the length a key press would be held to.
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(field, '481 529');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith('481529');
  });

  it('says what is wrong under the boxes, and marks the field', () => {
    render(<Field error="That code isn't right. Check the email and try again." />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("That code isn't right. Check the email and try again.");
    const field = screen.getByLabelText('Code');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(
      "That code isn't right. Check the email and try again.",
    );
    // An edge in danger over each box's own (the glass draws its border and shadow, not an outline).
    for (const box of document.querySelectorAll('[data-code-box]')) {
      expect(box).toHaveClass('outline-1', 'outline-danger', '-outline-offset-1');
    }
  });

  it('marks the box the next digit goes in while the field has focus', async () => {
    render(<Field initial="48" />);
    const current = () =>
      [...document.querySelectorAll<HTMLElement>('[data-code-box]')].findIndex(
        (box) => box.dataset.codeBox === 'current',
      );
    expect(current()).toBe(2);
    await userEvent.type(screen.getByLabelText('Code'), '1529');
    // Full: the last box stays the one marked.
    expect(current()).toBe(5);
    // The mark shows only while the field has focus.
    expect(document.querySelector('[data-code-box="current"]')).toHaveClass(
      'group-focus-within:outline-2',
    );
  });

  it('is glass boxes of at least 44px, in tokens', () => {
    render(<Field />);
    for (const box of document.querySelectorAll('[data-code-box]')) {
      expect(box).toHaveClass('glass', 'h-14', 'rounded-[14px]');
    }
  });
});
