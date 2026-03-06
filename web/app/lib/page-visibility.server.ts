import { type SQL, and, eq, or } from "drizzle-orm"
import { pages } from "~/db/schema"
import { hasRole } from "./auth-utils.server"

type UserLike = {
  id: string
  role: string
  chapterId?: string | null
}

type PageLike = {
  visibility: string
  chapterId?: string | null
  authorId: string
}

export function canUserSeePage(user: UserLike, page: PageLike): boolean {
  if (hasRole(user.role, "admin")) return true
  if (page.visibility === "public" && hasRole(user.role, "member")) return true
  if (user.id === page.authorId) return true

  if (page.visibility === "private_to_chapter") {
    return !!user.chapterId && user.chapterId === page.chapterId
  }

  if (page.visibility === "private_to_lead") {
    return hasRole(user.role, "lead") && !!user.chapterId && user.chapterId === page.chapterId
  }

  return false
}

export function canUserChangeVisibility(user: UserLike, page: PageLike): boolean {
  if (hasRole(user.role, "admin")) return true
  if (hasRole(user.role, "lead") && !!user.chapterId && user.chapterId === page.chapterId) {
    return true
  }
  if (user.id === page.authorId) return true
  return false
}

export function buildVisibilityFilter(user: UserLike): SQL | undefined {
  if (hasRole(user.role, "admin")) return undefined

  const conditions: SQL[] = [eq(pages.authorId, user.id)]

  if (hasRole(user.role, "member")) {
    conditions.push(eq(pages.visibility, "public"))
  }

  if (user.chapterId) {
    const chapterMatch = and(
      eq(pages.visibility, "private_to_chapter"),
      eq(pages.chapterId, user.chapterId),
    )
    if (chapterMatch) conditions.push(chapterMatch)

    if (hasRole(user.role, "lead")) {
      const leadMatch = and(
        eq(pages.visibility, "private_to_lead"),
        eq(pages.chapterId, user.chapterId),
      )
      if (leadMatch) conditions.push(leadMatch)
    }
  }

  return or(...conditions)
}
