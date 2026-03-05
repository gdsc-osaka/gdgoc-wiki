const FROM_ADDRESS = "GDGoC Japan Wiki <noreply@gdgoc-osaka.jp>"

export interface InvitationEmailOpts {
  to: string
  role: "lead" | "member" | "viewer"
  chapterName: string
  siteUrl: string
}

/**
 * Sends an invitation email via Cloudflare Email Workers.
 * In non-production environments, logs the email content instead.
 */
export async function sendInvitationEmail(env: Env, opts: InvitationEmailOpts): Promise<void> {
  const { to, role, chapterName, siteUrl } = opts

  const roleLabelEn = role === "lead" ? "Chapter Lead" : role === "member" ? "Member" : "Viewer"

  const subject = `You're invited to join ${chapterName} on GDGoC Japan Wiki`

  const textBody = [
    "Hi,",
    "",
    `You have been invited to join the ${chapterName} chapter on GDGoC Japan Wiki as a ${roleLabelEn}.`,
    "",
    "To accept your invitation, simply sign in with your Google account at:",
    siteUrl,
    "",
    "Your invitation will be automatically applied when you sign in for the first time.",
    "",
    "If you did not expect this invitation, you can safely ignore this email.",
    "",
    "— GDGoC Japan Wiki",
  ].join("\n")

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#111;">
  <h2 style="font-size:20px;">You're invited to GDGoC Japan Wiki</h2>
  <p>You have been invited to join the <strong>${chapterName}</strong> chapter as a <strong>${roleLabelEn}</strong>.</p>
  <p>To accept your invitation, sign in with your Google account:</p>
  <p style="margin:24px 0;">
    <a href="${siteUrl}" style="background:#1a73e8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
      Sign in to GDGoC Japan Wiki
    </a>
  </p>
  <p style="font-size:12px;color:#666;">Your invitation will be automatically applied when you sign in for the first time. If you did not expect this invitation, you can safely ignore this email.</p>
</body>
</html>`

  if (env.ENVIRONMENT !== "production") {
    console.log("[email.server] DEV MODE — would send email:")
    console.log(`  To: ${to}`)
    console.log(`  Subject: ${subject}`)
    console.log(`  Body:\n${textBody}`)
    return
  }

  // Build a minimal RFC 2822 MIME multipart message
  const boundary = `boundary_${Date.now()}`
  const rawMime = [
    `From: ${FROM_ADDRESS}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    textBody,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
    "",
    `--${boundary}--`,
  ].join("\r\n")

  // Dynamic import so this module resolves only in the Workers runtime,
  // not during Vitest / Node.js builds where cloudflare:email doesn't exist.
  const { EmailMessage } = await import("cloudflare:email")
  const message = new EmailMessage(FROM_ADDRESS, to, rawMime)
  await env.MAILER.send(message)
}
