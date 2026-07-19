// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

export type FileInfo = {
  id: string
  name: string
  size: number
  file?: File
  isExisting?: boolean
  errors?: string[]
}

export type FileUploadMessages = {
  error: {
    maxFiles: string
    maxTotalSize: string
    invalidType: string
    maxFileSize: string
    hasFileErrors: string
  }
  announce: {
    dropAvailable: string
    dropUnavailable: string
  }
}

export const fileUploadDefaultMessages: FileUploadMessages = {
  error: {
    maxFiles: "選択できるファイル数が上限を超過しています。",
    maxTotalSize: "選択できるファイルサイズの合計が上限を超過しています。",
    invalidType: "許可されていないファイル形式です。",
    maxFileSize: "ファイルサイズが上限を超過しています。",
    hasFileErrors:
      "選択したファイルにエラーがあります。該当ファイルをチェックしてください。",
  },
  announce: {
    dropAvailable: "ここにドロップできます。",
    dropUnavailable: "ドロップエリア外。",
  },
}

export const parseSize = (sizeStr: string | null): number | null => {
  if (!sizeStr) return null

  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  }

  const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/)
  if (!match) return null

  const value = parseFloat(match[1])
  const unit = match[2] || "b"

  return Math.floor(value * units[unit])
}

export const formatSize = (
  bytes: number,
  precision: number | null = null
): string => {
  if (bytes === 0) return "0B"

  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1
  )

  const decimals = precision !== null ? precision : i > 0 ? 1 : 0
  return `${parseFloat((bytes / k ** i).toFixed(decimals))}${units[i]}`
}

export const parseAcceptAttribute = (accept: string): string[] => {
  if (!accept) return []
  return accept.split(",").map((s) => s.trim().toLowerCase())
}

const getFileExtension = (filename: string): string => {
  const match = filename.match(/\.([^.]+)$/)
  return match ? `.${match[1].toLowerCase()}` : ""
}

export const isFileTypeAllowed = (
  filename: string,
  mimeType: string,
  allowedExtensions: string[]
): boolean => {
  const ext = getFileExtension(filename)

  return allowedExtensions.some((allowed) => {
    if (allowed.includes("/*")) {
      const [category] = allowed.split("/")
      return mimeType.startsWith(`${category}/`)
    }
    if (allowed.startsWith(".")) {
      return ext === allowed
    }
    return mimeType === allowed
  })
}

export type UseFileStateOptions = {
  /** 選択可能なファイル数の上限 */
  maxFiles?: number
  /** 1ファイルあたりの最大サイズ（例: "5MB"） */
  maxFileSize?: string
  /** 合計の最大サイズ（例: "10MB"） */
  maxTotalSize?: string
  /** 許可するファイル形式（accept属性形式） */
  accept?: string
  /** 初期ファイル一覧 */
  initialFiles?: FileInfo[]
  /** カスタムメッセージ */
  messages?: FileUploadMessages
}

