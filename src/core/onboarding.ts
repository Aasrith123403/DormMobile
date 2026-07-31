/**
 * The getting-started checklist. Pure, so what a new user is told to do next
 * is decided by a tested function rather than by whichever screen they happen
 * to land on.
 *
 * Every step is derived from data the app already has — there is no "seen it"
 * flag per step and nothing to keep in sync. A step becomes done because the
 * thing actually happened, which means the checklist can never lie, and it
 * disappears on its own once the group is set up. In keeping with the rest of
 * the app it never nags: it is a card you can dismiss, not a notification.
 */

export interface OnboardingFacts {
  /** Belongs to at least one group. */
  hasGroup: boolean;
  /** At least one group has someone else in it. */
  hasCoMember: boolean;
  /** Profile carries a Venmo username. */
  hasVenmo: boolean;
  /** At least one expense has been logged anywhere. */
  hasExpense: boolean;
}

export type OnboardingStepId = 'group' | 'invite' | 'expense' | 'venmo';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  detail: string;
  /** Ionicons glyph. */
  icon: string;
  done: boolean;
}

/** Ordered so each step is only useful once the one before it is done. */
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
  /** 0-100, for the progress bar. */
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

/** The first thing still outstanding, or null when everything is done. */
export function nextOnboardingStep(steps: OnboardingStep[]): OnboardingStep | null {
  return steps.find((step) => !step.done) ?? null;
}

/**
 * Whether the checklist is worth showing at all. Hidden once complete, and
 * hidden if the user dismissed it — a set-up group should not carry a
 * tutorial around forever.
 */
export function shouldShowOnboarding(facts: OnboardingFacts, dismissed: boolean): boolean {
  if (dismissed) return false;
  return !onboardingProgress(onboardingSteps(facts)).complete;
}
