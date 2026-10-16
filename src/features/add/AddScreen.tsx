import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { EmptyLink } from '@/components/ui/Section';
import { CategorySchema } from '@/domain/entities';
import { ExpenseForm } from './ExpenseForm';
import { IncomeForm } from './IncomeForm';

type Kind = 'expense' | 'income';

/** What "I bought it" hands over in the router state; anything else there is ignored. */
const PrefillSchema = z.object({
  item: z.string(),
  amount: z.number().int().positive(),
  category: CategorySchema,
});

export function AddScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const kind: Kind = params.get('type') === 'income' ? 'income' : 'expense';
  const prefill = PrefillSchema.safeParse(
    (location.state as { prefill?: unknown } | null)?.prefill,
  ).data;

  // Back to wherever "Add" was opened from; a direct visit goes Home.
  const done = () => void (location.key === 'default' ? navigate('/') : navigate(-1));

  return (
    <div className="flex max-w-xl flex-col">
      <PageHeader title="Add" />
      <div className="flex flex-col gap-6 pt-6">
        <RadioGroup<Kind>
          legend="Type"
          value={kind}
          // The state stays, or switching to Income and back would drop what "I bought it" handed over.
          onChange={(v) =>
            setParams(v === 'income' ? { type: 'income' } : {}, {
              replace: true,
              state: location.state,
            })
          }
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />
        {kind === 'expense' && !prefill && (
          <div>
            <EmptyLink to="/buy">Haven't bought it yet? Ask first →</EmptyLink>
          </div>
        )}
        {kind === 'expense' ? (
          <ExpenseForm onDone={done} prefill={prefill} />
        ) : (
          <IncomeForm onDone={done} />
        )}
      </div>
    </div>
  );
}
