import type { UserRow } from '../lib/database.types';

/**
 * Member shapes, kept apart from `groups.ts` because that module depends on
 * the auth context. The group store needs these types and nothing else, and
 * importing them from `groups.ts` created a require cycle
 * (auth -> groupStore -> groups -> auth), which Metro tolerates but which can
 * leave a module half-initialised at runtime.
 */

export type MemberProfile = UserRow & { role: 'owner' | 'member'; joinedAt: string };

/** Join order, so avatar stacks and rotations stay stable across refetches. */
export function sortMembers(members: MemberProfile[]): MemberProfile[] {
  return [...members].sort(
    (a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id)
  );
}
