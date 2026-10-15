import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Switch } from '@/components/ui/Switch';
import { defaultSettings, type AutoLockMinutes } from '@/domain/entities';
import { nowIso } from '@/domain/ids';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { SecretDialog, type LockTarget } from './SecretDialog';

const LOCK_OPTIONS: Array<{ value: LockTarget; label: string }> = [
  { value: 'none', label: 'No lock' },
  { value: 'pin', label: 'PIN' },
  { value: 'passphrase', label: 'Passphrase' },
];

const AUTO_LOCK: Array<{ value: AutoLockMinutes; label: string }> = [
  { value: 0, label: 'Never' },
  { value: 1, label: '1 minute' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
];

export function SecuritySection() {
  const namespace = useApp((s) => s.namespace);
  const lockMode = useApp((s) => s.lockMode) ?? 'device';
  const settings = useApp((s) => s.data.tables.settings[0]);
  const put = useApp((s) => s.put);
  const biometric = useApp((s) => s.biometric);
  const enableBiometric = useApp((s) => s.enableBiometric);
  const disableBiometric = useApp((s) => s.disableBiometric);
  const run = useAction();
  const [target, setTarget] = useState<LockTarget | null>(null);
  const autoLockId = useId();

  const current: LockTarget = lockMode === 'device' ? 'none' : lockMode;

  if (namespace === 'demo') {
    return (
      <Section title="Security">
        <p className="text-muted">Demo data isn't locked.</p>
      </Section>
    );
  }

  const saveAutoLock = (minutes: AutoLockMinutes) => {
    const now = nowIso();
    void put('settings', {
      ...(settings ?? defaultSettings(now)),
      autoLockMinutes: minutes,
      updatedAt: now,
    });
  };

  return (
    <Section title="Security">
      <RadioGroup
        legend="Lock method"
        value={current}
        options={LOCK_OPTIONS}
        onChange={(v) => v !== current && setTarget(v)}
      />
      {lockMode === 'pin' && (
        <p className="text-muted text-sm">
          A PIN keeps casual snoopers out. For stronger protection, use a passphrase.
        </p>
      )}
      {lockMode !== 'device' && (
        <div className="flex flex-wrap items-end gap-4">
          <Button variant="secondary" size="sm" onClick={() => setTarget(lockMode)}>
            {lockMode === 'pin' ? 'Change PIN' : 'Change passphrase'}
          </Button>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={autoLockId} className="text-sm font-bold">
              Auto-lock
            </label>
            <select
              id={autoLockId}
              value={settings?.autoLockMinutes ?? 5}
              onChange={(e) => saveAutoLock(Number(e.target.value) as AutoLockMinutes)}
              className="border-border-strong bg-surface h-11 rounded-md border-2 px-3"
            >
              {AUTO_LOCK.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {lockMode !== 'device' && biometric !== 'unavailable' && (
        <Switch
          label="Unlock with fingerprint or face"
          hint={`Your ${lockMode === 'pin' ? 'PIN' : 'passphrase'} still works if this fails.`}
          checked={biometric === 'on'}
          onChange={(on) => void run(on ? enableBiometric : disableBiometric)}
        />
      )}
      <SecretDialog target={target} current={lockMode} onClose={() => setTarget(null)} />
    </Section>
  );
}