export const useFileState = (options: UseFileStateOptions = {}) => {
  const {
    maxFiles = 1,
    maxFileSize,
    maxTotalSize,
    accept = "",
    initialFiles = [],
    messages: customMessages,
  } = options

  const messages = customMessages ?? fileUploadDefaultMessages

  const [files, setFiles] = React.useState<FileInfo[]>(initialFiles)
  const [errors, setErrors] = React.useState<string[]>([])

  const inputRef = React.useRef<HTMLInputElement>(null)
  const selectButtonRef = React.useRef<HTMLButtonElement>(null)

  const maxFileSizeBytes = maxFileSize ? parseSize(maxFileSize) : null
  const maxTotalSizeBytes = maxTotalSize ? parseSize(maxTotalSize) : null
  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const hasError = errors.length > 0
  const isMultiple = maxFiles > 1

  // VoiceOver + Safari でaria-describedbyのキャッシュ問題を回避するためのキー
  // 選択ファイルサマリー要素のIDサフィックスとして使用することで、変更時にIDが変わりキャッシュが無効化される
  const selectionSummarySuffix = `${files.length}-${totalSize}`

  const validateFiles = (
    fileList: FileInfo[]
  ): { errors: string[]; validatedFiles: FileInfo[] } => {
    const newErrors: string[] = []
    const validatedFiles = fileList.map((f) => ({
      ...f,
      errors: f.isExisting ? f.errors : [],
    }))

    const newFiles = validatedFiles.filter((f) => !f.isExisting)

    if (fileList.length > maxFiles) {
      newErrors.push(messages.error.maxFiles)
    }

    const allowedExtensions = parseAcceptAttribute(accept)
    const fileTotalSize = fileList.reduce((sum, f) => sum + (f.size || 0), 0)

    newFiles.forEach((fileInfo) => {
      if (allowedExtensions.length > 0 && fileInfo.file) {
        const mimeType = fileInfo.file.type

        if (!isFileTypeAllowed(fileInfo.name, mimeType, allowedExtensions)) {
          fileInfo.errors = fileInfo.errors || []
          fileInfo.errors.push(messages.error.invalidType)
        }
      }

      if (maxFileSizeBytes !== null && fileInfo.size > maxFileSizeBytes) {
        fileInfo.errors = fileInfo.errors || []
        fileInfo.errors.push(messages.error.maxFileSize)
      }
    })

    if (maxTotalSizeBytes !== null && fileTotalSize > maxTotalSizeBytes) {
      newErrors.push(messages.error.maxTotalSize)
    }

    const hasFileErrors = validatedFiles.some(
      (f) => f.errors && f.errors.length > 0
    )
    if (hasFileErrors) {
      newErrors.unshift(messages.error.hasFileErrors)
    }

    return { errors: newErrors, validatedFiles }
  }

  const addFiles = (newFileList: File[]) => {
    const filesToAdd = isMultiple ? newFileList : newFileList.slice(0, 1)

    // 単一ファイルモードで既存ファイルがある場合は置き換え
    const existingFiles = !isMultiple && files.length > 0 ? [] : files

    const newFiles: FileInfo[] = filesToAdd.map((file) => ({
      id: `file-${Math.random().toString(36).slice(-8)}`,
      file: file,
      name: file.name,
      size: file.size,
      isExisting: false,
      errors: [],
    }))

    const updatedFiles = [...existingFiles, ...newFiles]
    const { errors: newErrors, validatedFiles } = validateFiles(updatedFiles)
    setFiles(validatedFiles)
    setErrors(newErrors)
  }

  const removeFile = (fileId: string, index: number) => {
    const updatedFiles = files.filter((f) => f.id !== fileId)
    const { errors: newErrors, validatedFiles } = validateFiles(updatedFiles)
    setFiles(validatedFiles)
    setErrors(newErrors)

    if (updatedFiles.length === 0) {
      selectButtonRef.current?.focus()
    } else if (index < updatedFiles.length) {
      const nextButton = document.getElementById(
        `${updatedFiles[index].id}-remove`
      )
      nextButton?.focus()
    } else {
      const lastButton = document.getElementById(
        `${updatedFiles[updatedFiles.length - 1].id}-remove`
      )
      lastButton?.focus()
    }
  }

  const handleSelectButtonClick = () => {
    inputRef.current?.click()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || [])
    addFiles(fileList)
    if (inputRef.current) {
      inputRef.current.value = ""
    }
    selectButtonRef.current?.focus()
  }

  return {
    // State
    files,
    errors,
    totalSize,
    hasError,
    isMultiple,
    maxFileSizeBytes,
    maxTotalSizeBytes,
    selectionSummarySuffix,

    // Refs
    inputRef,
    selectButtonRef,

    // Actions
    setFiles,
    setErrors,
    addFiles,
    removeFile,
    validateFiles,

    // Handlers
    handleSelectButtonClick,
    handleInputChange,

    // Messages
    messages,
  }
}

export type UseFileDropOptions = {
  /** ドラッグ＆ドロップを有効化 */
  droppable?: boolean
  /** 全画面ドロップエリアを有効化 */
  dropAreaExpandable?: boolean
  /** ファイル追加時のコールバック */
  onFilesAdded: (files: File[]) => void
  /** フォーカスを戻すためのref */
  focusTargetRef?: React.RefObject<HTMLElement | null>
  /** カスタムメッセージ */
  messages?: FileUploadMessages
}

// 全画面ドロップエリアの排他制御用
const expandedDropAreaState = {
  activeCallback: null as (() => void) | null,
}

