import { useId, useState } from 'react';
import { Card } from '@/components/ui/Card';
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
  const headingId = useId();
  return (
    <Card as="section" aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="font-display text-xl font-semibold">
        Appearance
      </h2>
      <RadioGroup
        legend="Theme"
        value={theme}
        options={THEMES}
        onChange={(t) => {
          setTheme(t);
          setThemePreference(t);
        }}
      />
    </Card>
  );
}

export function SettingsScreen() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold">Settings</h1>
      <AppearanceSection />
      <SecuritySection />
      <DataSection />
    </div>
  );
}
