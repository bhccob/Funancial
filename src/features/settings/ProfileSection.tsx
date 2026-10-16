import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import type { Profile } from '@/domain/entities';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions } from '@/store/useFinance';
import { CurrencyRow } from './CurrencyRow';

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

function ProfileForm({ profile }: { profile: Profile }) {
  const { updateProfile } = useFinanceActions();
  const run = useAction();
  const [name, setName] = useState(profile.name);
  const [salary, setSalary] = useState<number | null>(profile.salary?.monthlyAmount ?? null);
  const [payDay, setPayDay] = useState(String(profile.salary?.payDay ?? 25));
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await run(
      () =>
        updateProfile({
          name: name.trim(),
          salary: salary && salary > 0 ? { monthlyAmount: salary, payDay: Number(payDay) } : null,
        }),
      { success: 'Profile saved.' },
    );
    setBusy(false);
  }

  return (
    <form className="flex max-w-xl flex-col gap-5" onSubmit={submit} noValidate>
      <TextField
        label="Name"
        autoComplete="given-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <CurrencyRow current={profile.currency} />
      <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
        <MoneyField
          label="Monthly take-home pay"
          currency={profile.currency}
          value={salary}
          onChange={setSalary}
          hint="Leave empty if you don't have a regular salary."
        />
        <Select label="Pay day" value={payDay} onChange={setPayDay} options={DAY_OPTIONS} />
      </div>
      <Button type="submit" className="self-start" disabled={busy}>
        Save
      </Button>
    </form>
  );
}

export function ProfileSection() {
  const profile = useApp((s) => s.data.tables.profile[0]);
  if (!profile) return null;
  return (
    <Section title="Profile & salary">
      <ProfileForm profile={profile} />
    </Section>
  );
}