const registerExpandedDropArea = (callback: () => void) => {
  if (
    expandedDropAreaState.activeCallback &&
    expandedDropAreaState.activeCallback !== callback
  ) {
    expandedDropAreaState.activeCallback()
  }
  expandedDropAreaState.activeCallback = callback
}

const unregisterExpandedDropArea = (callback: () => void) => {
  if (expandedDropAreaState.activeCallback === callback) {
    expandedDropAreaState.activeCallback = null
  }
}

export const useFileDrop = (options: UseFileDropOptions) => {
  const {
    dropAreaExpandable = false,
    onFilesAdded,
    focusTargetRef,
    messages: customMessages,
  } = options

  const messages = customMessages ?? fileUploadDefaultMessages

  const [isDragOver, setIsDragOver] = React.useState(false)
  const [isExpandedDropArea, setIsExpandedDropArea] = React.useState(false)
  const [showViewportOverlay, setShowViewportOverlay] = React.useState(false)
  const [announcerText, setAnnouncerText] = React.useState("")
  const [announcerAssertiveText, setAnnouncerAssertiveText] = React.useState("")

  const dragCounterRef = React.useRef(0)
  const announcerTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const dragOverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const dropAnnounceIntervalRef = React.useRef<ReturnType<
    typeof setInterval
  > | null>(null)
  const collapseCallbackRef = React.useRef(() => setIsExpandedDropArea(false))

  const announceText = (text: string, assertive = false) => {
    if (announcerTimerRef.current) {
      clearTimeout(announcerTimerRef.current)
    }

    const setText = assertive ? setAnnouncerAssertiveText : setAnnouncerText

    setText("")
    announcerTimerRef.current = setTimeout(() => {
      setText(text)
      announcerTimerRef.current = setTimeout(() => {
        setText("")
      }, 1000)
    }, 100)
  }

  const stopDropAnnounce = () => {
    if (dropAnnounceIntervalRef.current) {
      clearInterval(dropAnnounceIntervalRef.current)
      dropAnnounceIntervalRef.current = null
    }
  }

  const startDropAnnounce = () => {
    stopDropAnnounce()
    const message = messages.announce.dropAvailable
    announceText(message, true)

    dropAnnounceIntervalRef.current = setInterval(() => {
      announceText(message)
    }, 3000)
  }

  const handleExpandedDropAreaChange = (checked: boolean) => {
    setIsExpandedDropArea(checked)
    if (checked) {
      registerExpandedDropArea(collapseCallbackRef.current)
    } else {
      unregisterExpandedDropArea(collapseCallbackRef.current)
    }
  }

  // ドロップエリア用ハンドラ
  const handleDragEnter = () => {
    dragCounterRef.current++
    if (dragCounterRef.current === 1) {
      setIsDragOver(true)
      startDropAnnounce()
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }

  const handleDragLeave = () => {
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragOver(false)
      stopDropAnnounce()
      announceText(messages.announce.dropUnavailable, true)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    stopDropAnnounce()

    const fileList = Array.from(e.dataTransfer?.files || [])
    onFilesAdded(fileList)
    focusTargetRef?.current?.focus()
  }

  // ビューポートオーバーレイ用ハンドラ
  const handleViewportDragEnter = () => {
    dragCounterRef.current++
    if (dragCounterRef.current === 1) {
      startDropAnnounce()
    }
  }

  const handleViewportDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "copy"

    if (dragOverTimerRef.current) {
      clearTimeout(dragOverTimerRef.current)
    }

    dragOverTimerRef.current = setTimeout(() => {
      if (showViewportOverlay) {
        dragCounterRef.current = 0
        setShowViewportOverlay(false)
      }
    }, 300)
  }

  const handleViewportDragLeave = () => {
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setShowViewportOverlay(false)
      stopDropAnnounce()
      announceText(messages.announce.dropUnavailable, true)
    }
  }

  const handleViewportDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setShowViewportOverlay(false)
    stopDropAnnounce()

    const fileList = Array.from(e.dataTransfer?.files || [])
    onFilesAdded(fileList)
    focusTargetRef?.current?.focus()
  }

  // ドキュメント全体のドラッグオーバーイベント
  React.useEffect(() => {
    if (!dropAreaExpandable) return

    const handleDocumentDragOver = (e: globalThis.DragEvent) => {
      if (isExpandedDropArea) {
        e.preventDefault()
        setShowViewportOverlay(true)
      }
    }

    document.documentElement.addEventListener(
      "dragover",
      handleDocumentDragOver
    )
    return () => {
      document.documentElement.removeEventListener(
        "dragover",
        handleDocumentDragOver
      )
    }
  }, [dropAreaExpandable, isExpandedDropArea])

  // クリーンアップ
  React.useEffect(() => {
    const collapseCallback = collapseCallbackRef.current
    return () => {
      if (announcerTimerRef.current) {
        clearTimeout(announcerTimerRef.current)
      }
      if (dragOverTimerRef.current) {
        clearTimeout(dragOverTimerRef.current)
      }
      stopDropAnnounce()
      // 全画面ドロップエリアの登録解除
      unregisterExpandedDropArea(collapseCallback)
    }
  }, [])

  return {
    // State
    isDragOver,
    isExpandedDropArea,
    showViewportOverlay,
    announcerText,
    announcerAssertiveText,

    // Handlers
    handleExpandedDropAreaChange,

    // Drop area handlers
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,

    // Viewport overlay handlers
    handleViewportDragEnter,
    handleViewportDragOver,
    handleViewportDragLeave,
    handleViewportDrop,
  }
}

