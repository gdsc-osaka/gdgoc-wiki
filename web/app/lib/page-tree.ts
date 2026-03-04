export interface PageNode {
  id: string
  slug: string
  titleJa: string
  titleEn: string
  children: PageNode[]
}

type FlatRow = {
  id: string
  slug: string
  titleJa: string
  titleEn: string
  parentId: string | null
  sortOrder: number
}

/**
 * Converts a flat list of page rows (with parentId) into a recursive tree.
 * Orphaned nodes (parentId pointing to a non-existent page) are placed at the root.
 */
export function buildTree(rows: FlatRow[]): PageNode[] {
  const map = new Map<string, PageNode>()
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      slug: row.slug,
      titleJa: row.titleJa,
      titleEn: row.titleEn,
      children: [],
    })
  }

  const roots: PageNode[] = []
  for (const row of rows) {
    const node = map.get(row.id)
    if (!node) continue
    if (row.parentId && map.has(row.parentId)) {
      map.get(row.parentId)?.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}
