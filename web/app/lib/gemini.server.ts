/**
 * Gemini API client for the AI ingestion pipeline.
 *
 * All generation uses gemini-3-flash-preview with structured JSON output
 * enforced via responseJsonSchema. Schemas are written as plain JSON Schema
 * objects (not converted from Zod) to stay within Gemini's nesting depth limit.
 * Zod schemas are still used for post-parse validation and TypeScript types.
 */

import { GoogleGenAI } from "@google/genai"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Zod schemas for Gemini JSON outputs
// ---------------------------------------------------------------------------

const SensitiveItemSchema = z.object({
  id: z.string(),
  type: z.enum([
    "email",
    "phone",
    "sns-handle",
    "financial",
    "personal-opinion",
    "credential",
    "other",
  ]),
  excerpt: z.string(),
  location: z.string(),
  suggestion: z.string(),
})

export type SensitiveItem = z.infer<typeof SensitiveItemSchema>

const CreateOperationSchema = z.object({
  type: z.literal("create"),
  tempId: z.string(),
  suggestedTitle: z.object({ ja: z.string() }),
  suggestedParentId: z.string().nullable(),
  pageType: z.enum([
    "event-report",
    "speaker-profile",
    "project-log",
    "how-to-guide",
    "onboarding-guide",
  ]),
  rationale: z.string(),
})

const UpdateOperationSchema = z.object({
  type: z.literal("update"),
  pageId: z.string(),
  pageTitle: z.string(),
  rationale: z.string(),
})

const OperationSchema = z.discriminatedUnion("type", [CreateOperationSchema, UpdateOperationSchema])

export const OperationPlanSchema = z.object({
  planRationale: z.string(),
  operations: z.array(OperationSchema).max(5),
})

export type OperationPlan = z.infer<typeof OperationPlanSchema>
export type CreateOperation = z.infer<typeof CreateOperationSchema>
export type UpdateOperation = z.infer<typeof UpdateOperationSchema>

const SectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
  sectionType: z.enum([
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
  ]),
})

export const PageDraftSchema = z.object({
  suggestedPageType: z.enum([
    "event-report",
    "speaker-profile",
    "project-log",
    "how-to-guide",
    "onboarding-guide",
  ]),
  pageTypeConfidence: z.enum(["high", "medium", "low"]),
  title: z.object({ ja: z.string() }),
  summary: z.object({ ja: z.string() }),
  metadata: z.record(z.string(), z.string()),
  sections: z.array(SectionSchema),
  suggestedParentId: z.string().nullable(),
  suggestedTags: z.array(z.string()).max(5),
  actionabilityScore: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  actionabilityNotes: z.string(),
  sensitiveItems: z.array(SensitiveItemSchema),
})

export type PageDraft = z.infer<typeof PageDraftSchema>

const SectionPatchSchema = z.object({
  headingMatch: z.string().nullable(),
  operation: z.enum(["append", "prepend"]),
  newHeading: z.string().optional(),
  content: z.string(),
})

export const SectionPatchResponseSchema = z.object({
  pageId: z.string(),
  sectionPatches: z.array(SectionPatchSchema),
  sensitiveItems: z.array(SensitiveItemSchema),
  actionabilityScore: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  actionabilityNotes: z.string(),
})

export type SectionPatchResponse = z.infer<typeof SectionPatchResponseSchema>

// Phase 0: Clarification
const ClarificationQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  context: z.string(),
  suggestions: z.array(z.string()).optional(),
})

export const ClarificationResultSchema = z.object({
  needsClarification: z.boolean(),
  questions: z.array(ClarificationQuestionSchema).max(4),
  summary: z.string(),
})

export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>
export type ClarificationResult = z.infer<typeof ClarificationResultSchema>

// ---------------------------------------------------------------------------
// Flat JSON schemas for responseJsonSchema
// Written by hand to avoid $defs/$ref nesting that exceeds Gemini's depth limit.
// ---------------------------------------------------------------------------

