import { SunMoon } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { IconRow } from '@/features/shared/IconRow';
import { PlainSection, ROWS } from '@/features/shared/PlainSection';
import { getThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme';
import { usePlatform } from '@/platform/PlatformProvider';
import { useApp } from '@/store/AppStoreProvider';
import { AccountSection } from './AccountSection';
import { DataSection } from './DataSection';
import { PreferencesSection } from './PreferencesSection';
import { ProfileSection } from './ProfileSection';
import { RemindersSection } from './RemindersSection';
import { SecuritySection } from './SecuritySection';

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function AppearanceSection() {
  const [theme, setTheme] = useState(getThemePreference);
  return (
    <PlainSection title="Appearance">
      <div className={ROWS}>
        <IconRow icon={SunMoon} top>
          <RadioGroup
            variant="pills"
            legend="Theme"
            value={theme}
            options={THEMES}
            onChange={(t) => {
              setTheme(t);
              setThemePreference(t);
            }}
          />
        </IconRow>
      </div>
    </PlainSection>
  );
}

export function SettingsScreen() {
  const demo = useApp((s) => s.namespace === 'demo');
  const { notifier } = usePlatform();
  return (
    <div className="max-w-xl">
      <PageHeader title="Settings" back />
      {!demo && <ProfileSection />}
      {!demo && <AccountSection />}
      <PreferencesSection />
      {/* Demo money never schedules reminders, so there is nothing to switch on. */}
      {notifier && !demo && <RemindersSection notifier={notifier} />}
      <AppearanceSection />
      <SecuritySection />
      <DataSection />
    </div>
  );
}
