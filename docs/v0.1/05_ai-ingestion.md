# GDGoC Japan Wiki — AI Ingestion Deep Dive (v0.1)

## Purpose

AI ingestion is the core value of this product. Its goal is to turn messy, time-pressured input — brain dumps written right after an event, existing Google Docs, images of whiteboards — into wiki pages that a future chapter member (or a member of a completely different chapter) can act on immediately, without asking anyone.

**Primary quality criterion: Actionability.**
A finished page has succeeded if a successor can read it and move forward on the same task without any follow-up questions.

---

## 1. Knowledge Taxonomy (Page Types)

AI assigns a soft page type label to every ingested page. The label is a suggestion; the author can override it.

| Page Type | When to use | Typical source material |
|-----------|-------------|------------------------|
| `event-report` | Documenting a completed event (Tech Talk, hackathon, workshop, social) | Brain dump post-event, Google Doc event report |
| `speaker-profile` | Recording a speaker or sponsor's details for future reuse | Notes from outreach emails, post-event memory dump |
| `project-log` | Ongoing or completed software/product project handover | README, design docs, team notes |
| `how-to-guide` | Step-by-step instructions for a recurring task | Process brain dump, past email thread |
| `onboarding-guide` | Information for newly joining chapter members | Existing onboarding doc, lead's notes |

---

## 2. Page Structure Templates

Each page type has a primary structure. The **how-to guide** style is the default framing (future-member-first, action-oriented), with **retrospective sections** embedded where appropriate.

### 2.1 Event Report

```
[Info Box]
## 概要 / Overview
## 準備・当日の流れ / Preparation & Day-of Steps   ← How-to style
## よかったこと / What Went Well                    ← Retrospective
## 改善点 / What to Improve                        ← Retrospective
## 次回チェックリスト / Next Time Checklist         ← Action-oriented
## 関連リンク / Related Links
```

### 2.2 Speaker / Sponsor Profile

```
[Info Box]
## 背景・専門分野 / Background & Expertise
## 過去の協力実績 / Past Collaborations
## 連絡方法 / How to Reach Out                     ← Step-by-step
## 注意事項・メモ / Notes
```

### 2.3 Project Log

```
[Info Box]
## 背景・目的 / Background & Goal
## アーキテクチャと主な意思決定 / Architecture & Key Decisions
## 進捗ログ / Progress Log
## 引き継ぎ事項 / Handover Notes                   ← Critical for graduation
## 関連リンク / Related Links
```

### 2.4 How-to Guide

```
[Info Box]
## 概要 / Overview
## 前提条件 / Prerequisites
## 手順 / Steps                                    ← Numbered list
## ヒントと注意点 / Tips & Gotchas
## 関連ページ / Related Pages
```

### 2.5 Onboarding Guide

```
[Info Box]
## このガイドについて / About This Guide
## 対象者 / Who This Is For
## はじめの一歩 / Getting Started                  ← Steps
## 重要な連絡先・リソース / Key Contacts & Resources
## よくある質問 / FAQ
```

---

## 3. Info Box Fields (Metadata Extraction)

AI extracts structured metadata into a prominent info box rendered at the top of each page (Wikipedia infobox style). Fields vary by page type.

### Event Report
| Field | Example |
|-------|---------|
| 開催日時 / Date & Time | 2024-11-03 14:00–18:00 |
| 会場 / Venue | 東北大学 工学部 A棟 101室 |
| イベント種別 / Type | Tech Talk / Hackathon / Workshop / Social |
| 参加者数 / Attendees | 45名 |
| 主催担当 / Organizers | 山田太郎, 鈴木花子 |
| 関連リンク / Links | [申込ページ] [写真] [スライド] |

### Speaker / Sponsor Profile
| Field | Example |
|-------|---------|
| 氏名 / Name | 田中一郎 |
| 所属・役職 / Organization & Title | 株式会社〇〇 エンジニア |
| 連絡先 / Contact | *(sensitive — flagged for review)* |
| 専門トピック / Topics | Flutter, Firebase |
| 対応言語 / Languages | 日本語, English |
| 最終協力日 / Last Collaborated | 2024-06-15 |

### Project Log
| Field | Example |
|-------|---------|
| プロジェクト名 / Name | GDGoC Event Scheduler |
| ステータス / Status | active / completed / archived |
| 技術スタック / Tech Stack | Next.js, Firebase, TypeScript |
| コアメンバー / Core Team | 伊藤, 佐藤 |
| リポジトリ / Repository | *(URL)* |
| 開始日 / Start Date | 2024-04-01 |
| 終了日 / End Date | — |