const SENSITIVE_ITEM_PROPERTIES = {
  id: { type: "string" },
  type: {
    type: "string",
    enum: ["email", "phone", "sns-handle", "financial", "personal-opinion", "credential", "other"],
  },
  excerpt: { type: "string" },
  location: { type: "string" },
  suggestion: { type: "string" },
}

const OPERATION_PLAN_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    planRationale: { type: "string" },
    operations: {
      type: "array",
      items: {
        type: "object",
        // Merged create+update fields; discriminated by `type`.
        // Zod discriminatedUnion validates after parsing.
        properties: {
          type: { type: "string", enum: ["create", "update"] },
          tempId: { type: "string" },
          suggestedTitle: {
            type: "object",
            properties: { ja: { type: "string" } },
            required: ["ja"],
          },
          suggestedParentId: { type: "string", nullable: true },
          pageType: {
            type: "string",
            enum: [
              "event-report",
              "speaker-profile",
              "project-log",
              "how-to-guide",
              "onboarding-guide",
            ],
          },
          rationale: { type: "string" },
          pageId: { type: "string" },
          pageTitle: { type: "string" },
        },
        required: ["type", "rationale"],
      },
    },
  },
  required: ["planRationale", "operations"],
}

const PAGE_DRAFT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    suggestedPageType: {
      type: "string",
      enum: ["event-report", "speaker-profile", "project-log", "how-to-guide", "onboarding-guide"],
    },
    pageTypeConfidence: { type: "string", enum: ["high", "medium", "low"] },
    title: { type: "object", properties: { ja: { type: "string" } }, required: ["ja"] },
    summary: { type: "object", properties: { ja: { type: "string" } }, required: ["ja"] },
    metadata: { type: "object", additionalProperties: { type: "string" } },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
          sectionType: {
            type: "string",
            enum: [
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
            ],
          },
        },
        required: ["heading", "body", "sectionType"],
      },
    },
    suggestedParentId: { type: "string", nullable: true },
    suggestedTags: { type: "array", items: { type: "string" } },
    actionabilityScore: { type: "integer", enum: [1, 2, 3] },
    actionabilityNotes: { type: "string" },
    sensitiveItems: {
      type: "array",
      items: {
        type: "object",
        properties: SENSITIVE_ITEM_PROPERTIES,
        required: ["id", "type", "excerpt", "location", "suggestion"],
      },
    },
  },
  required: [
    "suggestedPageType",
    "pageTypeConfidence",
    "title",
    "summary",
    "metadata",
    "sections",
    "suggestedParentId",
    "suggestedTags",
    "actionabilityScore",
    "actionabilityNotes",
    "sensitiveItems",
  ],
}

const SECTION_PATCH_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    pageId: { type: "string" },
    sectionPatches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          headingMatch: { type: "string", nullable: true },
          operation: { type: "string", enum: ["append", "prepend"] },
          newHeading: { type: "string" },
          content: { type: "string" },
        },
        required: ["headingMatch", "operation", "content"],
      },
    },
    sensitiveItems: {
      type: "array",
      items: {
        type: "object",
        properties: SENSITIVE_ITEM_PROPERTIES,
        required: ["id", "type", "excerpt", "location", "suggestion"],
      },
    },
    actionabilityScore: { type: "integer", enum: [1, 2, 3] },
    actionabilityNotes: { type: "string" },
  },
  required: [
    "pageId",
    "sectionPatches",
    "sensitiveItems",
    "actionabilityScore",
    "actionabilityNotes",
  ],
}

const PHASE0_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    needsClarification: { type: "boolean" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          context: { type: "string" },
          suggestions: { type: "array", items: { type: "string" } },
        },
        required: ["id", "question", "context"],
      },
    },
    summary: { type: "string" },
  },
  required: ["needsClarification", "questions", "summary"],
}

