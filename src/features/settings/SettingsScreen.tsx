import { useState } from 'react';
import { Section } from '@/components/ui/Section';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { getThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme';
import { DataSection } from './DataSection';
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
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
      <AppearanceSection />
      <SecuritySection />
      <DataSection />
    </div>
  );
}
