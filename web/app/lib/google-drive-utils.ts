/**
 * Shared (client + server) Google Drive URL validation.
 */

const GOOGLE_DRIVE_URL_RE =
  /^https:\/\/docs\.google\.com\/(document|presentation)\/d\/[a-zA-Z0-9_-]+/

export function isGoogleDriveUrl(url: string): boolean {
  return GOOGLE_DRIVE_URL_RE.test(url)
}