### How-to Guide
| Field | Example |
|-------|---------|
| 難易度 / Difficulty | 易 / 中 / 難 |
| 所要時間 / Time Required | 約2時間 |
| 前提条件 / Prerequisites | Googleアカウント, 章のGmailグループへの登録 |
| 最終確認日 / Last Verified | 2024-10-01 |

### Onboarding Guide
| Field | Example |
|-------|---------|
| 対象 / Audience | 新規メンバー |
| 最終更新 / Last Updated | 2024-09-01 |

---

## 4. AI Pipeline

A single ingestion session can **create new pages and update existing pages simultaneously** — just like how Claude Code reads files before editing them. The pipeline is split into two Gemini phases to keep context windows focused.

### 4.1 Flow

```
┌─────────────────────────────────────────────────────────┐
│  User Input (text, images, Google Doc URL)              │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
              [Pre-processing]
              ├─ Export Google Doc as PDF (Drive API export endpoint)
              │   └─ Upload PDF to Gemini File API → fileUri
              ├─ Upload images to Gemini File API → fileUri[]
              ├─ Persist files to R2 (ingestion/{userId}/{sessionId}/)
              └─ Create CachedContent (system prompt + user input + file URIs)
                  └─ cacheId reused across Phase 1 + all Phase 2 calls

                           │
                           ▼
         ┌─────────────────────────────────────┐
         │  PHASE 1 — Planner                  │
         │  gemini-3-flash-preview             │
         │  Input: user input                  │
         │       + wiki page index             │
         │         (id, title, summary — all   │
         │          published pages, no body)  │
         │  Output: OperationPlan JSON         │
         │  ├─ operations[type=create]: 0..N   │
         │  └─ operations[type=update]: 0..N   │
         └──────────────┬──────────────────────┘
                        │
                        ▼
              [Fetch full content for pages to update]
              D1: read content_ja for each update target
              Convert TipTap JSON → Markdown (context for Phase 2)

                        │
            ┌───────────┴────────────┐
            │  One call per operation │
            ▼                        ▼
   ┌────────────────┐      ┌──────────────────────┐
   │ PHASE 2a       │      │ PHASE 2b             │
   │ Creator        │      │ Patcher              │
   │ (type=create)  │      │ (type=update)        │
   │                │      │                      │
   │ Input: input + │      │ Input: input +       │
   │   page index   │      │   existing page body │
   │                │      │   (Markdown)         │
   │ Output:        │      │                      │
   │   PageDraft    │      │ Output:              │
   │   JSON         │      │   SectionPatch[]     │
   │   (§4.5)       │      │   JSON (§4.6)        │
   └────────┬───────┘      └──────────┬───────────┘
            └───────────┬─────────────┘
                        │
                        ▼
              [Assemble Changeset]
              Merge sensitive items from all operations

                        │
                 ┌──────┴──────┐
                 │             │
           sensitiveItems   no sensitive
           non-empty?        items
                 │             │
                 ▼             ▼
         [Sensitive content  [Changeset Review UI]
          review modal]
         User resolves
         per item
                 │
                 ▼
         [Changeset Review UI]
         ├─ New pages: full draft editor per page
         └─ Updated pages: diff view (existing vs patched)
         User can edit each, regenerate individual operations

                        │
                        ▼
              [Commit Changeset]
              Atomic D1 writes:
              ├─ INSERT new pages + page_tags
              ├─ Apply section patches to existing pages
              │   └─ Save page version before patching
              └─ Enqueue translation jobs for ALL affected pages
```

### 4.2 Phase 1: Operation Planning

The Planner receives a lightweight page index (no full content) and decides what to create vs update.

**Page index format sent to Planner:**
```json
[
  { "id": "abc123", "title": "イベント運営 > スタッフ管理", "summary": "スタッフ管理の基本方針…", "slug": "event-ops/staff-management" },
  ...
]
```
Max 200 entries. If the wiki has more pages, index is filtered to pages whose title or summary semantically overlap with the user input (pre-filtered with FTS5 before sending to Gemini).

