interface TaskWithDueDate {
  dueDate: string | null
}

export function getDateRange(tasks: TaskWithDueDate[]): string[] {
  const tasksWithDates = tasks.filter((t) => t.dueDate)
  if (tasksWithDates.length === 0) return []

  const dates = tasksWithDates.map((t) => t.dueDate as string).sort()
  const start = new Date(dates[0])
  const end = new Date(dates[dates.length - 1])

  // Extend range by 3 days on each side
  start.setDate(start.getDate() - 3)
  end.setDate(end.getDate() + 3)

  const result: string[] = []
  const current = new Date(start)
  while (current <= end) {
    result.push(current.toISOString().split("T")[0])
    current.setDate(current.getDate() + 1)
  }
  return result
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** Format YYYY-MM-DD → YY/MM/DD for compact display */
export function formatDueDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-")
  return `${y.slice(2)}/${m}/${d}`
}

export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr)
  return d.getDay() === 0 || d.getDay() === 6
}
