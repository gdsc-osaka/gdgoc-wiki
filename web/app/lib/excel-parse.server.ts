import * as XLSX from "xlsx"

export function parseExcelToMarkdown(buffer: ArrayBuffer): string {
  const wb = XLSX.read(buffer, { type: "array" })
  const sections: string[] = []
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" })
    if (rows.length === 0) continue
    const md = rowsToMarkdownTable(rows)
    sections.push(`## ${sheetName}\n\n${md}`)
  }
  return sections.join("\n\n")
}

function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return ""
  const header = rows[0].map((c) => String(c ?? ""))
  const sep = header.map(() => "---")
  const body = rows.slice(1).map((r) => r.map((c) => String(c ?? "")))
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ]
  return lines.join("\n")
}