**OperationPlan schema:**
```ts
{
  planRationale: string;          // Brief explanation of the overall plan (shown to user)

  operations: (CreateOperation | UpdateOperation)[];
}

type CreateOperation = {
  type: "create";
  tempId: string;                 // Client-side reference ID (e.g. "new-1")
  suggestedTitle: { ja: string };
  suggestedParentId: string | null;
  pageType: PageType;
  rationale: string;              // Why create this page (shown to user in changeset)
}

type UpdateOperation = {
  type: "update";
  pageId: string;                 // Existing page ID
  pageTitle: string;              // For display in changeset UI
  rationale: string;              // What will change and why (shown to user in changeset)
}
```

**Constraints:**
- Maximum 5 operations per ingestion session.
- Planner must not output `type=update` for a page it cannot justify from the user's input.
- If the input clearly belongs to a new standalone topic with no existing page, Planner outputs only `type=create`.

### 4.3 Phase 2b: Section Patch Schema (for `type=update` operations)

For each `type=update` operation, Phase 2b receives the existing page content as Markdown and produces surgical section patches. **Existing human-written content is never replaced — only added to.**

```ts
{
  pageId: string;

  sectionPatches: {
    headingMatch: string | null;
    // Exact text of the existing heading to target.
    // null = append a new top-level section at the end of the page.

    operation: "append" | "prepend";
    // append: add new content after the last line of the matched section
    // prepend: add new content before the first line of the matched section
    // NOTE: "replace" is intentionally excluded — AI cannot overwrite existing content.

    newHeading?: string;
    // If the patch introduces a distinct new sub-topic, provide a heading for it.
    // The content will be wrapped as a new sub-section under headingMatch.

    content: string;
    // Markdown body of the new content to insert.
  }[];

  sensitiveItems: SensitiveItem[];    // Same schema as §4.6
  actionabilityScore: 1 | 2 | 3;
  actionabilityNotes: string;
}
```

**Example — "Management" page update:**
```json
{
  "pageId": "mgmt-page-id",
  "sectionPatches": [
    {
      "headingMatch": "準備・当日の流れ / Preparation & Day-of Steps",
      "operation": "append",
      "newHeading": "スタッフ管理の実践（2024年秋イベント）",
      "content": "当日は3名のスタッフを担当エリア別に配置しました…"
    },
    {
      "headingMatch": null,
      "operation": "append",
      "newHeading": "次回チェックリスト追記",
      "content": "- [ ] スタッフ割り当て表を2週間前に作成する\n- [ ] …"
    }
  ]
}
```

### 4.4 Language Handling

- AI always processes and outputs content in **Japanese first**, regardless of the input language.
- If input is in English, AI translates to Japanese internally as part of structuring.
- After the changeset is **published** (not on draft save), the Remix action enqueues translation jobs for **all affected pages** (both newly created and updated pages).
- Translation is **not** triggered when a member saves a draft — only when a lead/admin publishes.

### 4.5 Content Format Conversion: Markdown → TipTap JSON

Gemini returns section bodies as **Markdown strings**. Before rendering in the editor or storing in D1, the server converts them to **TipTap JSON**.

**Conversion step (server-side, inside the `/ingest` Remix route action):**

```
Gemini JSON output
  └─ sections[].body / sectionPatches[].content  (Markdown string)
          │
          ▼
  marked (Markdown → HTML)
          │
          ▼
  TipTap generateJSON(html, extensions)
          │
          ▼
  TipTap JSON fragment  ← merged into page document or stored as new page
```

**Rules:**
- Use `marked` for Markdown → HTML conversion; sanitize with `DOMPurify` before passing to TipTap.
- TipTap extensions required: `StarterKit`, `Image`, `Link`, `Table`, `TableRow`, `TableCell`, `TableHeader`.
- For **create** operations: all sections are concatenated into a single TipTap JSON document.
- For **update** operations: the patch TipTap JSON fragment is merged into the existing document at the position indicated by `headingMatch`. The merge locates the target heading node in the existing TipTap JSON and inserts the fragment after/before it.
- Translation input/output: TipTap JSON → Markdown → Gemini → Markdown → TipTap JSON (same as before, applied per-page).

### 4.6 Gemini Output JSON Schema (Phase 2a — `type=create`)

