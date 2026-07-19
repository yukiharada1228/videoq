// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

export type MenuListBoxProps = React.ComponentProps<"div">

const MenuListBox = React.forwardRef<HTMLDivElement, MenuListBoxProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="menu-list-box"
      className={cn(
        "relative block w-fit text-solid-gray-900 text-dns-16N-120",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
)
MenuListBox.displayName = "MenuListBox"

export type MenuListBoxOpenerSize = "sm" | "md"
export type MenuListBoxOpenerStyle = "text" | "outlined" | "filled"
export type MenuListBoxOpenerFontWeight = "normal" | "bold"

export const menuListBoxOpenerVariants = cva(
  "group/menu-list-box-opener flex items-center rounded-8 py-1 data-[size=sm]:min-h-[calc(36/16*1rem)] data-[size=sm]:px-1 data-[size=sm]:gap-x-1 data-[size=md]:min-h-11 data-[size=md]:px-4 data-[size=md]:gap-x-2 data-[style=outlined]:border data-[style=outlined]:border-solid-gray-420 data-[style=filled]:bg-solid-gray-50 data-[text-weight=bold]:font-bold hover:bg-solid-gray-50 hover:underline hover:underline-offset-[calc(3/16*1rem)] data-[style=outlined]:hover:border-black data-[style=filled]:hover:bg-solid-gray-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:bg-yellow-300 focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300 data-[style=filled]:focus-visible:bg-solid-gray-50",
  {
    variants: {
      size: {
        sm: "",
        md: "",
      },
      buttonStyle: {
        text: "",
        outlined: "",
        filled: "",
      },
      fontWeight: {
        normal: "",
        bold: "",
      },
    },
    defaultVariants: {
      fontWeight: "normal",
    },
  }
)

export type MenuListBoxOpenerProps = Omit<
  React.ComponentProps<"button">,
  "type"
> & {
  size: MenuListBoxOpenerSize
  buttonStyle: MenuListBoxOpenerStyle
  fontWeight?: MenuListBoxOpenerFontWeight
}

const MenuListBoxOpener = React.forwardRef<
  HTMLButtonElement,
  MenuListBoxOpenerProps
>(
  (
    { className, children, size, buttonStyle, fontWeight = "normal", ...props },
    ref
  ) => (
    <button
      ref={ref}
      type="button"
      data-slot="menu-list-box-opener"
      aria-haspopup="menu"
      data-size={size}
      data-style={buttonStyle}
      data-text-weight={fontWeight}
      className={cn(
        menuListBoxOpenerVariants({ size, buttonStyle, fontWeight }),
        className
      )}
      {...props}
    >
      {children}
      <svg
        aria-hidden={true}
        className="mt-1 shrink-0 w-4 h-4 group-aria-expanded/menu-list-box-opener:rotate-180"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="m20.5 6.6-8 8-8-8L3.1 8l9.4 9.4L21.9 8l-1.4-1.4Z" />
      </svg>
    </button>
  )
)
MenuListBoxOpener.displayName = "MenuListBoxOpener"

export type MenuListBoxPopupProps = React.ComponentProps<"div">

const MenuListBoxPopup = React.forwardRef<
  HTMLDivElement,
  MenuListBoxPopupProps
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="menu-list-box-popup"
    className={cn(
      "absolute top-full left-0 z-10 w-max max-h-[calc((16+44*6.5)/16*1rem)] overflow-y-auto rounded-l-8 border border-solid-gray-420 bg-white py-4 shadow-1",
      className
    )}
    {...props}
  >
    {children}
  </div>
))
MenuListBoxPopup.displayName = "MenuListBoxPopup"

export type MenuItemSelectDetail = {
  selectedValue: string
  selectedIndex: number
}

export type UseMenuListBoxOptions = {
  onMenuItemSelect?: (detail: MenuItemSelectDetail) => void
}

export type UseMenuListBoxReturn = {
  isOpen: boolean
  rootProps: React.ComponentProps<"div">
  openerProps: Partial<React.ComponentProps<"button">>
  popupProps: React.ComponentProps<"div">
}

const focusItem = (items: HTMLElement[], index: number) => {
  for (const item of items) item.setAttribute("tabindex", "-1")
  items[index].setAttribute("tabindex", "0")
  items[index].focus()
}

export function useMenuListBox(
  options?: UseMenuListBoxOptions
): UseMenuListBoxReturn {
  const { onMenuItemSelect } = options ?? {}

  const [isOpen, setIsOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const openerRef = React.useRef<HTMLButtonElement>(null)

  // 'first' | 'last' | null — which item to focus after the menu opens
  const pendingFocusRef = React.useRef<"first" | "last" | null>(null)

  // Focus the correct item after the popup mounts.
  React.useEffect(() => {
    if (!isOpen || pendingFocusRef.current === null) return

    const items = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    )
    if (items.length === 0) return

    focusItem(items, pendingFocusRef.current === "first" ? 0 : items.length - 1)

    pendingFocusRef.current = null
  }, [isOpen])

  React.useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setIsOpen(false)
        openerRef.current?.focus()
      }
    }

    document.addEventListener("click", handleClickOutside)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("click", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen])

  const handleRootBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!isOpen) return
    if (e.relatedTarget && rootRef.current?.contains(e.relatedTarget as Node))
      return
    setIsOpen(false)
  }

  const handleOpenerClick = () => {
    if (isOpen) {
      setIsOpen(false)
    } else {
      pendingFocusRef.current = "first"
      setIsOpen(true)
    }
  }

  const handleOpenerKeydown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const target = e.key === "ArrowDown" ? "first" : "last"
    if (isOpen) {
      const items = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
          []
      )
      if (items.length > 0)
        focusItem(items, target === "first" ? 0 : items.length - 1)
    } else {
      pendingFocusRef.current = target
      setIsOpen(true)
    }
  }

  // Menuitem selection via click delegation on the popup.
  const handlePopupClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(
      '[role="menuitem"]'
    )
    if (!item) return

    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
    )
    const selectedIndex = items.indexOf(item)
    if (selectedIndex === -1) return

    // Prefer data-value attribute; fall back to textContent for plain-text items.
    const selectedValue = item.dataset.value ?? item.textContent?.trim() ?? ""
    onMenuItemSelect?.({ selectedValue, selectedIndex })

    setIsOpen(false)
    openerRef.current?.focus()
  }

  const handlePopupKeydown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
    )
    if (items.length === 0) return

    const currentIndex = items.indexOf(document.activeElement as HTMLElement)

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        if (currentIndex < items.length - 1) focusItem(items, currentIndex + 1)
        break
      case "ArrowUp":
        e.preventDefault()
        if (currentIndex > 0) focusItem(items, currentIndex - 1)
        break
      case "Home":
        e.preventDefault()
        focusItem(items, 0)
        break
      case "End":
        e.preventDefault()
        focusItem(items, items.length - 1)
        break
    }
  }

  return {
    isOpen,
    rootProps: {
      ref: rootRef,
      onBlur: handleRootBlur,
    },
    openerProps: {
      ref: openerRef,
      "aria-expanded": isOpen,
      onClick: handleOpenerClick,
      onKeyDown: handleOpenerKeydown,
    },
    popupProps: {
      onClick: handlePopupClick,
      onKeyDown: handlePopupKeydown,
    },
  }
}

export { MenuListBox, MenuListBoxOpener, MenuListBoxPopup }
