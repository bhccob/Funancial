import { useEffect, useId, useRef, useState } from 'react';
import { lineLabel } from '@/components/ui/lineField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import type { Category } from '@/domain/entities';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import { cn } from '@/lib/cn';
import { formatDay } from '@/lib/format';
import { useApp, useAppStore } from '@/store/AppStoreProvider';
import type { AboutPatch } from '@/store/buyActions';
import { useAboutYou, useBuyActions } from '@/store/useBuy';
import { useMoney } from '@/store/useFinance';

const NONE = { value: '', label: 'None' };

type Field = keyof AboutPatch;

/**
 * What the buy check knows about the person: what matters to them, the categories they overspend on,
 * a goal to protect and their situation. It stays on the phone, and every ask reads it. A change
 * is saved as it is made (a chip or the goal at once, a text when its field is left), one field
 * at a time, so a text that is too long holds back only itself.
 */
export function AboutYouScreen() {
  const store = useAppStore();
  const about = useAboutYou();
  const actions = useBuyActions();
  const money = useMoney();
  const goals = useApp((s) => s.data.tables.goal);
  const overspendErrorId = useId();

  // Typed here and saved when the field is left; the record is only made by the first change.
  const [matters, setMatters] = useState(about?.matters ?? '');
  const [situation, setSituation] = useState(about?.situation ?? '');
  const [overspend, setOverspend] = useState<Category[]>(about?.overspend ?? []);
  const [goalId, setGoalId] = useState(about?.protectGoalId ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saved, setSaved] = useState(false);
  // What is typed in each text and not yet handed to a save, or null when it was not changed since:
  // only that is saved on leaving the field or the screen, so a text never touched cannot overwrite
  // what another tab saved meanwhile, and one already on its way is not saved a second time.
  const pending = useRef<Record<'matters' | 'situation', string | null>>({
    matters: null,
    situation: null,
  });
  const flush = useRef(() => {});

  // A goal deleted since it was picked reads as None, and the next save lets go of it.
  const goalGone = about?.protectGoalId != null && !goals.some((g) => g.id === about.protectGoalId);
  const shownGoal = goals.some((g) => g.id === goalId) ? goalId : '';
  // Saved says so only while nothing on the screen is wrong.
  const allSaved = saved && !Object.values(errors).some(Boolean);

  function edited(field: Field) {
    setSaved(false);
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function save(field: Field, patch: AboutPatch) {
    edited(field);
    try {
      // The goal the person has now, not null: a pick still being saved must not be undone.
      await actions.saveAbout({
        ...(goalGone ? { protectGoalId: shownGoal || null } : {}),
        ...patch,
      });
      setSaved(true);
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'Something went wrong.';
      setErrors((prev) => ({ ...prev, [field]: message }));
      if (field === 'overspend' || field === 'protectGoalId') {
        // A chip or goal that did not save goes back to what is stored.
        const stored = store.getState().data.tables.aboutYou[0];
        setOverspend(stored?.overspend ?? []);
        setGoalId(stored?.protectGoalId ?? '');
      }
    }
  }

  /** Saves a text on leaving its field, if it was changed and is not what is already saved. */
  function leave(field: 'matters' | 'situation', text: string, set: (text: string) => void) {
    if (pending.current[field] === null) return;
    pending.current[field] = null;
    const value = text.trim();
    set(value);
    if (value !== (about?.[field] ?? '')) void save(field, { [field]: value });
  }

  function toggle(category: Category) {
    const next = overspend.includes(category)
      ? overspend.filter((c) => c !== category)
      : [...overspend, category];
    setOverspend(next);
    void save('overspend', { overspend: next });
  }

  // Back on a phone can hide the keyboard without leaving the field, and React does not blur a
  // field it removes, so what is typed is saved here too, the same way.
  useEffect(() => {
    flush.current = () => {
      for (const field of ['matters', 'situation'] as const) {
        const text = pending.current[field];
        if (text === null) continue;
        pending.current[field] = null;
        const value = text.trim();
        if (value !== (store.getState().data.tables.aboutYou[0]?.[field] ?? '')) {
          void save(field, { [field]: value });
        }
      }
    };
  });
  useEffect(() => () => flush.current(), []);

  const goalOptions = [
    NONE,
    ...goals.map((g) => ({
      value: g.id,
      label: `${g.name} · ${money(g.target)}${g.deadline ? ` by ${formatDay(g.deadline)}` : ''}`,
    })),
  ];

  return (
    <div className="max-w-xl">
      <PageHeader title="About you">
        The app uses this every time you ask. It stays on your phone.
      </PageHeader>
      <Section>
        <div className="flex flex-col gap-5">
          <TextField
            variant="line"
            label="What matters to you"
            value={matters}
            error={errors.matters}
            autoComplete="off"
            onChange={(e) => {
              setMatters(e.target.value);
              pending.current.matters = e.target.value;
              edited('matters');
            }}
            onBlur={() => leave('matters', matters, setMatters)}
          />

          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={errors.overspend ? overspendErrorId : undefined}
          >
            <legend className={cn(lineLabel, 'mb-0.5')}>Where you tend to overspend</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((o) => {
                const on = overspend.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(o.value)}
                    className={cn(
                      'min-h-11 rounded-full border px-4 text-sm font-bold',
                      on
                        ? 'bg-primary text-primary-contrast border-transparent'
                        : 'border-border-strong text-muted hover:text-text',
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {errors.overspend && (
              <p id={overspendErrorId} role="alert" className="text-danger text-sm font-semibold">
                {errors.overspend}
              </p>
            )}
          </fieldset>

          <Select
            variant="line"
            label="A goal to protect"
            value={shownGoal}
            options={goalOptions}
            error={errors.protectGoalId}
            onChange={(v) => {
              setGoalId(v);
              void save('protectGoalId', { protectGoalId: v || null });
            }}
          />

          <TextField
            variant="line"
            label="Your situation (optional)"
            value={situation}
            error={errors.situation}
            autoComplete="off"
            onChange={(e) => {
              setSituation(e.target.value);
              pending.current.situation = e.target.value;
              edited('situation');
            }}
            onBlur={() => leave('situation', situation, setSituation)}
          />

          <p role="status" className="text-muted min-h-5 text-sm font-bold">
            {allSaved ? 'Saved' : ''}
          </p>
        </div>

        <p className="text-muted mt-3 text-sm font-semibold">
          Asking about something in a category you overspend on lowers the meter a little and
          reminds you. Your goal to protect always shows first, and delaying it more than a week
          lowers the meter too. What matters to you is shown back on every answer.
        </p>
      </Section>
    </div>
  );
}