```ts
{
  suggestedPageType:
    | "event-report"
    | "speaker-profile"
    | "project-log"
    | "how-to-guide"
    | "onboarding-guide";

  pageTypeConfidence: "high" | "medium" | "low";

  title: { ja: string };

  summary: { ja: string };           // 1–2 sentences; used as search excerpt

  metadata: {                        // Type-specific key-value pairs (see §3)
    [key: string]: string;
  };

  sections: {
    heading: string;                 // Japanese heading
    body: string;                    // Markdown body
    sectionType:
      | "overview"
      | "steps"
      | "tips"
      | "retrospective-good"
      | "retrospective-improve"
      | "checklist"
      | "contact"
      | "handover"
      | "faq"
      | "other";
  }[];

  suggestedParentId: string | null;  // Existing page ID or null
  suggestedTags: string[];           // Up to 5 tags from taxonomy

  actionabilityScore: 1 | 2 | 3;    // AI self-assessment: 3 = fully actionable
  actionabilityNotes: string;        // What's missing if score < 3

  sensitiveItems: {
    id: string;
    type:
      | "email"
      | "phone"
      | "sns-handle"
      | "financial"
      | "personal-opinion"
      | "credential"
      | "other";
    excerpt: string;                 // The flagged text snippet
    location: string;                // e.g. "metadata.contact" or "sections[2].body"
    suggestion: string;              // e.g. "Replace with [要確認]"
  }[];
}
```

---

### 4.7 Gemini File API and Context Caching

#### Google Docs: Export as PDF → Gemini File API

Google Docs are not extracted as plain text. The server:

1. **Exports the document as PDF** using the Drive API export endpoint:
   ```
   GET https://www.googleapis.com/drive/v3/files/{fileId}/export?mimeType=application/pdf
   Authorization: Bearer {userOAuthToken}
   ```

2. **Uploads the PDF to the Gemini File API** using the Google AI SDK:
   ```ts
   import { GoogleAIFileManager } from '@google/generative-ai/server';

   const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
   const uploadResult = await fileManager.uploadFile(pdfBuffer, {
     mimeType: 'application/pdf',
     displayName: docTitle,
   });
   const fileUri = uploadResult.file.uri;
   // e.g. "https://generativelanguage.googleapis.com/v1beta/files/abc123"
   ```

3. The PDF is referenced in the Gemini prompt as a `fileData` part:
   ```json
   { "fileData": { "mimeType": "application/pdf", "fileUri": "..." } }
   ```

**Why PDF instead of plain text extraction:**
- Preserves tables, lists, and embedded images within the document.
- Gemini natively understands PDF layout; no custom parsing needed.
- Eliminates the 50,000-character truncation workaround for long docs.

**File API limits and fallback:**
- Maximum file size: **20 MB** per PDF.
- Uploaded files expire after 48 hours; no manual deletion required.
- If the PDF exceeds 20 MB, the server falls back to plain-text export (`mimeType=text/plain`) and shows a user warning. Text content is truncated at 50,000 characters if still too large.

#### Images: Gemini File API + R2

Images attached in the ingestion panel are uploaded to **both** the Gemini File API (for AI processing) and Cloudflare R2 (for persistent wiki storage):

```ts
// Upload to Gemini File API for prompt use
const imgUpload = await fileManager.uploadFile(imageBuffer, {
  mimeType: image.mimeType,
});
const fileUri = imgUpload.file.uri;

// Also persist to R2 for the wiki page attachment
await env.BUCKET.put(
  `ingestion/${userId}/${sessionId}/${image.name}`,
  imageBuffer,
);
```

The `fileUri` is embedded as a `fileData` part in the multimodal prompt alongside text and PDF parts.

#### Context Caching (within a single ingestion session)

One ingestion session can issue up to **6 Gemini API calls** (1 Phase 1 + up to 5 Phase 2). The system prompt and user input (text + file URIs) are identical across all calls. Gemini's **context caching** avoids re-sending and re-processing this shared payload every time.

**What is cached:**
```
CachedContent = system_prompt (§5.1) + user_text_input + PDF_fileUri + image_fileUri[]
```

The wiki page index is **not** cached — Phase 1 sends the full 200-entry index and Phase 2a sends a 50-entry subset, so each call appends the index fresh to its instruction.

**Caching lifecycle:**
```
[Start of ingestion session]
        │
        ▼
Create CachedContent via Gemini API
  TTL: 7200s (2 hours) — covers review/editing time
  Store cache name in ingestion_sessions record
        │
        ├──► Phase 1 call:    CachedContent + plannerInstruction + pageIndex[200]
        ├──► Phase 2 call #1: CachedContent + op-specific instruction
        ├──► Phase 2 call #2: CachedContent + op-specific instruction
        ...
        └──► Phase 2 call #N: CachedContent + op-specific instruction

[Cache TTL expires or session ends]
        └─ Gemini auto-deletes cached content after TTL
```

