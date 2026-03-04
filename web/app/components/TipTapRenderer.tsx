import { Fragment, type ReactNode } from "react"
import type { TipTapDoc, TipTapNode } from "~/lib/tiptap-convert.server"

export type { TipTapDoc, TipTapNode }

export interface TocItem {
  id: string
  text: string
  level: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
}

export function extractPlainText(nodes: TipTapNode[]): string {
  return nodes.map((n) => (n.text ?? "") + extractPlainText(n.content ?? [])).join("")
}

/**
 * Generates a stable, deduplicated heading ID.
 * Mutates `counters` to track usage across a document.
 */
function makeHeadingId(text: string, counters: Map<string, number>): string {
  const baseId = `h-${slugify(text) || "section"}`
  const count = counters.get(baseId) ?? 0
  counters.set(baseId, count + 1)
  return count === 0 ? baseId : `${baseId}-${count}`
}

/**
 * Extracts h2 and h3 headings for Table of Contents generation.
 * Uses the same counter strategy as TipTapRenderer so anchor IDs match.
 */
export function extractTocItems(doc: TipTapDoc | TipTapNode): TocItem[] {
  const items: TocItem[] = []
  const counters = new Map<string, number>()

  function visit(node: TipTapNode): void {
    if (node.type === "heading") {
      const level = (node.attrs?.level as number) ?? 1
      const text = extractPlainText(node.content ?? [])
      const id = makeHeadingId(text, counters)
      if (level === 2 || level === 3) {
        items.push({ id, text, level })
      }
    }
    for (const child of node.content ?? []) visit(child)
  }

  visit(doc as TipTapNode)
  return items
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

function renderMarkedText(text: string, marks: TipTapNode["marks"]): ReactNode {
  let content: ReactNode = text
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        content = <strong>{content}</strong>
        break
      case "italic":
        content = <em>{content}</em>
        break
      case "code":
        content = (
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-sm">{content}</code>
        )
        break
      case "strike":
        content = <s>{content}</s>
        break
      case "link": {
        const href = (mark.attrs?.href as string) ?? "#"
        content = (
          <a
            href={href}
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {content}
          </a>
        )
        break
      }
      default:
        break
    }
  }
  return content
}

function renderInline(nodes: TipTapNode[]): ReactNode {
  return nodes.map((node, idx) => {
    const k = `${node.type}-${idx}`
    if (node.type === "text") {
      return <span key={k}>{renderMarkedText(node.text ?? "", node.marks)}</span>
    }
    if (node.type === "hardBreak") return <br key={k} />
    return <span key={k}>{renderInline(node.content ?? [])}</span>
  })
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function renderNode(node: TipTapNode, counters: Map<string, number>, key: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return (
        <p key={key} className="mb-4 leading-relaxed text-gray-800">
          {renderInline(node.content ?? [])}
        </p>
      )

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1
      const text = extractPlainText(node.content ?? [])
      const id = makeHeadingId(text, counters)
      const inner = renderInline(node.content ?? [])
      const clsMap: Record<number, string> = {
        1: "text-3xl font-bold text-gray-900 mb-6 mt-8",
        2: "text-2xl font-semibold text-gray-900 mb-4 mt-8 border-b border-gray-200 pb-2",
        3: "text-xl font-semibold text-gray-900 mb-3 mt-6",
        4: "text-lg font-semibold text-gray-900 mb-2 mt-4",
        5: "text-base font-semibold text-gray-900 mb-2 mt-4",
        6: "text-sm font-semibold text-gray-900 mb-2 mt-4",
      }
      const className = clsMap[level] ?? (clsMap[6] as string)
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
      return (
        <Tag key={key} id={id} className={className}>
          {inner}
        </Tag>
      )
    }

    case "bulletList":
      return (
        <ul key={key} className="mb-4 list-disc space-y-1 pl-6">
          {(node.content ?? []).map((item, i) => renderNode(item, counters, i))}
        </ul>
      )

    case "orderedList":
      return (
        <ol key={key} className="mb-4 list-decimal space-y-1 pl-6">
          {(node.content ?? []).map((item, i) => renderNode(item, counters, i))}
        </ol>
      )

    case "listItem":
      return (
        <li key={key}>
          {(node.content ?? []).map((child, i) => {
            if (child.type === "paragraph") {
              return <span key="para">{renderInline(child.content ?? [])}</span>
            }
            return renderNode(child, counters, i)
          })}
        </li>
      )

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? ""
      const code = (node.content ?? []).map((n) => n.text ?? "").join("")
      return (
        <pre key={key} className="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-4">
          <code className={`font-mono text-sm text-gray-100${lang ? ` language-${lang}` : ""}`}>
            {code}
          </code>
        </pre>
      )
    }

    case "blockquote":
      return (
        <blockquote key={key} className="mb-4 border-l-4 border-gray-300 pl-4 italic text-gray-600">
          {(node.content ?? []).map((child, i) => renderNode(child, counters, i))}
        </blockquote>
      )

    case "horizontalRule":
      return <hr key={key} className="my-6 border-gray-200" />

    case "image": {
      const src = (node.attrs?.src as string) ?? ""
      const alt = (node.attrs?.alt as string) ?? ""
      return <img key={key} src={src} alt={alt} className="mb-4 max-w-full rounded-lg" />
    }

    case "table":
      return (
        <div key={key} className="mb-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>{(node.content ?? []).map((row, i) => renderNode(row, counters, i))}</tbody>
          </table>
        </div>
      )

    case "tableRow":
      return (
        <tr key={key}>{(node.content ?? []).map((cell, i) => renderNode(cell, counters, i))}</tr>
      )

    case "tableHeader":
      return (
        <th
          key={key}
          className="border border-gray-300 bg-gray-50 px-3 py-2 text-left font-semibold"
        >
          {(node.content ?? []).map((child, i) => renderNode(child, counters, i))}
        </th>
      )

    case "tableCell":
      return (
        <td key={key} className="border border-gray-300 px-3 py-2">
          {(node.content ?? []).map((child, i) => renderNode(child, counters, i))}
        </td>
      )

    default:
      if (node.content) {
        return (
          <Fragment key={key}>
            {node.content.map((child, i) => renderNode(child, counters, i))}
          </Fragment>
        )
      }
      return node.text ? <span key={key}>{node.text}</span> : null
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TipTapRendererProps {
  doc: TipTapDoc | TipTapNode
}

export function TipTapRenderer({ doc }: TipTapRendererProps) {
  const counters = new Map<string, number>()
  const content = (doc as TipTapNode).content ?? []

  return <div className="min-w-0">{content.map((node, i) => renderNode(node, counters, i))}</div>
}
