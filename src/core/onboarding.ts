export interface OnboardingFacts {
  hasGroup: boolean;
  hasCoMember: boolean;
  hasVenmo: boolean;
  hasExpense: boolean;
}

export type OnboardingStepId = 'group' | 'invite' | 'expense' | 'venmo';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  detail: string;
  icon: string;
  done: boolean;
}

export function onboardingSteps(facts: OnboardingFacts): OnboardingStep[] {
  return [
    {
      id: 'group',
      title: 'Create or join a group',
      detail: 'One per household or trip. Joining takes a six-character code.',
      icon: 'home-outline',
      done: facts.hasGroup,
    },
    {
      id: 'invite',
      title: 'Invite your roommates',
      detail: 'Share the join code so everyone sees the same ledger, live.',
      icon: 'person-add-outline',
      done: facts.hasCoMember,
    },
    {
      id: 'expense',
      title: 'Log your first expense',
      detail: 'Tap the amount, pick a category, save. Splitting is automatic.',
      icon: 'receipt-outline',
      done: facts.hasExpense,
    },
    {
      id: 'venmo',
      title: 'Add your Venmo username',
      detail: 'Roommates need it to pay you back from the Settle Up screen.',
      icon: 'cash-outline',
      done: facts.hasVenmo,
    },
  ];
}

export interface OnboardingProgress {
  doneCount: number;
  total: number;
  percent: number;
  complete: boolean;
}

export function onboardingProgress(steps: OnboardingStep[]): OnboardingProgress {
  const doneCount = steps.filter((step) => step.done).length;
  const total = steps.length;
  return {
    doneCount,
    total,
    percent: total === 0 ? 100 : Math.round((doneCount / total) * 100),
    complete: doneCount === total,
  };
}

export function nextOnboardingStep(steps: OnboardingStep[]): OnboardingStep | null {
  return steps.find((step) => !step.done) ?? null;
}

export function shouldShowOnboarding(facts: OnboardingFacts, dismissed: boolean): boolean {
  if (dismissed) return false;
  return !onboardingProgress(onboardingSteps(facts)).complete;
}
