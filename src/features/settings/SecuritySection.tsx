import { Fingerprint, Lock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { defaultSettings, type AutoLockMinutes } from '@/domain/entities';
import { nowIso } from '@/domain/ids';
import { IconRow, UNDER_TITLE } from '@/features/shared/IconRow';
import { EmptyRows, PlainSection, ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
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

  const current: LockTarget = lockMode === 'device' ? 'none' : lockMode;

  if (namespace === 'demo') {
    return (
      <PlainSection title="Security">
        <EmptyRows>Demo data isn't locked.</EmptyRows>
      </PlainSection>
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
    <PlainSection title="Security">
      <div className={ROWS}>
        <IconRow icon={Lock} top>
          <RadioGroup
            variant="pills"
            legend="Lock method"
            value={current}
            options={LOCK_OPTIONS}
            onChange={(v) => v !== current && setTarget(v)}
          />
          {lockMode === 'pin' && (
            <p className="text-muted mt-2 text-sm">
              A PIN keeps casual snoopers out. For stronger protection, use a passphrase.
            </p>
          )}
        </IconRow>
        {lockMode !== 'device' && (
          <>
            <div className={cn('py-3', UNDER_TITLE)}>
              <Button variant="secondary" size="sm" onClick={() => setTarget(lockMode)}>
                {lockMode === 'pin' ? 'Change PIN' : 'Change passphrase'}
              </Button>
            </div>
            <Select
              variant="row"
              className={UNDER_TITLE}
              label="Auto-lock"
              value={String(settings?.autoLockMinutes ?? 5)}
              onChange={(v) => saveAutoLock(Number(v) as AutoLockMinutes)}
              options={AUTO_LOCK.map((o) => ({ value: String(o.value), label: o.label }))}
            />
          </>
        )}
        {lockMode !== 'device' && biometric !== 'unavailable' && (
          <Switch
            variant="row"
            icon={Fingerprint}
            label="Unlock with fingerprint or face"
            hint={`Your ${lockMode === 'pin' ? 'PIN' : 'passphrase'} still works if this fails.`}
            checked={biometric === 'on'}
            onChange={(on) => void run(on ? enableBiometric : disableBiometric)}
          />
        )}
      </div>
      <SecretDialog target={target} current={lockMode} onClose={() => setTarget(null)} />
    </PlainSection>
  );
}
