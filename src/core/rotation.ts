/**
 * Supply-rotation turn order. Pure.
 *
 * Mirrors the `log_supply_purchase` SQL function: the turn always moves to the
 * member after whoever actually bought, regardless of whose turn it was
 * supposed to be. Buying out of turn is a favour, not a reason to lose your
 * place in line.
 */

export function nextTurn(memberIds: string[], buyerId: string | null): string | null {
  if (memberIds.length === 0) return null;
  if (buyerId === null) return memberIds[0];

  const index = memberIds.indexOf(buyerId);
  if (index === -1) return memberIds[0];

  return memberIds[(index + 1) % memberIds.length];
}

/**
 * Keeps a rotation pointer valid when the roster changes: if the member whose
 * turn it was has left the group, the turn falls to the next surviving member
 * in the old order.
 */
export function reconcileTurn(
  previousOrder: string[],
  currentMembers: string[],
  currentTurnUserId: string | null
): string | null {
  if (currentMembers.length === 0) return null;
  if (currentTurnUserId && currentMembers.includes(currentTurnUserId)) {
    return currentTurnUserId;
  }

  const startIndex = currentTurnUserId ? previousOrder.indexOf(currentTurnUserId) : -1;
  if (startIndex !== -1) {
    for (let step = 1; step <= previousOrder.length; step += 1) {
      const candidate = previousOrder[(startIndex + step) % previousOrder.length];
      if (currentMembers.includes(candidate)) return candidate;
    }
  }

  return currentMembers[0];
}
