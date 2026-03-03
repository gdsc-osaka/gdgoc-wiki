/**
 * Google Drive OAuth and export utilities.
 *
 * Scope: drive.readonly — only used to export Google Docs as PDF.
 */

export interface DriveToken {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
}

// ---------------------------------------------------------------------------
// OAuth URL generation
// ---------------------------------------------------------------------------

export function getGoogleDriveAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<DriveToken> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Token exchange failed: ${response.status} ${err}`)
  }

  const data = (await response.json()) as TokenResponse
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Token refresh failed: ${response.status} ${err}`)
  }

  const data = (await response.json()) as TokenResponse
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

// ---------------------------------------------------------------------------
// Google Doc export as PDF (or plain text fallback)
// ---------------------------------------------------------------------------

const MAX_PDF_BYTES = 20 * 1024 * 1024 // 20 MB
const MAX_TEXT_CHARS = 50_000

export interface ExportResult {
  buffer: ArrayBuffer
  mimeType: string
  warning?: string
}

export async function exportDocAsPdf(fileId: string, accessToken: string): Promise<ExportResult> {
  const pdfUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`

  const pdfResponse = await fetch(pdfUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (pdfResponse.ok) {
    const buffer = await pdfResponse.arrayBuffer()
    if (buffer.byteLength <= MAX_PDF_BYTES) {
      return { buffer, mimeType: "application/pdf" }
    }
    // PDF too large — fall back to text
  }

  // Fallback: plain text export
  const textUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`
  const textResponse = await fetch(textUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!textResponse.ok) {
    const err = await textResponse.text()
    throw new Error(`Google Doc export failed: ${textResponse.status} ${err}`)
  }

  let text = await textResponse.text()
  let warning: string | undefined
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS)
    warning = "ドキュメントが大きすぎるため、最初の50,000文字のみ使用されました。"
  }

  const buffer = new TextEncoder().encode(text).buffer as ArrayBuffer
  return {
    buffer,
    mimeType: "text/plain",
    warning:
      warning ?? "PDFのエクスポートに失敗したため、プレーンテキストにフォールバックしました。",
  }
}

// ---------------------------------------------------------------------------
// Extract file ID from Google Doc URL
// ---------------------------------------------------------------------------

export function extractFileId(googleDocUrl: string): string {
  const match = googleDocUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (!match) throw new Error(`Could not extract file ID from URL: ${googleDocUrl}`)
  return match[1]
}
