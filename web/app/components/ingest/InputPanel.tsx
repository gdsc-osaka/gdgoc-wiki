import { useRef, useState } from "react"

interface InputPanelProps {
  driveConnected: boolean
}

const MAX_IMAGES = 5
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
const MIN_TEXT_LENGTH = 50

export default function InputPanel({ driveConnected }: InputPanelProps) {
  const [text, setText] = useState("")
  const [images, setImages] = useState<File[]>([])
  const [docUrl, setDocUrl] = useState("")
  const [errors, setErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function validate(): string[] {
    const errs: string[] = []
    if (text.trim().length < MIN_TEXT_LENGTH) {
      errs.push(`入力が少なすぎます。最低${MIN_TEXT_LENGTH}文字以上入力してください。`)
    }
    return errs
  }

  function handleAddImages(files: FileList | File[]) {
    const arr = Array.from(files)
    const current = images.length
    const errs: string[] = []

    const valid: File[] = []
    for (const f of arr) {
      if (current + valid.length >= MAX_IMAGES) {
        errs.push(`画像は最大${MAX_IMAGES}枚までです。`)
        break
      }
      if (f.size > MAX_IMAGE_SIZE) {
        errs.push(`${f.name} は10MB を超えています。`)
        continue
      }
      if (!f.type.startsWith("image/")) {
        errs.push(`${f.name} は画像ファイルではありません。`)
        continue
      }
      valid.push(f)
    }

    setErrors(errs)
    setImages((prev) => [...prev, ...valid])
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const errs = validate()
    if (errs.length > 0) {
      e.preventDefault()
      setErrors(errs)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleAddImages(e.dataTransfer.files)
    }
  }

  return (
    <form method="post" encType="multipart/form-data" onSubmit={handleSubmit} className="space-y-6">
      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <ul className="list-disc pl-4 text-sm text-red-700">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Text input */}
      <div>
        <label htmlFor="ingest-text" className="mb-1.5 block text-sm font-medium text-gray-700">
          テキスト入力 <span className="text-red-500">*</span>
        </label>
        <textarea
          id="ingest-text"
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="イベントや活動について自由に書いてください（最低50文字）&#10;例: 先日のTech Talkは参加者45名で盛況でした。スピーカーの田中さんは..."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="mt-1 text-right text-xs text-gray-400">{text.length} 文字</p>
      </div>

      {/* Image upload */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-700">
          画像添付（最大{MAX_IMAGES}枚・各10MB以下）
        </p>
        <button
          type="button"
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragging
              ? "border-blue-400 bg-blue-50"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          <p className="text-sm text-gray-500">クリックまたはドラッグ&ドロップで画像を追加</p>
          <input
            ref={fileInputRef}
            type="file"
            name="images"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && handleAddImages(e.target.files)}
          />
        </button>

        {/* Image previews */}
        {images.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={`${img.name}-${img.size}`} className="relative">
                <img
                  src={URL.createObjectURL(img)}
                  alt={img.name}
                  className="h-20 w-20 rounded-md object-cover ring-1 ring-gray-200"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setImages((prev) => prev.filter((f) => f !== img))
                  }}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
                >
                  ×
                </button>
                {/* Hidden input to carry file */}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Google Doc URL */}
      <div>
        <label htmlFor="ingest-doc-url" className="mb-1.5 block text-sm font-medium text-gray-700">
          Googleドキュメント URL
        </label>
        <div className="flex gap-2">
          <input
            id="ingest-doc-url"
            type="url"
            name="googleDocUrl"
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
            placeholder="https://docs.google.com/document/d/..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {driveConnected ? (
            <span className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              接続済み
            </span>
          ) : (
            <a
              href="/api/google-drive/auth"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <GoogleDriveIcon />
              Driveを接続
            </a>
          )}
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          AI で整理する →
        </button>
      </div>
    </form>
  )
}

function GoogleDriveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 87.3 78" aria-hidden="true">
      <path
        d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.05a9 9 0 00-1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a9 9 0 001.2-4.5H60.3l5.85 11.5z"
        fill="#ea4335"
      />
      <path
        d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="M60.3 52.55H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="M73.4 26.05l-12.6-21.55C59 3.1 57.85 2 56.5 1.2L43.65 25 60.3 52.55h27.45a9 9 0 00-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  )
}