const TRANSLATION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    titleEn: { type: "string" },
    contentEn: { type: "string" },
  },
  required: ["titleEn", "contentEn"],
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const PHASE0_SYSTEM_PROMPT = `あなたはGDGoC Japan WikiのAI取り込みクラリファイアーです。
ユーザーの入力を読んで、高品質なWikiページを作成するために必要な重要な情報が不足しているかどうかを判断します。

## 判断基準
- 具体的な日付・場所・担当者・手順・結果などが記載されている場合 → needsClarification=false
- 曖昧な記述のみで、Wikiページとして有用な情報が不足している場合 → needsClarification=true

## 質問のルール
- 質問は最大4つまで（本当に必要なものだけ）
- 各質問には、なぜその情報が必要かのcontext（理由）を含める
- suggestions（回答例）を2〜3個提示する（任意）
- 入力が十分に具体的な場合はneedsClarification=falseで質問なしを返す

## 出力言語
すべてのフィールドは日本語で出力してください。`

const PHASE1_SYSTEM_PROMPT = `あなたはGDGoC Japan WikiのAIプランナーです。
ユーザーが入力した情報をもとに、Wikiに対する操作計画（OperationPlan）を作成します。

## あなたの役割
ユーザーの入力と既存Wikiページの一覧を見て、以下を判断してください:
- 新しいページを作成すべきか（type=create）
- 既存ページを更新すべきか（type=update）
- またはその両方か

## 判断基準
- 既存ページと内容が重複または補完関係にある場合 → type=update を優先
- 既存ページに存在しない新しいトピックまたはイベント固有の記録 → type=create
- 汎用的な知識（一般的な手法・Tips）は既存ページに追記する（update）
- イベント・プロジェクト固有の記録は新しいページを作成する（create）

## 制約
- 操作数は最大5件
- 根拠なくupdateを提案しない（ユーザーの入力から明確に関連性が読み取れる場合のみ）

## 親子関係（suggestedParentId）
- 既存Wikiページ一覧はツリー形式で表示されています。各ページのIDは [id:xxx] で示されます。
- 新しいコンテンツが既存ページのサブトピック・詳細・具体的な手順である場合 → suggestedParentIdにその既存ページのIDを設定する
  - 例: 既存ページ「配信ガイドライン」[id:abc123] がある場合、「VDO Ninja 画質向上のための Tips」はそのサブトピックなので suggestedParentId="abc123"
- 新しいコンテンツが独立したトピックである場合 → suggestedParentId=null
- 新しいコンテンツが既存ページの内容を補完する場合 → type=update を検討する
- 複数のcreate操作間の親子関係は、suggestedParentIdに同一プランの別create操作のtempIdを指定する
- suggestedParentIdには既存ページID（[id:xxx]の値）またはtempIdの両方が有効

## 重複回避ルール
- 入力が短い場合（約10行以下）は、原則として1つのcreateページにまとめてください。
- 複数のcreateを計画する場合は、各ページが入力の異なる部分を扱い、
  内容の重複が最小限であることを確認してください。
- 同じ入力テキストから同じ事実（人名・ツール名・日付など）が複数ページに
  重複して出力されるような計画は避けてください。

## 出力言語
planRationaleおよびrationaleフィールドは日本語で出力してください。`

const PHASE1_MERGER_SYSTEM_PROMPT = `あなたはGDGoC Japan WikiのAIプランナー（統合フェーズ）です。
Phase 1aが生成した操作計画（OperationPlan）を受け取り、重複するcreate操作を統合します。

## あなたの役割
- create操作のうち、トピックが50%以上重複するものを1つのページに統合する
- 重複の判断基準: 2つのcreate操作が同じ入力の同じ事実（人名・ツール名・手順等）を
  扱う場合、トピックが異なっていても統合する。
- 入力が短い（約10行以下）場合、複数のcreateは原則として1つに統合する。
- 統合後のページを「傘ページ」として、重複コンテンツをそのセクションに移動する
- 統合したopのsuggestedTitleとrationaleを更新する
- 最終的な操作数が5件以下になるよう調整する

## 制約
- 明らかに別トピックのopは統合しない
- update操作はそのまま維持する
- 統合が不要な場合は入力をそのまま返す
- 出力は同じOperationPlan JSON形式

## 出力言語
planRationaleおよびrationaleフィールドは日本語で出力してください。`