export type UseFileUploadOptions = {
  /** 選択可能なファイル数の上限 */
  maxFiles?: number
  /** 1ファイルあたりの最大サイズ（例: "5MB"） */
  maxFileSize?: string
  /** 合計の最大サイズ（例: "10MB"） */
  maxTotalSize?: string
  /** 許可するファイル形式（accept属性形式） */
  accept?: string
  /** ドラッグ＆ドロップを有効化 */
  droppable?: boolean
  /** 全画面ドロップエリアを有効化 */
  dropAreaExpandable?: boolean
  /** 初期ファイル一覧 */
  initialFiles?: FileInfo[]
  /** カスタムメッセージ */
  messages?: FileUploadMessages
}

export const useFileUpload = (options: UseFileUploadOptions = {}) => {
  const {
    maxFiles,
    maxFileSize,
    maxTotalSize,
    accept,
    droppable = false,
    dropAreaExpandable = false,
    initialFiles,
    messages,
  } = options

  const fileState = useFileState({
    maxFiles,
    maxFileSize,
    maxTotalSize,
    accept,
    initialFiles,
    messages,
  })

  const fileDrop = useFileDrop({
    droppable,
    dropAreaExpandable,
    onFilesAdded: fileState.addFiles,
    focusTargetRef: fileState.selectButtonRef,
    messages,
  })

  return {
    // From useFileState
    files: fileState.files,
    errors: fileState.errors,
    totalSize: fileState.totalSize,
    hasError: fileState.hasError,
    isMultiple: fileState.isMultiple,
    maxFileSizeBytes: fileState.maxFileSizeBytes,
    maxTotalSizeBytes: fileState.maxTotalSizeBytes,
    selectionSummarySuffix: fileState.selectionSummarySuffix,
    inputRef: fileState.inputRef,
    selectButtonRef: fileState.selectButtonRef,
    setFiles: fileState.setFiles,
    setErrors: fileState.setErrors,
    addFiles: fileState.addFiles,
    removeFile: fileState.removeFile,
    validateFiles: fileState.validateFiles,
    handleSelectButtonClick: fileState.handleSelectButtonClick,
    handleInputChange: fileState.handleInputChange,
    messages: fileState.messages,

    // From useFileDrop
    isDragOver: fileDrop.isDragOver,
    isExpandedDropArea: fileDrop.isExpandedDropArea,
    showViewportOverlay: fileDrop.showViewportOverlay,
    announcerText: fileDrop.announcerText,
    announcerAssertiveText: fileDrop.announcerAssertiveText,
    handleExpandedDropAreaChange: fileDrop.handleExpandedDropAreaChange,
    handleDragEnter: fileDrop.handleDragEnter,
    handleDragOver: fileDrop.handleDragOver,
    handleDragLeave: fileDrop.handleDragLeave,
    handleDrop: fileDrop.handleDrop,
    handleViewportDragEnter: fileDrop.handleViewportDragEnter,
    handleViewportDragOver: fileDrop.handleViewportDragOver,
    handleViewportDragLeave: fileDrop.handleViewportDragLeave,
    handleViewportDrop: fileDrop.handleViewportDrop,
  }
}

