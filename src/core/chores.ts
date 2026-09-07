export interface BoardChore {
  id: string;
  name: string;
  nextDue: string;
  assignedTo: string | null;
  ownerId: string | null;
}

export function choreOwner(assignedTo: string | null, rotationTurn: string | null): string | null {
  return assignedTo ?? rotationTurn;
}

export interface ChoreBoardSection {
  userId: string | null;
  chores: BoardChore[];
  overdueCount: number;
  rotatingCount: number;
}

function byDueThenName(a: BoardChore, b: BoardChore): number {
  return a.nextDue.localeCompare(b.nextDue) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function boardByPerson(
  chores: BoardChore[],
  memberIds: string[],
  today: string
): ChoreBoardSection[] {
  const sections = new Map<string | null, ChoreBoardSection>();
  for (const id of memberIds) {
    sections.set(id, { userId: id, chores: [], overdueCount: 0, rotatingCount: 0 });
  }

  const unassigned: ChoreBoardSection = {
    userId: null,
    chores: [],
    overdueCount: 0,
    rotatingCount: 0,
  };

  for (const chore of chores) {
    const section = (chore.ownerId && sections.get(chore.ownerId)) || unassigned;
    section.chores.push(chore);
    if (chore.nextDue < today) section.overdueCount += 1;
    if (!chore.assignedTo) section.rotatingCount += 1;
  }

  const ordered = memberIds.map((id) => sections.get(id)!);
  for (const section of ordered) section.chores.sort(byDueThenName);
  if (unassigned.chores.length > 0) {
    unassigned.chores.sort(byDueThenName);
    ordered.push(unassigned);
  }

  return ordered;
}

export function unassignedChores(chores: BoardChore[]): BoardChore[] {
  return chores.filter((chore) => !chore.assignedTo).sort(byDueThenName);
}

export function assignmentCounts(
  chores: BoardChore[],
  memberIds: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of memberIds) counts[id] = 0;
  for (const chore of chores) {
    if (chore.assignedTo && chore.assignedTo in counts) {
      counts[chore.assignedTo] += 1;
    }
  }

  return counts;
}

export function balanceAssignments(
  chores: BoardChore[],
  memberIds: string[]
): { choreId: string; userId: string }[] {
  if (memberIds.length === 0) return [];
  const counts = assignmentCounts(chores, memberIds);
  const result: { choreId: string; userId: string }[] = [];
  for (const chore of unassignedChores(chores)) {
    let best = memberIds[0];
    for (const id of memberIds.slice(1)) {
      if (counts[id] < counts[best]) best = id;
    }

    counts[best] += 1;
    result.push({ choreId: chore.id, userId: best });
  }

  return result;
}

export function describeChoreLoad(chores: BoardChore[], today: string): string {
  if (chores.length === 0) return 'No chores yet';
  const overdue = chores.filter((c) => c.nextDue < today).length;
  const needing = chores.filter((c) => !c.assignedTo).length;
  if (overdue > 0) return `${overdue} overdue`;
  if (needing > 0) return `${needing} to assign`;
  return `${chores.length} ${chores.length === 1 ? 'chore' : 'chores'} assigned`;
}