const PHASE2_SYSTEM_PROMPT = `あなたはGDGoC Japan（Google Developer Groups on Campus）のナレッジマネジメントアシスタントです。
大学生コミュニティのメンバーが、卒業後も知識が失われないよう、章の活動を文書化するサポートをします。

## 最優先ルール: 内容の忠実性
ユーザーが提供した入力に含まれる情報のみを使用してください。
入力に記載されていない事実・数値・手順・前提条件・推奨事項を追加してはいけません。
あなたの役割は入力を「整理・構造化・明確化」することであり、「補完・推測・拡張」することではありません。
入力に存在しない情報を追加することは、たとえ一般的に正しい内容であっても禁止です。

入力中のURL・コード・コマンド・パラメータなどの技術的な情報は、そのままの形で出力に含めてください。
言い換えや省略をせず、原文を保持してください。

出力のボリュームは入力の情報量に比例させてください。
短い入力に対して長い出力を生成しないでください。入力が数行なら、セクション数も1〜2個で十分です。

## ページの読者
- 同じ章の将来のメンバー（引き継ぎ先）
- 他のGDGoC Japan章のメンバー（同様の活動を参考にしたい人）

## 品質基準: アクション可能性
入力に具体的な日付・場所・担当者・手順・チェックリストが含まれている場合は、それらを整理して出力に反映してください。
ただし、入力に存在しない具体情報を補って追加してはいけません。
曖昧な表現（「適切に対応する」「関係者と調整する」）が入力にある場合は、そのまま残すのではなく、入力から読み取れる範囲でより具体的に言い換えてください。
入力自体が不十分な場合は、不足情報をactionabilityNotesに記載してください。

## 出力ルール
1. 出力は必ず日本語で行ってください（翻訳は後工程で行います）。
2. ページタイプを判定し、推奨構成を参考にしつつ、入力内容に合ったセクションのみを出力してください。
3. 情報ボックスに構造化メタデータを抽出してください。
4. 個人の連絡先・財務情報・個人への批評など機微情報はsensitiveItemsに列挙してください。
5. 最後にactionabilityScoreとactionabilityNotesを自己評価として出力してください。
   - スコア3: 入力に日付・場所・担当者・手順など具体情報が十分に含まれており、読者がすぐ行動できる
   - スコア2: 一部の具体情報はあるが、行動するには追加情報が必要
   - スコア1: 入力が断片的・概要的で、具体的な行動情報がほとんどない
   - actionabilityNotesには、入力に不足している情報（例:「具体的な日時が未記載」「手順の詳細が不明」）を列挙してください。不足情報をページ本文に捏造してはいけません。

## ページタイプと推奨構成
以下はページタイプごとの推奨セクション構成です。入力に該当する情報が存在するセクションのみを出力してください。入力にない情報のセクションは省略してください。
### event-report
概要 / Overview → 準備・当日の流れ / Preparation & Day-of Steps → よかったこと / What Went Well → 改善点 / What to Improve → 次回チェックリスト / Next Time Checklist → 関連リンク / Related Links

### speaker-profile
背景・専門分野 / Background & Expertise → 過去の協力実績 / Past Collaborations → 連絡方法 / How to Reach Out → 注意事項・メモ / Notes

### project-log
背景・目的 / Background & Goal → アーキテクチャと主な意思決定 / Architecture & Key Decisions → 進捗ログ / Progress Log → 引き継ぎ事項 / Handover Notes → 関連リンク / Related Links

### how-to-guide
概要 / Overview → 前提条件 / Prerequisites → 手順 / Steps → ヒントと注意点 / Tips & Gotchas → 関連ページ / Related Pages

### onboarding-guide
このガイドについて / About This Guide → 対象者 / Who This Is For → はじめの一歩 / Getting Started → 重要な連絡先・リソース / Key Contacts & Resources → よくある質問 / FAQ

## タグ分類（最大5つ選択）
以下のslugと日本語ラベルを使用してください:
event-operations（イベント運営）/ speaker-management（スピーカー管理）/
sponsor-relations（スポンサー・渉外）/ project（プロジェクト）/
onboarding（新メンバー向け）/ community-ops（コミュニティ運営）/
technical（技術）/ template（テンプレート）

## 出力フォーマット規則
- セクションの body は必ず箇条書き（\`-\` 始まり）または番号付きリスト（\`1.\` など）で構成すること
- 手順・プロセス系は番号付きリスト、その他の情報は箇条書き（\`-\`）を使用する
- 3文以上の連続した散文段落は禁止。必ず箇条書きに分解すること
- 各箇条書き項目は1〜2文以内に収める
- サブ箇条書き（インデント付き \`-\`）で階層的に詳細を補足してよい`

