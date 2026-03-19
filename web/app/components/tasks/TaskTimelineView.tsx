import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import TaskStatusBadge from "./TaskStatusBadge"

interface Task {
  id: string
  number: number
  title: string
  status: string
  type: string
  dueDate: string | null
  assigneeId: string | null
  teamId: string | null
}

interface Member {
  id: string
  name: string
}

interface TaskTimelineViewProps {
  tasks: Task[]
  members: Member[]
  onTaskClick: (taskId: string) => void
}

function getDateRange(tasks: Task[]): string[] {
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr)
  return d.getDay() === 0 || d.getDay() === 6
}

export default function TaskTimelineView({ tasks, members, onTaskClick }: TaskTimelineViewProps) {
  const { t } = useTranslation()

  const dates = useMemo(() => getDateRange(tasks), [tasks])

  // Group tasks by assignee
  const assigneeGroups = useMemo(() => {
    const groups = new Map<string | null, Task[]>()
    for (const task of tasks) {
      if (!task.dueDate) continue
      const key = task.assigneeId
      const list = groups.get(key) || []
      list.push(task)
      groups.set(key, list)
    }
    return groups
  }, [tasks])

  const tasksWithoutDates = tasks.filter((t) => !t.dueDate)

  if (dates.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">{t("tasks.timeline_no_dates")}</div>
    )
  }

  const today = new Date().toISOString().split("T")[0]

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto border border-gray-200">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-10 min-w-[150px] bg-gray-50 px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                {t("tasks.col_assignee")}
              </th>
              {dates.map((date) => (
                <th
                  key={date}
                  className={`min-w-[80px] px-1 py-2 text-center text-xs font-medium ${
                    date === today
                      ? "bg-blue-50 text-blue-600"
                      : isWeekend(date)
                        ? "bg-gray-100 text-gray-400"
                        : "text-gray-500"
                  }`}
                >
                  {formatDate(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(assigneeGroups.entries()).map(([assigneeId, assigneeTasks]) => {
              const member = members.find((m) => m.id === assigneeId)
              return (
                <tr key={assigneeId ?? "unassigned"} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-medium text-gray-700">
                    {member?.name ?? t("tasks.filter_unassigned")}
                  </td>
                  {dates.map((date) => {
                    const dateTasks = assigneeTasks.filter((t) => t.dueDate === date)
                    return (
                      <td
                        key={date}
                        className={`px-1 py-1 ${
                          date === today ? "bg-blue-50/50" : isWeekend(date) ? "bg-gray-50" : ""
                        }`}
                      >
                        <div className="flex flex-col gap-0.5">
                          {dateTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => onTaskClick(task.id)}
                              className={`w-full truncate px-1 py-0.5 text-left text-xs text-gray-700 hover:opacity-80 ${
                                {
                                  done: "bg-blue-100",
                                  in_progress: "bg-yellow-100",
                                  todo: "bg-green-100",
                                  cancelled: "bg-gray-100",
                                  duplicated: "bg-gray-100",
                                }[task.status] ?? "bg-gray-100"
                              }`}
                              title={`#${task.number} ${task.title}`}
                            >
                              #{task.number}
                            </button>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Tasks without due dates */}
      {tasksWithoutDates.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-500">{t("tasks.no_due_date")}</h3>
          <div className="flex flex-wrap gap-2">
            {tasksWithoutDates.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onTaskClick(task.id)}
                className="inline-flex items-center gap-1 border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50"
              >
                <span className="text-gray-400">#{task.number}</span>
                <span>{task.title}</span>
                <TaskStatusBadge status={task.status} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