**Implementation (Google AI SDK):**
```ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Create cache once before Phase 1
const cachedContent = await ai.caches.create({
  model: 'models/gemini-3-flash-preview',
  systemInstruction: systemPromptText,   // §5.1
  contents: [
    {
      role: 'user',
      parts: [
        { text: userTextInput },
        { fileData: { mimeType: 'application/pdf', fileUri: docFileUri } },
        ...imageFileUris.map(uri => ({ fileData: { mimeType: 'image/jpeg', fileUri: uri } })),
      ],
    },
  ],
  ttlSeconds: 7200,
});

// Phase 1 — Planner
const model = ai.getGenerativeModelFromCachedContent(cachedContent);
const phase1 = await model.generateContent(
  plannerInstruction + '\n\n' + JSON.stringify(pageIndex),  // page index sent fresh
);

// Phase 2 — one call per operation
for (const op of plan.operations) {
  const model2 = ai.getGenerativeModelFromCachedContent(cachedContent);
  const phase2 = await model2.generateContent(phase2Instruction(op));
}
```

**Minimum cacheable size:** Context caching requires at least **32,768 input tokens** of cached content. If the combined input (system prompt + user text + files) falls below this threshold, caching is skipped silently and each call sends the full payload independently — functionally identical, slightly higher token cost.

**Cost and latency:**
- Cached tokens are billed at approximately 75% lower input token cost on cache hits.
- Phase 2 calls see reduced latency because the model does not re-ingest the full payload.
- Cache storage is billed per hour at a separate (lower) rate.

---

## 5. System Prompt Design

### 5.0 Phase 1 Planner Prompt

```
あなたはGDGoC Japan WikiのAIプランナーです。
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
planRationaleおよびrationaleフィールドは日本語で出力してください。
```

### 5.1 System Prompt (Phase 2 — sent with every generation/patching request)

```
あなたはGDGoC Japan（Google Developer Groups on Campus）のナレッジマネジメントアシスタントです。
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
[ここに §2 の各テンプレートを挿入]

## タグ分類（最大5つ選択）
以下のslugと日本語ラベルを使用してください（03_data-model.mdの正規リストと一致）:
event-operations（イベント運営）/ speaker-management（スピーカー管理）/
sponsor-relations（スポンサー・渉外）/ project（プロジェクト）/
onboarding（新メンバー向け）/ community-ops（コミュニティ運営）/
technical（技術）/ template（テンプレート）
```

### 5.2 User Message Construction

**Phase 1 (Planner) message:**

The system prompt and user input are sent as `CachedContent` (see §4.7). Only the planner instruction and page index are appended fresh.

```
[CachedContent — system prompt (§5.1) + user input below]

## ユーザー入力

### テキスト
{concatenated text inputs}

### Googleドキュメント（PDFファイル）
[fileData part: PDF fileUri from Gemini File API — see §4.7]

### 画像（ファイル）
[fileData parts: image fileUri[] from Gemini File API — see §4.7]

[End CachedContent]

## 既存Wikiページ一覧（最大200件）
{JSON array: [{id, title, summary, slug}, ...]}
※ FTS5で関連性の高いページを上位に並べ替え済み

---
上記をもとに、OperationPlan JSONを出力してください。
```

**Phase 2a (Creator) message** — one call per `type=create` operation:

User input is in `CachedContent`; only the operation instruction and a reduced page index are sent fresh.

```
[CachedContent reused — system prompt + user input]

## ユーザー入力
{text + PDF fileUri + image fileUri[] — via CachedContent; see §4.7}

## 操作計画
{the CreateOperation object from Phase 1}

## 既存Wikiページ構造（親ページ候補選定用）
{page index, max 50}

---
上記の情報をもとに、PageDraft JSONを出力してください。
```

**Phase 2b (Patcher) message** — one call per `type=update` operation:

User input is in `CachedContent`; only the existing page body and operation instruction are sent fresh.

```
[CachedContent reused — system prompt + user input]

## ユーザー入力
{text + PDF fileUri + image fileUri[] — via CachedContent; see §4.7}

## 更新対象ページの現在の内容（Markdown変換済み）
# {existing page title}
{existing page content as Markdown, converted from TipTap JSON}

## 操作計画
{the UpdateOperation object from Phase 1}

---
既存ページの構造・文体・見出しレベルに従い、SectionPatch JSONを出力してください。
既存のコンテンツは削除・置換せず、追記のみ行ってください。
```

