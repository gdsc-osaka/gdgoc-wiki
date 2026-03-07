import { useRef } from "react"
import StarredContent from "~/components/StarredContent"

interface StarredDialogProps {
  open: boolean
  onClose: () => void
  lang: "ja" | "en"
  currentPageId?: string
  currentPageTitle?: string
  isStarred?: boolean
  onStarChange?: (starred: boolean) => void
}

export default function StarredDialog({
  open,
  onClose,
  lang,
  currentPageId,
  currentPageTitle,
  isStarred = false,
  onStarChange,
}: StarredDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key === "Escape") onClose()
  }

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      open
      onClick={handleBackdropClick}
      onKeyDown={handleDialogKeyDown}
      className="fixed inset-0 z-50 m-0 flex h-full w-full items-center justify-center bg-black/40 p-0"
      style={{ maxWidth: "none", maxHeight: "none" }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation from inner panel */}
      <div
        className="relative w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <StarredContent
          open={open}
          onClose={onClose}
          lang={lang}
          currentPageId={currentPageId}
          currentPageTitle={currentPageTitle}
          isStarred={isStarred}
          onStarChange={onStarChange}
        />
      </div>
    </dialog>
  )
}
