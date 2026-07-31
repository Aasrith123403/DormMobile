import {
  OnboardingFacts,
  nextOnboardingStep,
  onboardingProgress,
  onboardingSteps,
  shouldShowOnboarding,
} from '../onboarding';

const facts = (overrides: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  hasGroup: false,
  hasCoMember: false,
  hasVenmo: false,
  hasExpense: false,
  ...overrides,
});

describe('onboardingSteps', () => {
  it('starts a brand new account with everything outstanding', () => {
    const steps = onboardingSteps(facts());
    expect(steps).toHaveLength(4);
    expect(steps.every((step) => !step.done)).toBe(true);
  });

  it('marks steps done from the facts, not from being seen', () => {
    const steps = onboardingSteps(facts({ hasGroup: true, hasVenmo: true }));
    expect(steps.find((s) => s.id === 'group')?.done).toBe(true);
    expect(steps.find((s) => s.id === 'venmo')?.done).toBe(true);
    expect(steps.find((s) => s.id === 'invite')?.done).toBe(false);
  });

  it('orders steps so each is useful only after the previous one', () => {
    expect(onboardingSteps(facts()).map((s) => s.id)).toEqual([
      'group',
      'invite',
      'expense',
      'venmo',
    ]);
  });

  it('gives every step something to render', () => {
    for (const step of onboardingSteps(facts())) {
      expect(step.title).not.toBe('');
      expect(step.detail).not.toBe('');
      expect(step.icon).not.toBe('');
    }
  });
});

describe('onboardingProgress', () => {
  it('counts nothing done at the start', () => {
    const progress = onboardingProgress(onboardingSteps(facts()));
    expect(progress).toEqual({ doneCount: 0, total: 4, percent: 0, complete: false });
  });

  it('tracks partial progress', () => {
    const progress = onboardingProgress(onboardingSteps(facts({ hasGroup: true, hasExpense: true })));
    expect(progress.doneCount).toBe(2);
    expect(progress.percent).toBe(50);
    expect(progress.complete).toBe(false);
  });

  it('completes only when every step is done', () => {
    const progress = onboardingProgress(
      onboardingSteps(facts({ hasGroup: true, hasCoMember: true, hasVenmo: true, hasExpense: true }))
    );
    expect(progress.complete).toBe(true);
    expect(progress.percent).toBe(100);
  });

  it('does not divide by zero on an empty list', () => {
    expect(onboardingProgress([])).toEqual({
      doneCount: 0,
      total: 0,
      percent: 100,
      complete: true,
    });
  });
});

describe('nextOnboardingStep', () => {
  it('points at the first outstanding step', () => {
    expect(nextOnboardingStep(onboardingSteps(facts()))?.id).toBe('group');
    expect(nextOnboardingStep(onboardingSteps(facts({ hasGroup: true })))?.id).toBe('invite');
  });

  it('skips completed steps even out of order', () => {
    const steps = onboardingSteps(facts({ hasGroup: true, hasCoMember: true }));
    expect(nextOnboardingStep(steps)?.id).toBe('expense');
  });

  it('returns null once everything is done', () => {
    const steps = onboardingSteps(
      facts({ hasGroup: true, hasCoMember: true, hasVenmo: true, hasExpense: true })
    );
    expect(nextOnboardingStep(steps)).toBeNull();
  });
});

describe('shouldShowOnboarding', () => {
  it('shows for a new account', () => {
    expect(shouldShowOnboarding(facts(), false)).toBe(true);
  });

  it('stays hidden once dismissed, however little is done', () => {
    expect(shouldShowOnboarding(facts(), true)).toBe(false);
  });

  it('hides itself once the group is set up, without a dismissal', () => {
    const done = facts({ hasGroup: true, hasCoMember: true, hasVenmo: true, hasExpense: true });
    expect(shouldShowOnboarding(done, false)).toBe(false);
  });
});