export type FileUploadProps = React.ComponentProps<"div"> & {
  maxFiles?: number
  hasError?: boolean
  droppable?: boolean
}

const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  (props, ref) => {
    const {
      children,
      className,
      maxFiles = 1,
      hasError = false,
      droppable = false,
      ...rest
    } = props

    const isMultiple = maxFiles > 1

    return (
      <div
        ref={ref}
        data-slot="file-upload"
        className={cn(
          "group/file-upload text-solid-gray-800 text-std-16N-170 [overflow-wrap:anywhere]",
          className
        )}
        data-multiple={isMultiple ? "true" : "false"}
        data-has-error={hasError ? "true" : undefined}
        data-droppable={droppable ? "true" : undefined}
        {...rest}
      >
        {children}
      </div>
    )
  }
)
FileUpload.displayName = "FileUpload"

export type FileUploadInputProps = Omit<React.ComponentProps<"input">, "type">

const FileUploadInput = React.forwardRef<
  HTMLInputElement,
  FileUploadInputProps
>((props, ref) => {
  const { className, ...rest } = props

  return (
    <input
      ref={ref}
      type="file"
      data-slot="file-upload-input"
      className={cn("hidden", className)}
      {...rest}
    />
  )
})
FileUploadInput.displayName = "FileUploadInput"

export type FileUploadDropAreaProps = React.ComponentProps<"div"> & {
  isDragOver?: boolean
}

const FileUploadDropArea = React.forwardRef<
  HTMLDivElement,
  FileUploadDropAreaProps
>((props, ref) => {
  const { children, className, isDragOver = false, ...rest } = props

  return (
    <div
      ref={ref}
      data-slot="file-upload-drop-area"
      className={cn(
        "group/drop-area rounded-8 p-8 border border-solid-gray-536 bg-solid-gray-50 group-data-[has-error=true]/file-upload:border-error-1 data-[dragover=true]:outline data-[dragover=true]:outline-4 data-[dragover=true]:outline-success-1 data-[dragover=true]:-outline-offset-4 data-[dragover=true]:bg-green-50",
        className
      )}
      data-dragover={isDragOver ? "true" : undefined}
      {...rest}
    >
      {children}
    </div>
  )
})
FileUploadDropArea.displayName = "FileUploadDropArea"

export type FileUploadFileListProps = React.ComponentProps<"ul">

const FileUploadFileList = React.forwardRef<
  HTMLUListElement,
  FileUploadFileListProps
>((props, ref) => {
  const { children, className, ...rest } = props

  return (
    <ul
      ref={ref}
      data-slot="file-upload-file-list"
      className={cn("mt-4 p-0 list-none [counter-reset:file-item]", className)}
      {...rest}
    >
      {children}
    </ul>
  )
})
FileUploadFileList.displayName = "FileUploadFileList"

export type FileUploadFileItemProps = React.ComponentProps<"li"> & {
  hasError?: boolean
}

const FileUploadFileItem = React.forwardRef<
  HTMLLIElement,
  FileUploadFileItemProps
>((props, ref) => {
  const { children, className, hasError = false, ...rest } = props

  return (
    <li
      ref={ref}
      data-slot="file-upload-file-item"
      className={cn(
        "group/file-item flex items-baseline [counter-increment:file-item] [&+&]:mt-1",
        className
      )}
      data-error={hasError ? "true" : undefined}
      {...rest}
    >
      {children}
    </li>
  )
})
FileUploadFileItem.displayName = "FileUploadFileItem"

export type FileUploadFileMarkerProps = React.ComponentProps<"div">

const FileUploadFileMarker = React.forwardRef<
  HTMLDivElement,
  FileUploadFileMarkerProps
