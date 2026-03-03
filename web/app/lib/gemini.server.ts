/**
 * Gemini API client for the AI ingestion pipeline.
 *
 * All generation uses gemini-2.0-flash.
 * Context caching is used within a single ingestion session to avoid re-sending
 * the shared system prompt + user input across Phase 1 and all Phase 2 calls.
 */

import { GoogleGenerativeAI } from "@google/generative-ai"
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

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

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
- 出力は必ずOperationPlan JSONスキーマに従ってください

## 出力言語
planRationaleおよびrationaleフィールドは日本語で出力してください。`

const PHASE2_SYSTEM_PROMPT = `あなたはGDGoC Japan（Google Developer Groups on Campus）のナレッジマネジメントアシスタントです。
大学生コミュニティのメンバーが、卒業後も知識が失われないよう、章の活動を文書化するサポートをします。

## ページの読者
- 同じ章の将来のメンバー（引き継ぎ先）
- 他のGDGoC Japan章のメンバー（同様の活動を参考にしたい人）

## 最重要品質基準: アクション可能性
完成したページは、読んだメンバーが誰にも聞かずにすぐ行動できる内容でなければなりません。
具体的な日付・場所・担当者・手順・チェックリストを必ず含めてください。
曖昧な表現（「適切に対応する」「関係者と調整する」）は避けてください。

## 出力ルール
1. 出力は必ず日本語で行ってください（翻訳は後工程で行います）。
2. ページタイプを判定し、対応するセクション構成を使用してください。
3. 情報ボックスに構造化メタデータを抽出してください。
4. 個人の連絡先・財務情報・個人への批評など機微情報はsensitiveItemsに列挙してください。
5. 最後にactionabilityScore（1〜3）と不足情報のメモを自己評価として出力してください。
6. 出力は必ず指定のJSONスキーマに従ってください。

## ページタイプと構成
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
technical（技術）/ template（テンプレート）`

// ---------------------------------------------------------------------------
// Helper: extract JSON from markdown code block or raw text
// ---------------------------------------------------------------------------
function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (match) return match[1].trim()
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start !== -1 && end !== -1) return text.slice(start, end + 1)
  return text.trim()
}

// ---------------------------------------------------------------------------
// File upload helper (uses REST since GoogleAIFileManager may not be available in Workers)
// ---------------------------------------------------------------------------
export async function uploadFileToGemini(
  buffer: ArrayBuffer,
  mimeType: string,
  displayName: string,
  apiKey: string,
): Promise<string> {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`

  // Multipart upload
  const boundary = `--boundary-${Date.now()}`
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
// Phase 1: Operation Planner
// ---------------------------------------------------------------------------
export interface PageIndexEntry {
  id: string
  title: string
  summary: string
  slug: string
}

export async function runPhase1Planner(
  apiKey: string,
  userText: string,
  fileUris: { uri: string; mimeType: string }[],
  pageIndex: PageIndexEntry[],
): Promise<OperationPlan> {
  const ai = new GoogleGenerativeAI(apiKey)
  const model = ai.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: PHASE1_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json" },
  })

  const parts: Array<{ text: string } | { fileData: { mimeType: string; fileUri: string } }> = [
    { text: `## ユーザー入力\n\n### テキスト\n${userText}` },
  ]
  for (const f of fileUris) {
    parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })
  }
  parts.push({
    text: `\n\n## 既存Wikiページ一覧（最大200件）\n${JSON.stringify(pageIndex)}\n※ FTS5で関連性の高いページを上位に並べ替え済み\n\n---\n上記をもとに、OperationPlan JSONを出力してください。`,
  })

  const result = await model.generateContent({ contents: [{ role: "user", parts }] })
  const text = result.response.text()
  const json = JSON.parse(extractJson(text))
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
): Promise<PageDraft> {
  const ai = new GoogleGenerativeAI(apiKey)
  const model = ai.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: PHASE2_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json" },
  })

  const parts: Array<{ text: string } | { fileData: { mimeType: string; fileUri: string } }> = [
    { text: `## ユーザー入力\n\n### テキスト\n${userText}` },
  ]
  for (const f of fileUris) {
    parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })
  }
  parts.push({
    text: `\n\n## 操作計画\n${JSON.stringify(op)}\n\n## 既存Wikiページ構造（親ページ候補選定用）\n${JSON.stringify(pageIndex.slice(0, 50))}\n\n---\n上記の情報をもとに、PageDraft JSONを出力してください。`,
  })

  const result = await model.generateContent({ contents: [{ role: "user", parts }] })
  const text = result.response.text()
  const json = JSON.parse(extractJson(text))
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
  const ai = new GoogleGenerativeAI(apiKey)
  const model = ai.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: PHASE2_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json" },
  })

  const parts: Array<{ text: string } | { fileData: { mimeType: string; fileUri: string } }> = [
    { text: `## ユーザー入力\n\n### テキスト\n${userText}` },
  ]
  for (const f of fileUris) {
    parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })
  }
  parts.push({
    text: `\n\n## 更新対象ページの現在の内容（Markdown変換済み）\n# ${op.pageTitle}\n${existingMarkdown}\n\n## 操作計画\n${JSON.stringify(op)}\n\n---\n既存ページの構造・文体・見出しレベルに従い、SectionPatch JSONを出力してください。\n既存のコンテンツは削除・置換せず、追記のみ行ってください。`,
  })

  const result = await model.generateContent({ contents: [{ role: "user", parts }] })
  const text = result.response.text()
  const json = JSON.parse(extractJson(text))
  // Ensure pageId is set from op
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
  const ai = new GoogleGenerativeAI(apiKey)
  const model = ai.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  })

  const prompt = `Translate the following Japanese wiki page content to English.
Return JSON: { "titleEn": "...", "contentEn": "..." }
Preserve all Markdown formatting exactly. Do not add or remove sections.

Title (Japanese): ${titleJa}

Content (Japanese Markdown):
${contentJa}`

  const TranslationSchema = z.object({
    titleEn: z.string().min(1),
    contentEn: z.string().min(1),
  })

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const json = JSON.parse(extractJson(text))
  const parsed = TranslationSchema.safeParse(json)
  if (!parsed.success) {
    console.error("Translation schema validation failed:", parsed.error, "raw:", text)
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
