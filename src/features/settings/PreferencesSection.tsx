import { CalendarDays, TriangleAlert } from 'lucide-react';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { limitMessage } from '@/domain/alerts';
import type { LimitStatus } from '@/domain/budget';
import type { Settings } from '@/domain/entities';
import { IconRow, ROW_SUB } from '@/features/shared/IconRow';
import { PlainSection, ROWS } from '@/features/shared/PlainSection';
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
    <PlainSection title="Preferences">
      <div className={ROWS}>
        <IconRow icon={CalendarDays} top>
          <RadioGroup<'1' | '0'>
            variant="pills"
            legend="Week starts on"
            value={weekStartsOn === 0 ? '0' : '1'}
            onChange={(v) => void run(() => updateSettings({ weekStartsOn: v === '0' ? 0 : 1 }))}
            options={[
              { value: '1', label: 'Monday' },
              { value: '0', label: 'Sunday' },
            ]}
          />
        </IconRow>
        <IconRow icon={TriangleAlert} top>
          <div className="flex flex-col gap-2">
            <RadioGroup<Tone>
              variant="pills"
              legend="Warning style"
              value={tone}
              onChange={(v) => void run(() => updateSettings({ warningTone: v }))}
              options={[
                { value: 'gentle', label: 'Gentle' },
                { value: 'motivational', label: 'Motivational' },
                { value: 'strict', label: 'Strict' },
              ]}
            />
            <div>
              <p className={ROW_SUB}>
                Example{tone === 'strict' ? ' (strict also asks before you go over)' : ''}
              </p>
              <p className="text-sm font-semibold">{limitMessage(tone, EXAMPLE)}</p>
            </div>
          </div>
        </IconRow>
      </div>
    </PlainSection>
  );
}