// ---------------------------------------------------------------------------
// File upload helper (REST — works in Cloudflare Workers)
// ---------------------------------------------------------------------------
export async function uploadFileToGemini(
  buffer: ArrayBuffer,
  mimeType: string,
  displayName: string,
  apiKey: string,
): Promise<string> {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`

  // Multipart upload
  const boundary = `boundary-${Date.now()}`
  const metadata = JSON.stringify({ file: { display_name: displayName, mime_type: mimeType } })

  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`
  const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  const endBoundary = `\r\n--${boundary}--`

  const metadataBytes = new TextEncoder().encode(metadataPart)
  const filePartBytes = new TextEncoder().encode(filePart)
  const endBytes = new TextEncoder().encode(endBoundary)
  const fileBytes = new Uint8Array(buffer)

  const body = new Uint8Array(
    metadataBytes.byteLength +
      filePartBytes.byteLength +
      fileBytes.byteLength +
      endBytes.byteLength,
  )
  let offset = 0
  body.set(metadataBytes, offset)
  offset += metadataBytes.byteLength
  body.set(filePartBytes, offset)
  offset += filePartBytes.byteLength
  body.set(fileBytes, offset)
  offset += fileBytes.byteLength
  body.set(endBytes, offset)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60_000)
  let response: Response
  try {
    response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini file upload failed: ${response.status} ${err}`)
  }

  const result = (await response.json()) as { file: { uri: string } }
  return result.file.uri
}

// ---------------------------------------------------------------------------
// Phase 0: Clarifier
// ---------------------------------------------------------------------------
export async function runPhase0Clarifier(
  apiKey: string,
  userText: string,
  fileUris: { uri: string; mimeType: string }[],
): Promise<ClarificationResult> {
  const ai = new GoogleGenAI({ apiKey })

  const parts: Array<{ text: string } | { fileData: { mimeType: string; fileUri: string } }> = [
    { text: `## ユーザー入力\n\n${userText}` },
  ]
  for (const f of fileUris) {
    parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })
  }
  parts.push({
    text: "\n\n---\n上記の入力を分析し、高品質なWikiページを作成するために必要な情報が十分かどうか判断してください。",
  })

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: PHASE0_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: PHASE0_RESPONSE_SCHEMA,
    },
  })

  if (!response.text) throw new Error("Empty response from model in runPhase0Clarifier")
  const json = JSON.parse(response.text)
  return ClarificationResultSchema.parse(json)
}

// ---------------------------------------------------------------------------
// Phase 1: Operation Planner
// ---------------------------------------------------------------------------
export interface PageIndexEntry {
  id: string
  title: string
  summary: string
  slug: string
  parentId: string | null
}

