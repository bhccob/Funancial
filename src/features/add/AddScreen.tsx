import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { ExpenseForm } from './ExpenseForm';
import { IncomeForm } from './IncomeForm';

type Kind = 'expense' | 'income';

export function AddScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const kind: Kind = params.get('type') === 'income' ? 'income' : 'expense';

  // Back to wherever "Add" was opened from; a direct visit goes Home.
  const done = () => void (location.key === 'default' ? navigate('/') : navigate(-1));

  return (
    <div className="flex max-w-xl flex-col">
      <PageHeader title="Add" back />
      <div className="flex flex-col gap-6 pt-6">
        <RadioGroup<Kind>
          variant="underline"
          legend="Type"
          value={kind}
          onChange={(v) =>
            setParams(v === 'income' ? { type: 'income' } : {}, {
              replace: true,
              // Same screen: the page stays where it is.
              preventScrollReset: true,
            })
          }
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />
        {kind === 'expense' ? <ExpenseForm onDone={done} /> : <IncomeForm onDone={done} />}
      </div>
    </div>
  );
}
