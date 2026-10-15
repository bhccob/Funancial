import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { OnboardingWizard } from './OnboardingWizard';

const actions = vi.hoisted(() => ({ completeOnboarding: vi.fn(async () => {}) }));
vi.mock('@/store/useFinance', () => ({ useFinanceActions: () => actions }));

beforeEach(() => actions.completeOnboarding.mockClear());

const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }));

async function passIntro() {
  await userEvent.click(screen.getByRole('checkbox', { name: 'I understand' }));
  await next();
}

async function fillBalances(cash = '1,000', savings = '5000') {
  await userEvent.type(screen.getByLabelText('Cash & checking'), cash);
  await userEvent.type(screen.getByLabelText('Savings'), savings);
  await next();
}

describe('OnboardingWizard', () => {
  it('keeps Next disabled until the user understands', async () => {
    renderWithStore(<OnboardingWizard />);
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Before we start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'I understand' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('collects everything and finishes with a PIN', async () => {
    const { store } = renderWithStore(<OnboardingWizard />);
    await passIntro();

    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    await userEvent.type(screen.getByLabelText('What should we call you?'), 'Sam');
    await next();

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await fillBalances();

    expect(screen.getByRole('heading', { level: 1, name: 'Your salary' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Monthly take-home pay'), '4200');
    expect(screen.getByLabelText('Pay day')).toHaveValue('25');
    await next();

    expect(screen.getByRole('heading', { level: 1, name: 'Credit cards' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    await userEvent.type(screen.getByLabelText('Card name'), 'Visa');
    await userEvent.type(screen.getByLabelText('Current balance'), '230');
    await userEvent.selectOptions(screen.getByLabelText('Due day'), '21');
    expect(screen.getByRole('switch', { name: 'I pay it in full each month' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save card' }));
    expect(screen.getByText('Visa')).toBeInTheDocument();
    await next();

    expect(screen.getByText('Step 6 of 6')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    // A device without fingerprint or face (and the web) is not offered it.
    expect(
      screen.queryByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    ).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

    expect(actions.completeOnboarding).toHaveBeenCalledWith({
      name: 'Sam',
      currency: 'USD',
      openingCash: 100000,
      openingSavings: 500000,
      salary: { monthlyAmount: 420000, payDay: 25 },
      cards: [{ name: 'Visa', balance: 23000, creditLimit: null, dueDay: 21, payInFull: true }],
    });
    const setSecret = vi.mocked(store.getState().setSecret);
    expect(setSecret).toHaveBeenCalledWith('2468', 'pin');
    // The lock is in place before the profile flips the app to the Dashboard.
    const [onboardedAt] = actions.completeOnboarding.mock.invocationCallOrder;
    const [lockedAt] = setSecret.mock.invocationCallOrder;
    expect(lockedAt).toBeLessThan(onboardedAt ?? 0);
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();
  });

  it('sends no salary when there is no regular salary, and no secret without a lock', async () => {
    const { store } = renderWithStore(<OnboardingWizard />);
    await passIntro();
    await next();
    await fillBalances('0', '0');

    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    expect(screen.queryByLabelText('Monthly take-home pay')).not.toBeInTheDocument();
    await next();
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

    expect(actions.completeOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ salary: null, cards: [], openingCash: 0, openingSavings: 0 }),
    );
    expect(store.getState().setSecret).not.toHaveBeenCalled();
  });

  it('turns on biometric unlock after setting the PIN', async () => {
    const { store } = renderWithStore(<OnboardingWizard />, createStubStore({ biometric: 'off' }));
    await passIntro();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    expect(
      screen.queryByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    expect(
      screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    ).toHaveAttribute('aria-checked', 'true');
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

    const setSecret = vi.mocked(store.getState().setSecret);
    const enableBiometric = vi.mocked(store.getState().enableBiometric);
    await vi.waitFor(() => expect(enableBiometric).toHaveBeenCalledTimes(1));
    expect(setSecret).toHaveBeenCalledWith('2468', 'pin');
    const [lockedAt] = setSecret.mock.invocationCallOrder;
    const [biometricAt] = enableBiometric.mock.invocationCallOrder;
    expect(lockedAt).toBeLessThan(biometricAt ?? 0);
  });

  it('leaves biometric unlock off when switched off', async () => {
    const { store } = renderWithStore(<OnboardingWizard />, createStubStore({ biometric: 'off' }));
    await passIntro();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    await userEvent.click(
      screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    );
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

    await vi.waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();
  });

  it('refuses a PIN that does not match its confirmation', async () => {
    renderWithStore(<OnboardingWizard />, createStubStore());
    await passIntro();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2469');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));
    expect(screen.getByText("Those don't match.")).toBeInTheDocument();
    expect(actions.completeOnboarding).not.toHaveBeenCalled();
  });
});
