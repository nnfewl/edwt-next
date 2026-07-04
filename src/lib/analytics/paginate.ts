// Pure client-side pagination over an already-fetched payload (10 per page).

export const PAGE_SIZE = 10;

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): T[] {
  const start = Math.max(0, page) * size;
  return items.slice(start, start + size);
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}
