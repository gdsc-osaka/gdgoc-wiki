import { describe, expect, it } from "vitest"
import {
  OperationPlanSchema,
  PageDraftSchema,
  SectionPatchResponseSchema,
  buildFeedbackSuffix,
} from "./gemini.server"

describe("OperationPlanSchema", () => {
  it("accepts a valid create operation plan", () => {
    const raw = {
      planRationale: "新しいイベントレポートを作成します",
      operations: [
        {
          type: "create",
          tempId: "new-1",
          suggestedTitle: { ja: "Tech Talk 2024 レポート" },
          suggestedParentId: null,
          pageType: "event-report",
          rationale: "先週のTech Talkの記録として",
        },
      ],
    }
    const result = OperationPlanSchema.safeParse(raw)
    expect(result.success).toBe(true)
  })

  it("accepts a valid update operation plan", () => {
    const raw = {
      planRationale: "既存ページを更新します",
      operations: [
        {
          type: "update",
          pageId: "abc123",
          pageTitle: "スタッフ管理",
          rationale: "新しいスタッフ情報を追加",
        },
      ],
    }
    const result = OperationPlanSchema.safeParse(raw)
    expect(result.success).toBe(true)
  })

  it("rejects operations exceeding max 5", () => {
    const raw = {
      planRationale: "many operations",
      operations: Array.from({ length: 6 }, (_, i) => ({
        type: "create",
        tempId: `new-${i}`,
        suggestedTitle: { ja: `ページ ${i}` },
        suggestedParentId: null,
        pageType: "how-to-guide",
        rationale: "test",
      })),
    }
    const result = OperationPlanSchema.safeParse(raw)
    expect(result.success).toBe(false)
  })

  it("rejects missing planRationale", () => {
    const raw = { operations: [] }
    const result = OperationPlanSchema.safeParse(raw)
    expect(result.success).toBe(false)
  })

  it("rejects unknown pageType", () => {
    const raw = {
      planRationale: "test",
      operations: [
        {
          type: "create",
          tempId: "new-1",
          suggestedTitle: { ja: "test" },
          suggestedParentId: null,
          pageType: "unknown-type",
          rationale: "test",
        },
      ],
    }
    const result = OperationPlanSchema.safeParse(raw)
    expect(result.success).toBe(false)
  })
})

describe("PageDraftSchema", () => {
  const validDraft = {
    suggestedPageType: "event-report",
    pageTypeConfidence: "high",
    title: { ja: "テストイベント" },
    summary: { ja: "テストの要約" },
    metadata: { date: "2024-01-01" },
    sections: [
      {
        heading: "概要",
        body: "このイベントは...",
        sectionType: "overview",
      },
    ],
    suggestedParentId: null,
    suggestedTags: ["event-operations"],
    actionabilityScore: 3,
    actionabilityNotes: "",
    sensitiveItems: [],
  }

  it("accepts a valid PageDraft", () => {
    const result = PageDraftSchema.safeParse(validDraft)
    expect(result.success).toBe(true)
  })

  it("rejects invalid actionabilityScore", () => {
    const raw = { ...validDraft, actionabilityScore: 5 }
    const result = PageDraftSchema.safeParse(raw)
    expect(result.success).toBe(false)
  })

  it("rejects missing required fields", () => {
    const { title: _t, ...withoutTitle } = validDraft
    const result = PageDraftSchema.safeParse(withoutTitle)
    expect(result.success).toBe(false)
  })

  it("accepts all valid section types", () => {
    const sectionTypes = [
      "overview",
      "steps",
      "tips",
      "retrospective-good",
      "retrospective-improve",
      "checklist",
      "contact",
      "handover",
      "faq",
      "other",
    ]
    for (const sectionType of sectionTypes) {
      const raw = {
        ...validDraft,
        sections: [{ heading: "test", body: "test", sectionType }],
      }
      const result = PageDraftSchema.safeParse(raw)
      expect(result.success, `sectionType "${sectionType}" should be valid`).toBe(true)
    }
  })
})

describe("SectionPatchResponseSchema", () => {
  it("accepts a valid SectionPatchResponse", () => {
    const raw = {
      pageId: "page-123",
      sectionPatches: [
        {
          headingMatch: "概要",
          operation: "append",
          newHeading: "新しいサブセクション",
          content: "追加するコンテンツ",
        },
      ],
      sensitiveItems: [],
      actionabilityScore: 2,
      actionabilityNotes: "一部情報が不足しています",
    }
    const result = SectionPatchResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
  })

  it("accepts null headingMatch (append to end of page)", () => {
    const raw = {
      pageId: "page-123",
      sectionPatches: [
        {
          headingMatch: null,
          operation: "append",
          content: "新しいセクション",
        },
      ],
      sensitiveItems: [],
      actionabilityScore: 3,
      actionabilityNotes: "",
    }
    const result = SectionPatchResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
  })

  it("rejects 'replace' operation (not allowed by spec)", () => {
    const raw = {
      pageId: "page-123",
      sectionPatches: [
        {
          headingMatch: "概要",
          operation: "replace",
          content: "置換するコンテンツ",
        },
      ],
      sensitiveItems: [],
      actionabilityScore: 3,
      actionabilityNotes: "",
    }
    const result = SectionPatchResponseSchema.safeParse(raw)
    expect(result.success).toBe(false)
  })
})

describe("buildFeedbackSuffix", () => {
  it("produces a correctly-formatted feedback suffix", () => {
    const suffix = buildFeedbackSuffix("もっと具体的に書いてください")
    expect(suffix).toContain("前回の出力に対するフィードバック")
    expect(suffix).toContain("もっと具体的に書いてください")
    expect(suffix).toContain("再度JSONを出力してください")
  })
})