### 5.3 Regeneration with Feedback

When the user clicks "Regenerate", their feedback is appended to the original user message:

```
## 前回の出力に対するフィードバック
{user's free-text feedback}

上記フィードバックを反映して、再度JSONを出力してください。
前回の出力を改善し、フィードバックで指摘された点を修正してください。
```

---

## 6. Sensitive Content Review UI

When `sensitiveItems` is non-empty, a modal is shown before the draft editor:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠ 機微情報が見つかりました                                    │
│  以下の項目について、公開前に対応を選択してください。           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. [メールアドレス]  tanaka@example.com                      │
│     場所: metadata.contact                                   │
│     ○ そのまま含める   ● 削除する   ○ [要確認] に置換する    │
│                                                              │
│  2. [財務情報]  会場費 ¥50,000                               │
│     場所: sections[3].body                                   │
│     ○ そのまま含める   ○ 削除する   ● [金額は別途確認] に置換 │
│                                                              │
│                                   [下書きを確認する →]       │
└──────────────────────────────────────────────────────────────┘
```

- Each item shows: type badge, exact excerpt, location in the draft, and three choices.
- Default selection is the AI's `suggestion` for each item.
- User must resolve all items before proceeding to the draft editor.
- Chosen actions are applied to the JSON before rendering the editor.

---

## 7. Actionability Self-Evaluation

The AI outputs `actionabilityScore` (1–3) and `actionabilityNotes`:

| Score | Meaning | Example notes |
|-------|---------|---------------|
| 3 | Fully actionable | — |
| 2 | Mostly actionable; minor gaps | "会場の予約URLが不明。手動で補完してください。" |
| 1 | Significant gaps; input was too sparse | "日付・場所・担当者が不明。入力を補強して再生成することを推奨します。" |

- Score 1 or 2: A yellow banner is shown in the draft editor with `actionabilityNotes`.
- Score 1: A prominent prompt suggests the user add more input and regenerate before publishing.
- Score 3: No banner; editor opens directly.

---

## 8. D1 Updates After Ingestion

All operations in a changeset are committed **atomically** in a single D1 transaction. If any write fails, the entire changeset is rolled back.

**For each `type=create` operation:**
```ts
// INSERT into pages
{
  title_ja, title_en: "",
  content_ja,           // TipTap JSON string
  content_en: "",       // filled by translation job after publish
  translation_status_ja: "human",
  translation_status_en: "missing",
  page_type, page_metadata,
  ingestion_session_id,
  actionability_score,
  status: "draft" | "published",
  // FTS5 (pages_fts) updated automatically via SQLite INSERT trigger
}
// INSERT into page_tags for each suggested tag
```

**For each `type=update` operation:**
```ts
// 1. Save current version to page_versions (before patching)
INSERT INTO page_versions (page_id, content_ja, content_en, title_ja, title_en, edited_by, saved_at)

// 2. Apply section patches to content_ja (TipTap JSON merge)
UPDATE pages SET content_ja = {patched TipTap JSON}, updated_at = now()
// FTS5 (pages_fts) updated automatically via SQLite UPDATE trigger

// 3. Update ingestion_session_id to link this update to the current session
UPDATE pages SET ingestion_session_id = {sessionId}
```

**After commit:**
- `ingestion_sessions` row status set to `"archived"`.
- One Cloudflare Queues message enqueued **per affected page** (both created and updated pages) for translation.
- Translation jobs run independently; a failure in one page's translation does not affect others.

---

## 9. Edge Cases & Guardrails

| Situation | Handling |
|-----------|----------|
| Input is too short (< 50 characters) | Return error: "入力が少なすぎます。もう少し詳しく入力してください。" |
| Input is entirely in English | AI outputs Japanese; translation job will produce English from the structured Japanese |
| Image contains only decorative content (no text/data) | AI ignores it; notes "添付画像からは情報を抽出できませんでした" in `actionabilityNotes` |
| Multiple page types detected | AI picks the dominant type; adds a note: "このページは[project-log]と[how-to-guide]の両方の性質があります。タイプを確認してください。" |
| Gemini API error | Ingestion session status → `error`; user shown retry button; partial results not saved |
| Google Doc PDF exceeds 20 MB (Gemini File API limit) | Server falls back to plain-text export (`text/plain`); truncates at 50,000 characters if still large; shows a warning to the user |
