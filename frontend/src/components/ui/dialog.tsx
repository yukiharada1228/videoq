// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

export const dialogVariants = cva(
  "group/modal-dialog inset-0 w-auto h-auto max-w-none max-h-none border-0 bg-transparent px-4 [container-type:inline-size] [color-scheme:dark] break-words text-std-16N-170 [&:modal]:flex [&:modal]:flex-col [&:modal]:items-center backdrop:bg-opacity-gray-600 forced-colors:backdrop:bg-[#000b] [scrollbar-gutter:stable] data-[scroll=inner]:[scrollbar-gutter:auto]"
)

export type DialogScroll = "inner" | "outer"

export type DialogProps = React.ComponentProps<"dialog"> & {
  scroll?: DialogScroll
  width?: string
}

const Dialog = React.forwardRef<HTMLDialogElement, DialogProps>(
  ({ children, className, scroll, width, style, ...props }, ref) => {
    const mergedStyle: React.CSSProperties = {
      ...style,
      ["--modal-dialog-width" as string]: width ?? "fit-content",
    }

    return (
      <dialog
        ref={ref}
        data-slot="dialog"
        data-scroll={scroll}
        style={mergedStyle}
        className={cn(dialogVariants(), className)}
        {...props}
      >
        <div className="shrink-[9999] w-px h-[calc(120/16*1rem)] min-h-4" />
        {children}
        <div className="shrink-[9999] w-px h-[calc(120/16*1rem)] min-h-4" />
      </dialog>
    )
  }
)
Dialog.displayName = "Dialog"

export type DialogContentProps = React.ComponentProps<"div">

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="dialog-content"
      className={cn(
        "flex flex-col gap-y-3 shrink-0 w-[var(--modal-dialog-width)] min-w-[min(30rem,calc(100cqw-2rem))] max-w-full min-h-0 rounded-8 border border-black bg-white shadow-3 text-solid-gray-800 [color-scheme:light] md:gap-y-4 group-data-[scroll=inner]/modal-dialog:shrink group-data-[scroll=inner]/modal-dialog:[scrollbar-width:thin] group-data-[scroll=inner]/modal-dialog:[&:not(:has(.modal-dialog-scroll-area))]:overflow-y-auto",
        className
      )}
      {...props}
    />
  )
)
DialogContent.displayName = "DialogContent"

export type DialogHeaderProps = React.ComponentProps<"div">

const DialogHeader = React.forwardRef<HTMLDivElement, DialogHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="dialog-header"
      className={cn(
        "flex items-start shrink-0 gap-x-4 min-w-0 pt-2 px-4 md:pt-6 md:px-6",
        className
      )}
      {...props}
    />
  )
)
DialogHeader.displayName = "DialogHeader"

export type DialogHeadingProps = React.ComponentProps<"h2">

const DialogHeading = React.forwardRef<HTMLHeadingElement, DialogHeadingProps>(
  ({ className, tabIndex = -1, ...props }, ref) => (
    <h2
      ref={ref}
      data-slot="dialog-heading"
      tabIndex={tabIndex}
      className={cn(
        "grow min-w-0 text-std-24B-150 md:text-std-28B-150 focus-visible:outline-none focus-visible:rounded-none focus-visible:shadow-none",
        className
      )}
      {...props}
    />
  )
)
DialogHeading.displayName = "DialogHeading"

export type DialogCloseProps = Omit<React.ComponentProps<"button">, "children">

const DialogClose = React.forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      data-slot="dialog-close"
      type={type}
      className={cn(
        "flex items-center shrink-0 gap-x-1 w-fit rounded-6 touch-manipulation pt-1 px-3 pb-1.5 text-solid-gray-800 text-oln-16N-100 hover:bg-solid-gray-50 hover:underline hover:underline-offset-[calc(3/16*1rem)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:bg-yellow-300 focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300",
        className
      )}
      {...props}
    >
      <svg
        className="mt-[calc(2/16*1rem)] w-6 h-6 shrink-0 text-black forced-colors:text-current"
        width="24"
        height="24"
        viewBox="0 0 120 120"
        aria-hidden="true"
      >
        <path
          d="M32 95L25 88L53 60L25 32L32 25L60 53L88 25L95 32L67 60L95 88L88 95L60 67L32 95Z"
          fill="currentColor"
        />
      </svg>
      閉じる
    </button>
  )
)
DialogClose.displayName = "DialogClose"

export type DialogBodyProps = React.ComponentProps<"div">

const DialogBody = React.forwardRef<HTMLDivElement, DialogBodyProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="dialog-body"
      className={cn("shrink-0 min-w-0 px-4 pb-8 md:px-6", className)}
      {...props}
    />
  )
)
DialogBody.displayName = "DialogBody"

export type DialogActionsProps = React.ComponentProps<"div">

const DialogActions = React.forwardRef<HTMLDivElement, DialogActionsProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="dialog-actions"
      className={cn("shrink-0 min-w-0 px-4 pb-4 md:px-6 md:pb-6", className)}
      {...props}
    />
  )
)
DialogActions.displayName = "DialogActions"

export type DialogScrollAreaProps = React.ComponentProps<"div">

const DialogScrollArea = React.forwardRef<
  HTMLDivElement,
  DialogScrollAreaProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="dialog-scroll-area"
    className={cn(
      "modal-dialog-scroll-area flex flex-col gap-y-3 overflow-y-auto [scrollbar-width:thin] [&:not(:first-child)]:-mt-1 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-solid-gray-600 [&:not(:last-child)]:mb-1 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-solid-gray-600 md:gap-y-4 md:[&:not(:first-child)]:mt-2 md:[&:not(:last-child)]:mb-2",
      className
    )}
    {...props}
  />
))
DialogScrollArea.displayName = "DialogScrollArea"

export type DialogRequestCloseEvent = {
  defaultPrevented: boolean
  preventDefault: () => void
}

export type UseDialogOptions = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequestClose?: (event: DialogRequestCloseEvent) => void
}

export type UseDialogResult = {
  dialogProps: {
    ref: React.RefObject<HTMLDialogElement | null>
    "aria-labelledby": string
  }
  headingProps: {
    ref: React.RefObject<HTMLHeadingElement | null>
    id: string
  }
  closeButtonProps: {
    onClick: () => void
  }
}

export const useDialog = (options: UseDialogOptions): UseDialogResult => {
  const { open, onOpenChange, onRequestClose } = options
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const headingId = React.useId()

  const executeRequestClose = () => {
    const event: DialogRequestCloseEvent = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
    }
    onRequestClose?.(event)
    if (!event.defaultPrevented) onOpenChange(false)
  }

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) {
        dialog.showModal()
        headingRef.current?.focus()
      }
    } else {
      if (dialog.open) dialog.close()
    }
  }, [open])

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e: Event) => {
      // File inputs also fire bubbled `cancel` when the OS picker is dismissed.
      // Only treat Escape on the dialog itself as a close request.
      if (e.target !== dialog) return
      e.preventDefault()
      executeRequestClose()
    }

    dialog.addEventListener("cancel", handleCancel)
    return () => dialog.removeEventListener("cancel", handleCancel)
  })

  return {
    dialogProps: {
      ref: dialogRef,
      "aria-labelledby": headingId,
    },
    headingProps: {
      ref: headingRef,
      id: headingId,
    },
    closeButtonProps: {
      onClick: () => executeRequestClose(),
    },
  }
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogClose,
  DialogBody,
  DialogActions,
  DialogScrollArea,
}