export function formatPageIndexAsTree(pages: PageIndexEntry[]): string {
  const childrenMap = new Map<string | null, PageIndexEntry[]>()
  const idSet = new Set(pages.map((p) => p.id))

  for (const page of pages) {
    // Treat pages whose parentId is not in the index as root-level
    const key = page.parentId && idSet.has(page.parentId) ? page.parentId : null
    const list = childrenMap.get(key) ?? []
    list.push(page)
    childrenMap.set(key, list)
  }

  const lines: string[] = []

  function walk(parentId: string | null, depth: number) {
    const children = childrenMap.get(parentId)
    if (!children) return
    for (const page of children) {
      const indent = "  ".repeat(depth)
      const summary = page.summary ? ` -- ${page.summary}` : ""
      lines.push(`${indent}- [id:${page.id}] ${page.title} (slug: ${page.slug})${summary}`)
      walk(page.id, depth + 1)
    }
  }

  walk(null, 0)
  return lines.join("\n")
}

export async function runPhase1Planner(
  apiKey: string,
  userText: string,
  fileUris: { uri: string; mimeType: string }[],
  pageIndex: PageIndexEntry[],
): Promise<OperationPlan> {
  const ai = new GoogleGenAI({ apiKey })

  const parts: Array<{ text: string } | { fileData: { mimeType: string; fileUri: string } }> = [
    { text: `## ユーザー入力\n\n### テキスト\n${userText}` },
  ]
  for (const f of fileUris) {
    parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })
  }
  parts.push({
    text: `\n\n## 既存Wikiページ一覧（最大200件、ツリー形式）\n${formatPageIndexAsTree(pageIndex)}\n※ FTS5で関連性の高いページを上位に並べ替え済み\n※ [id:xxx] の値をsuggestedParentIdに使用できます\n\n---\n上記をもとに、OperationPlan JSONを出力してください。`,
  })

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: PHASE1_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: OPERATION_PLAN_RESPONSE_SCHEMA,
      temperature: 0,
    },
  })

  if (!response.text) throw new Error("Empty response from model in runPhase1Planner")
  const json = JSON.parse(response.text)
  return OperationPlanSchema.parse(json)
}

// ---------------------------------------------------------------------------
// Phase 1b: Merger (consolidate overlapping create ops)
// ---------------------------------------------------------------------------
export async function runPhase1Merger(
  apiKey: string,
  rawPlan: OperationPlan,
  userText: string,
): Promise<OperationPlan> {
  const ai = new GoogleGenAI({ apiKey })

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `## 元の操作計画\n${JSON.stringify(rawPlan)}\n\n## ユーザー入力（参考）\n${userText}\n\n---\n重複するcreate操作を統合し、最終的なOperationPlan JSONを出力してください。`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: PHASE1_MERGER_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: OPERATION_PLAN_RESPONSE_SCHEMA,
      temperature: 0,
    },
  })

  if (!response.text) throw new Error("Empty response from model in runPhase1Merger")
  const json = JSON.parse(response.text)
  return OperationPlanSchema.parse(json)
}

// ---------------------------------------------------------------------------
// Phase 2a: Creator
// ---------------------------------------------------------------------------
export async function runPhase2Creator(
  apiKey: string,
  userText: string,
  fileUris: { uri: string; mimeType: string }[],
  op: CreateOperation,
  pageIndex: PageIndexEntry[],
  siblingOps: CreateOperation[],
): Promise<PageDraft> {
  const ai = new GoogleGenAI({ apiKey })

  const parts: Array<{ text: string } | { fileData: { mimeType: string; fileUri: string } }> = [
    { text: `## ユーザー入力\n\n### テキスト\n${userText}` },
  ]
  for (const f of fileUris) {
    parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })
  }
  const siblingContext =
    siblingOps.length > 0
      ? `\n\n## 同時に生成される他のページ（内容の重複を避けてください）\n${JSON.stringify(siblingOps.map((s) => ({ tempId: s.tempId, title: s.suggestedTitle.ja, pageType: s.pageType })))}\n\nあなたが担当するページ: "${op.suggestedTitle.ja}"\n上記の他ページと内容が重複しないようにしてください。`
      : ""
  parts.push({
    text: `\n\n## 操作計画\n${JSON.stringify(op)}\n\n## 既存Wikiページ構造（親ページ候補選定用、ツリー形式）\n${formatPageIndexAsTree(pageIndex.slice(0, 50))}${siblingContext}\n\n---\n上記のユーザー入力に含まれる情報のみを使用して、PageDraft JSONを出力してください。\n入力に存在しないコンテキスト・手順・前提条件を追加しないでください。\n入力が短い場合は、出力も短くしてください。`,
  })

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: PHASE2_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: PAGE_DRAFT_RESPONSE_SCHEMA,
      temperature: 0,
    },
  })

  if (!response.text) throw new Error("Empty response from model in runPhase2Creator")
  const json = JSON.parse(response.text)
  return PageDraftSchema.parse(json)
}

