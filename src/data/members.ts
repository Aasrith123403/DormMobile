import type { UserRow } from '../lib/database.types';

export type MemberProfile = UserRow & { role: 'owner' | 'member'; joinedAt: string };

export function sortMembers(members: MemberProfile[]): MemberProfile[] {
  return [...members].sort(
    (a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id)
  );
}
