import { useState } from "react"
import { useTranslation } from "react-i18next"
import DepsDropdown from "./DepsDropdown"
import DropdownMenu, { type DropdownOption } from "./DropdownMenu"
import { STATUSES, STATUS_CHIP, TYPES, TYPE_CHIP } from "./task-options"

interface Team {
  id: string
  name: string
  color: string | null
}

interface Member {
  id: string
  name: string
  image: string | null
}

interface Task {
  id: string
  number: number
  title: string
}

interface NewTaskRowProps {
  number: number
  teams: Team[]
  members: Member[]
  allTasks: Task[]
  onCreate: (data: {
    title: string
    description: string
    status: string
    type: string
    dueDate: string | null
    assigneeId: string | null
    teamId: string | null
    dependencies: string[]
  }) => void
}

interface CommitFields {
  status: string
  type: string
  dueDate: string | null
  assigneeId: string | null
  teamId: string | null
  dependencies: string[]
}

export default function NewTaskRow({
  number,
  teams,
  members,
  allTasks,
  onCreate,
}: NewTaskRowProps) {
  const { t } = useTranslation()
  const [titleDraft, setTitleDraft] = useState("")
  const [descDraft, setDescDraft] = useState("")
  // Empty string = unset (shows "—" placeholder via DropdownMenu)
  const [status, setStatus] = useState("")
  const [type, setType] = useState("")
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [dependencies, setDependencies] = useState<string[]>([])

  const statusOptions: DropdownOption[] = STATUSES.map((s) => ({
    value: s,
    label: t(`tasks.status_${s}`),
    chipClass: STATUS_CHIP[s],
  }))

  const typeOptions: DropdownOption[] = TYPES.map((tp) => ({
    value: tp,
    label: t(`tasks.type_${tp}`),
    chipClass: TYPE_CHIP[tp],
  }))

  const assigneeOptions: DropdownOption[] = [
    { value: "", label: "—" },
    ...members.map((m) => ({ value: m.id, label: m.name, image: m.image })),
  ]

  const teamOptions: DropdownOption[] = [
    { value: "", label: "—" },
    ...teams.map((tm) => ({ value: tm.id, label: tm.name, dot: tm.color ?? "#6b7280" })),
  ]

  // Accepts explicit field values to work around async state updates after setX calls
  function commitWith(fields: CommitFields) {
    const trimmed = titleDraft.trim()
    if (!trimmed) return
    onCreate({
      title: trimmed,
      description: descDraft.trim(),
      status: fields.status || "todo",
      type: fields.type || "task",
      dueDate: fields.dueDate,
      assigneeId: fields.assigneeId,
      teamId: fields.teamId,
      dependencies: fields.dependencies,
    })
    setTitleDraft("")
    setDescDraft("")
    setStatus("")
    setType("")
    setDueDate(null)
    setAssigneeId(null)
    setTeamId(null)
    setDependencies([])
  }

  // Current state snapshot — passed when a non-title field triggers creation
  function current(): CommitFields {
    return { status, type, dueDate, assigneeId, teamId, dependencies }
  }

  return (
    <tr className="bg-gray-50/50">
      {/* # */}
      <td className="whitespace-nowrap px-3 py-2 text-sm italic text-gray-300">#{number}</td>

      {/* Status */}
      <td className="overflow-hidden px-3 py-2">
        <DropdownMenu
          value={status}
          options={statusOptions}
          onChange={(v) => {
            setStatus(v)
            commitWith({ ...current(), status: v })
          }}
          variant="chip"
          placeholder="—"
        />
      </td>

      {/* Due Date */}
      <td className="overflow-hidden px-3 py-2">
        <input
          type="date"
          className="rounded border-0 bg-transparent text-sm text-gray-400 focus:ring-1 focus:ring-blue-500"
          value={dueDate ?? ""}
          onChange={(e) => {
            const v = e.target.value || null
            setDueDate(v)
            commitWith({ ...current(), dueDate: v })
          }}
        />
      </td>

      {/* Assignee */}
      <td className="overflow-hidden px-3 py-2">
        <DropdownMenu
          value={assigneeId ?? ""}
          options={assigneeOptions}
          onChange={(v) => {
            const val = v || null
            setAssigneeId(val)
            commitWith({ ...current(), assigneeId: val })
          }}
          searchable
          header={t("tasks.select_assignees")}
          searchPlaceholder={t("tasks.filter_assignee")}
        />
      </td>

      {/* Team */}
      <td className="overflow-hidden px-3 py-2">
        {teams.length > 0 ? (
          <DropdownMenu
            value={teamId ?? ""}
            options={teamOptions}
            onChange={(v) => {
              const val = v || null
              setTeamId(val)
              commitWith({ ...current(), teamId: val })
            }}
          />
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>

      {/* Dependencies */}
      <td
        className="overflow-hidden px-3 py-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DepsDropdown
          taskId=""
          value={dependencies}
          options={allTasks}
          onChange={(ids) => {
            setDependencies(ids)
            commitWith({ ...current(), dependencies: ids })
          }}
        />
      </td>

      {/* Type */}
      <td className="overflow-hidden px-3 py-2">
        <DropdownMenu
          value={type}
          options={typeOptions}
          onChange={(v) => {
            setType(v)
            commitWith({ ...current(), type: v })
          }}
          variant="chip"
          placeholder="—"
        />
      </td>

      {/* Title */}
      <td
        className="break-words px-3 py-2 text-sm"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          className="w-full rounded border-0 bg-transparent text-sm text-gray-500 placeholder:italic placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder={t("tasks.add_task_placeholder")}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => commitWith(current())}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitWith(current())
          }}
        />
      </td>

      {/* Description */}
      <td
        className="break-words px-3 py-2 text-sm"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          className="w-full rounded border-0 bg-transparent text-sm text-gray-400 placeholder:italic placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder={t("tasks.add_desc_placeholder")}
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => commitWith(current())}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitWith(current())
          }}
        />
      </td>
    </tr>
  )
}
