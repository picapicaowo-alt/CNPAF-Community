export function moveId(
  orderedIds: string[],
  id: string,
  direction: -1 | 1,
) {
  const index = orderedIds.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= orderedIds.length) return orderedIds;
  const next = [...orderedIds];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function moveIdToTarget(
  orderedIds: string[],
  id: string,
  targetId: string,
  position: "before" | "after",
) {
  if (id === targetId || !orderedIds.includes(id) || !orderedIds.includes(targetId))
    return orderedIds;
  const next = orderedIds.filter((candidate) => candidate !== id);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex + (position === "after" ? 1 : 0), 0, id);
  return next;
}

export function stableFormKey(value: string, fallback: string) {
  return (
    value
      .normalize("NFKD")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 150) || fallback
  );
}