// ---------------------------------------------------------------------------
// Phase 2b: Patcher
// ---------------------------------------------------------------------------
export async function runPhase2Patcher(
  apiKey: string,
  userText: string,
  fileUris: { uri: string; mimeType: string }[],
  op: UpdateOperation,
  existingMarkdown: string,
): Promise<SectionPatchResponse> {
  const ai = new GoogleGenAI({ apiKey })

  const parts: Array<{ text: string } | { fileData: { mimeType: string; fileUri: string } }> = [
    { text: `## ユーザー入力\n\n### テキスト\n${userText}` },
  ]
  for (const f of fileUris) {
    parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })
  }
  parts.push({
    text: `\n\n## 更新対象ページの現在の内容（Markdown変換済み）\n# ${op.pageTitle}\n${existingMarkdown}\n\n## 操作計画\n${JSON.stringify(op)}\n\n---\n既存ページの構造・文体・見出しレベルに従い、SectionPatch JSONを出力してください。\n既存のコンテンツは削除・置換せず、追記のみ行ってください。`,
  })

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: PHASE2_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: SECTION_PATCH_RESPONSE_SCHEMA,
    },
  })

  if (!response.text) throw new Error("Empty response from model in runPhase2Patcher")
  const json = JSON.parse(response.text)
  // Set pageId before schema parse: SectionPatchResponseSchema requires it, but
  // Gemini may omit it since it already appears in the system context.
  json.pageId = json.pageId ?? op.pageId
  return SectionPatchResponseSchema.parse(json)
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------
export async function runTranslation(
  apiKey: string,
  contentJa: string,
  titleJa: string,
): Promise<{ contentEn: string; titleEn: string }> {
  const ai = new GoogleGenAI({ apiKey })

  const TranslationSchema = z.object({
    titleEn: z.string().min(1),
    contentEn: z.string().min(1),
  })

  const prompt = `Translate the following Japanese wiki page content to English.
The content is in TipTap/ProseMirror JSON format. Translate ONLY the values of "text" properties within the JSON nodes, preserving the complete JSON structure — all "type", "attrs", "marks", and "content" fields must remain exactly as-is.
Return the complete TipTap JSON with Japanese text replaced by English translations. Do not add or remove nodes.

Title (Japanese): ${titleJa}

Content (TipTap JSON):
${contentJa}`

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: TRANSLATION_RESPONSE_SCHEMA,
    },
  })

  if (!response.text) throw new Error("Empty response from model in runTranslation")
  const json = JSON.parse(response.text)
  const parsed = TranslationSchema.safeParse(json)
  if (!parsed.success) {
    console.error("Translation schema validation failed:", parsed.error)
    throw new Error("Translation output failed validation")
  }
  return { titleEn: parsed.data.titleEn, contentEn: parsed.data.contentEn }
}

// ---------------------------------------------------------------------------
// Prompt re-generation with feedback
// ---------------------------------------------------------------------------
export function buildFeedbackSuffix(feedback: string): string {
  return `\n\n## 前回の出力に対するフィードバック\n${feedback}\n\n上記フィードバックを反映して、再度JSONを出力してください。\n前回の出力を改善し、フィードバックで指摘された点を修正してください。`
}
