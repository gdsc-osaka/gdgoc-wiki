import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Plus } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import type { PageNode } from "~/lib/page-tree"

export type { PageNode }

interface PageTreeProps {
  pages: PageNode[]
  currentSlug?: string
  isCollapsed?: boolean
}

interface TreeNodeProps {
  node: PageNode
  currentSlug?: string
  depth: number
  isCollapsed: boolean
}

function TreeNode({ node, currentSlug, depth, isCollapsed }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  const isCurrent = node.slug === currentSlug
  const title = node.titleEn || node.titleJa

  return (
    <li>
      <div
        title={isCollapsed ? title : undefined}
        className={`flex min-h-7 items-center gap-1 rounded px-2 py-1 text-sm ${
          isCurrent ? "bg-blue-500/10 font-medium text-blue-500" : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        {!isCollapsed &&
          (hasChildren ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="h-4 w-4 flex-shrink-0" />
          ))}

        <span className="flex-shrink-0 text-gray-400">
          {hasChildren ? (
            expanded ? (
              <FolderOpen size={14} />
            ) : (
              <Folder size={14} />
            )
          ) : (
            <FileText size={14} />
          )}
        </span>

        {!isCollapsed && (
          <Link to={`/wiki/${node.slug}`} className="flex-1 truncate">
            {title}
          </Link>
        )}
      </div>

      {hasChildren && expanded && depth < 2 && !isCollapsed && (
        <ul className="ml-4">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              currentSlug={currentSlug}
              depth={depth + 1}
              isCollapsed={isCollapsed}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function PageTree({ pages, currentSlug, isCollapsed = false }: PageTreeProps) {
  return (
    <nav aria-label="Page tree" className="flex h-full flex-col py-2">
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {pages.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            currentSlug={currentSlug}
            depth={0}
            isCollapsed={isCollapsed}
          />
        ))}
        {pages.length === 0 && !isCollapsed && (
          <li className="px-2 py-1 text-xs text-gray-400">No pages yet</li>
        )}
      </ul>

      <div className="border-t border-gray-100 px-2 pt-2 pb-1">
        <Link
          to="/ingest"
          title={isCollapsed ? "New Page" : undefined}
          className="flex min-h-8 items-center gap-1.5 rounded px-2 py-1.5 text-sm text-gray-500 hover:text-blue-500 hover:bg-gray-100"
        >
          <Plus size={14} className="flex-shrink-0" />
          {!isCollapsed && <span>New Page</span>}
        </Link>
      </div>
    </nav>
  )
}
