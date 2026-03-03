import { describe, expect, it } from "vitest"
import { tiptapToMarkdown } from "./tiptap-convert.server"
import type { TipTapDoc } from "./tiptap-convert.server"

describe("tiptapToMarkdown", () => {
  it("converts headings H1–H3", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Sub" }] },
      ],
    }
    const md = tiptapToMarkdown(doc)
    expect(md).toContain("# Title")
    expect(md).toContain("## Section")
    expect(md).toContain("### Sub")
  })

  it("converts paragraph with bold and italic marks", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello ", marks: [] },
            { type: "text", text: "world", marks: [{ type: "bold" }] },
            { type: "text", text: " and ", marks: [] },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
          ],
        },
      ],
    }
    const md = tiptapToMarkdown(doc)
    expect(md).toContain("**world**")
    expect(md).toContain("_italic_")
  })

  it("converts bullet lists", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Item A" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Item B" }] }],
            },
          ],
        },
      ],
    }
    const md = tiptapToMarkdown(doc)
    expect(md).toContain("- Item A")
    expect(md).toContain("- Item B")
  })

  it("converts ordered lists", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }],
            },
          ],
        },
      ],
    }
    const md = tiptapToMarkdown(doc)
    expect(md).toContain("1. First")
    expect(md).toContain("2. Second")
  })

  it("converts code blocks", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const x = 1" }],
        },
      ],
    }
    const md = tiptapToMarkdown(doc)
    expect(md).toContain("```typescript")
    expect(md).toContain("const x = 1")
    expect(md).toContain("```")
  })

  it("converts simple tables", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }],
                },
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Role" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Alice" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Lead" }] }],
                },
              ],
            },
          ],
        },
      ],
    }
    const md = tiptapToMarkdown(doc)
    expect(md).toContain("| Name")
    expect(md).toContain("| Role")
    expect(md).toContain("| Alice")
    expect(md).toContain("| Lead")
    expect(md).toContain("---")
  })

  it("converts inline code mark", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "foo", marks: [{ type: "code" }] }],
        },
      ],
    }
    const md = tiptapToMarkdown(doc)
    expect(md).toContain("`foo`")
  })

  it("converts link marks", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click here",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    }
    const md = tiptapToMarkdown(doc)
    expect(md).toContain("[click here](https://example.com)")
  })

  it("returns empty string for empty doc", () => {
    const doc: TipTapDoc = { type: "doc", content: [] }
    expect(tiptapToMarkdown(doc)).toBe("")
  })

  it("handles string input (JSON parse)", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    }
    const result = tiptapToMarkdown(JSON.stringify(doc))
    expect(result).toContain("Hello")
  })
})
