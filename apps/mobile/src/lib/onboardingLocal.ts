/**
 * An escape hatch from the welcome flow, held in memory only.
 *
 * The gate sends anyone whose `onboarded_at` is null to `/welcome`, and the welcome screen
 * clears that by writing the stamp. If the write fails — offline on first launch, most
 * likely — those two rules trap her: the screen finishes, the gate finds the stamp still
 * null, and she is bounced straight back to the screen she just completed. A loop between
 * two correct rules.
 *
 * So a failed stamp can be waved past for the life of the process. Deliberately not
 * persisted: the server row stays the single source of truth, and the worst case is seeing
 * a three-screen introduction again after force-quitting an app that could not reach the
 * network. That is a better worst case than being locked out of your own training plan.
 */
let dismissed = false;

export function dismissOnboarding(): void {
  dismissed = true;
}

export function onboardingDismissed(): boolean {
  return dismissed;
}