>((props, ref) => {
  const { className, ...rest } = props

  return (
    <div
      ref={ref}
      data-slot="file-upload-file-marker"
      className={cn(
        "shrink-0 group-data-[multiple=true]/file-upload:w-8 group-data-[multiple=true]/file-upload:before:content-[counter(file-item)'.'] group-data-[multiple=false]/file-upload:flex group-data-[multiple=false]/file-upload:self-start group-data-[multiple=false]/file-upload:justify-center group-data-[multiple=false]/file-upload:items-center group-data-[multiple=false]/file-upload:w-6 group-data-[multiple=false]/file-upload:h-[calc(30/16*1rem)] group-data-[multiple=false]/file-upload:before:w-1.5 group-data-[multiple=false]/file-upload:before:h-1.5 group-data-[multiple=false]/file-upload:before:rounded-full group-data-[multiple=false]/file-upload:before:bg-current group-data-[multiple=false]/file-upload:before:content-[''] group-data-[multiple=false]/file-upload:forced-colors:before:bg-[CanvasText]",
        className
      )}
      {...rest}
    />
  )
})
FileUploadFileMarker.displayName = "FileUploadFileMarker"

export type FileUploadFileInfoProps = React.ComponentProps<"div">

const FileUploadFileInfo = React.forwardRef<
  HTMLDivElement,
  FileUploadFileInfoProps
>((props, ref) => {
  const { children, className, ...rest } = props

  return (
    <div
      ref={ref}
      data-slot="file-upload-file-info"
      className={cn(
        "flex-1 min-w-0 group-data-[error=true]/file-item:border-l-4 group-data-[error=true]/file-item:border-error-1 group-data-[error=true]/file-item:pl-2 group-data-[error=true]/file-item:text-error-1",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
})
FileUploadFileInfo.displayName = "FileUploadFileInfo"

export type FileUploadFileNameProps = React.ComponentProps<"span">

const FileUploadFileName = React.forwardRef<
  HTMLSpanElement,
  FileUploadFileNameProps
>((props, ref) => {
  const { children, className, ...rest } = props

  return (
    <span
      ref={ref}
      data-slot="file-upload-file-name"
      className={cn("mr-4 font-bold", className)}
      {...rest}
    >
      {children}
    </span>
  )
})
FileUploadFileName.displayName = "FileUploadFileName"

export type FileUploadFileMetaProps = React.ComponentProps<"span">

const FileUploadFileMeta = React.forwardRef<
  HTMLSpanElement,
  FileUploadFileMetaProps
>((props, ref) => {
  const { children, className, ...rest } = props

  return (
    <span
      ref={ref}
      data-slot="file-upload-file-meta"
      className={cn(
        "text-solid-gray-600 group-data-[error=true]/file-item:text-inherit",
        className
      )}
      {...rest}
    >
      {children}
    </span>
  )
})
FileUploadFileMeta.displayName = "FileUploadFileMeta"

export type FileUploadViewportOverlayProps = React.ComponentProps<"div">

const FileUploadViewportOverlay = (props: FileUploadViewportOverlayProps) => {
  const { children, className, ...rest } = props

  if (typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div
      data-slot="file-upload-viewport-overlay"
      className={cn(
        "fixed inset-0 z-[9999] border-4 border-success-1 bg-green-50",
        className
      )}
      {...rest}
    >
      {children}
    </div>,
    document.body
  )
}
FileUploadViewportOverlay.displayName = "FileUploadViewportOverlay"

export type FileUploadViewportOverlayMessageProps = React.ComponentProps<"div">

const FileUploadViewportOverlayMessage = React.forwardRef<
  HTMLDivElement,
  FileUploadViewportOverlayMessageProps
>((props, ref) => {
  const { children, className, ...rest } = props

  return (
    <div
      ref={ref}
      data-slot="file-upload-viewport-overlay-message"
      className={cn(
        "flex justify-center content-center flex-wrap box-border w-full h-full p-[calc(2rem-4px)] text-[clamp(calc(18/16*1rem),0.75rem+1.875vw,calc(48/16*1rem))] font-bold pointer-events-none",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
})
FileUploadViewportOverlayMessage.displayName =
  "FileUploadViewportOverlayMessage"

export {
  FileUpload,
  FileUploadInput,
  FileUploadDropArea,
  FileUploadFileList,
  FileUploadFileItem,
  FileUploadFileMarker,
  FileUploadFileInfo,
  FileUploadFileName,
  FileUploadFileMeta,
  FileUploadViewportOverlay,
  FileUploadViewportOverlayMessage,
}
