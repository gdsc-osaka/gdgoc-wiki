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

### 4.1 Flow

```
┌─────────────────────────────────────────────────────────┐
│  User Input (text, images, Google Doc URL)              │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
              [Pre-processing]
              ├─ Fetch Google Doc text via Docs API
              ├─ Upload images to Firebase Storage
              └─ Assemble multimodal payload

                           │
                           ▼
              [Single-pass Gemini call]
              Model: gemini-3-flash-preview
              ├─ Classify page type
              ├─ Extract info box metadata
              ├─ Generate structured sections
              ├─ Flag sensitive items
              └─ Self-evaluate actionability
              Output: structured JSON (see §4.3)

                           │
                    ┌──────┴───────┐
                    │              │
              sensitiveItems?    No sensitive items
              non-empty?
                    │              │
                    ▼              ▼
            [Sensitive content  [Show draft editor]
             review modal]
            User decides per
            item: Keep / Remove
            / Placeholder
                    │
                    ▼
            [Updated draft shown in editor]

                           │
                           ▼
              [Author reviews & edits draft]
              ├─ Edit title, sections, metadata
              ├─ Change page type label
              ├─ Adjust parent page & tags
              └─ Optionally: "Regenerate with feedback"

                           │
                           ▼
              [Publish / Save Draft]
              └─ Write to Firestore (Japanese content)
              └─ Trigger translation job → English version
```

### 4.2 Language Handling

- AI always processes and outputs content in **Japanese first**, regardless of the input language.
- If input is in English, AI translates to Japanese internally as part of structuring.
- After the Japanese page is published (or saved as draft), a separate `POST /api/translate` call generates the English version using gemini-3-flash-preview.
- The English version is stored in `pages/{id}.content.en` and `pages/{id}.title.en`.

### 4.3 Gemini Output JSON Schema

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

## 5. System Prompt Design

### 5.1 System Prompt (sent with every ingestion request)

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
イベント運営 / スピーカー管理 / スポンサー / プロジェクト / 新メンバー向け /
渉外・外部連携 / 技術 / コミュニティ運営 / テンプレート
```

### 5.2 User Message Construction

The user message is assembled programmatically from the ingestion session inputs:

```
## 入力情報

### テキスト
{concatenated text inputs}

### Googleドキュメント
{extracted Google Doc content}

### 画像
{image_1: [inline image data]}
{image_2: [inline image data]}
...

## 既存のWikiページ構造（親ページ候補選定用）
{list of existing page titles and IDs, max 50}

---
上記の情報をもとに、JSONスキーマに従ってWikiページの下書きを生成してください。
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

## 8. Firestore Updates After Ingestion

On publish, the following fields are written to `pages/{id}`:

```ts
{
  // Standard page fields (see data-model.md)
  title: { ja: string; en: "" },       // en filled after translation job
  content: { ja: string; en: "" },
  translationStatus: { ja: "human", en: "missing" },

  // Ingestion-specific fields
  pageType: string;                    // e.g. "event-report"
  pageMetadata: { [key: string]: string };  // Info box fields
  ingestionSessionId: string;          // Reference to ingestionSessions doc
  actionabilityScore: 1 | 2 | 3;
}
```

After the Japanese page is saved, a background job calls `POST /api/translate` to populate `content.en`, `title.en`, and set `translationStatus.en = "ai"`.

---

## 9. Edge Cases & Guardrails

| Situation | Handling |
|-----------|----------|
| Input is too short (< 50 characters) | Return error: "入力が少なすぎます。もう少し詳しく入力してください。" |
| Input is entirely in English | AI outputs Japanese; translation job will produce English from the structured Japanese |
| Image contains only decorative content (no text/data) | AI ignores it; notes "添付画像からは情報を抽出できませんでした" in `actionabilityNotes` |
| Multiple page types detected | AI picks the dominant type; adds a note: "このページは[project-log]と[how-to-guide]の両方の性質があります。タイプを確認してください。" |
| Gemini API error | Ingestion session status → `error`; user shown retry button; partial results not saved |
| Input exceeds Gemini context limit | Pre-processing truncates Google Doc content to 50,000 characters with a user warning; images are always sent in full |
