import { RadioGroup } from '@/components/ui/RadioGroup';
import { Section } from '@/components/ui/Section';
import { limitMessage } from '@/domain/alerts';
import type { LimitStatus } from '@/domain/budget';
import type { Settings } from '@/domain/entities';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions } from '@/store/useFinance';

type Tone = Settings['warningTone'];

/** "Food at 85%", to show how each warning style sounds. */
const EXAMPLE: LimitStatus = {
  limit: {
    id: 'example',
    createdAt: '',
    updatedAt: '',
    scope: 'category',
    category: 'food',
    period: 'monthly',
    amount: 100_00,
    warnAt: [80, 100, 120],
    reserve: false,
    includeInvestments: false,
  },
  range: { start: '', end: '' },
  spent: 85_00,
  remaining: 15_00,
  pct: 85,
  level: 'warn',
};

export function PreferencesSection() {
  const settings = useApp((s) => s.data.tables.settings[0]);
  const { updateSettings } = useFinanceActions();
  const run = useAction();
  const tone: Tone = settings?.warningTone ?? 'motivational';
  const weekStartsOn = settings?.weekStartsOn ?? 1;

  return (
    <Section title="Preferences">
      <div className="flex max-w-xl flex-col gap-5">
        <RadioGroup<'1' | '0'>
          variant="underline"
          legend="Week starts on"
          value={weekStartsOn === 0 ? '0' : '1'}
          onChange={(v) => void run(() => updateSettings({ weekStartsOn: v === '0' ? 0 : 1 }))}
          options={[
            { value: '1', label: 'Monday' },
            { value: '0', label: 'Sunday' },
          ]}
        />
        <div className="flex flex-col gap-2">
          <RadioGroup<Tone>
            variant="underline"
            legend="Warning style"
            value={tone}
            onChange={(v) => void run(() => updateSettings({ warningTone: v }))}
            options={[
              { value: 'gentle', label: 'Gentle' },
              { value: 'motivational', label: 'Motivational' },
              { value: 'strict', label: 'Strict' },
            ]}
          />
          <div className="text-sm">
            <p className="text-muted text-xs font-semibold">
              Example{tone === 'strict' ? ' (strict also asks before you go over)' : ''}
            </p>
            <p className="font-semibold">{limitMessage(tone, EXAMPLE)}</p>
          </div>
        </div>
      </div>
    </Section>
  );
}
