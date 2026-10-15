import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { getThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme';
import { usePlatform } from '@/platform/PlatformProvider';
import { useApp } from '@/store/AppStoreProvider';
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
    <Section title="Appearance">
      <RadioGroup
        legend="Theme"
        value={theme}
        options={THEMES}
        onChange={(t) => {
          setTheme(t);
          setThemePreference(t);
        }}
      />
    </Section>
  );
}

export function SettingsScreen() {
  const demo = useApp((s) => s.namespace === 'demo');
  const { notifier } = usePlatform();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" />
      {!demo && <ProfileSection />}
      <PreferencesSection />
      {notifier && <RemindersSection notifier={notifier} />}
      <AppearanceSection />
      <SecuritySection />
      <DataSection />
    </div>
  );
}
