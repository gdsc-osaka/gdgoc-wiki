import puppeteer, { type Browser, type BrowserWorker } from "@cloudflare/puppeteer"

export interface ExtractedUrl {
  id: string
  url: string
  source: "user_text" | "google_doc"
  context: string
}

export interface UrlPdfResult {
  buffer: ArrayBuffer
  title: string
  error?: undefined
}

export interface UrlPdfError {
  buffer?: undefined
  title?: undefined
  error: string
}

const URL_REGEX = /https?:\/\/[^\s<>"')\]},;!？。、）」』】\u3000]+/g

// Google Drive/Docs/Slides/Sheets patterns — already handled by Step 2
const GOOGLE_DRIVE_RE = /^https?:\/\/(docs|drive|slides|sheets)\.google\.com\//

/**
 * Extract URLs from text, excluding Google Drive URLs.
 * Returns deduplicated list with surrounding context snippets.
 */
export function extractUrls(
  text: string,
  source: "user_text" | "google_doc",
  maxUrls = 5,
): ExtractedUrl[] {
  const matches = text.matchAll(URL_REGEX)
  const seen = new Set<string>()
  const results: ExtractedUrl[] = []

  for (const match of matches) {
    const url = match[0]
    if (seen.has(url)) continue
    if (GOOGLE_DRIVE_RE.test(url)) continue
    seen.add(url)

    // Extract ~50 chars of surrounding context
    const idx = match.index ?? 0
    const start = Math.max(0, idx - 25)
    const end = Math.min(text.length, idx + url.length + 25)
    const context = text.slice(start, end).replace(/\n/g, " ").trim()

    results.push({
      id: globalThis.crypto?.randomUUID() ?? `url-${Date.now()}-${results.length}`,
      url,
      source,
      context,
    })

    if (results.length >= maxUrls) break
  }

  return results
}

/**
 * Render a URL as a PDF using Cloudflare Browser Rendering.
 */
export async function fetchUrlAsPdf(
  browser: BrowserWorker,
  url: string,
  timeoutMs = 30000,
): Promise<UrlPdfResult | UrlPdfError> {
  // @cloudflare/puppeteer types don't expose the Workers-specific launch(BrowserWorker) API
  const launchBrowser = (
    puppeteer as unknown as { launch: (endpoint: BrowserWorker) => Promise<Browser> }
  ).launch
  let b: Browser | undefined
  try {
    b = await launchBrowser(browser)
    const page = await b.newPage()
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs })
    const title = await page.title()
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true })
    return { buffer: pdfBuffer.buffer as ArrayBuffer, title }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg }
  } finally {
    if (b) {
      try {
        await b.close()
      } catch {
        // ignore close errors
      }
    }
  }
}
