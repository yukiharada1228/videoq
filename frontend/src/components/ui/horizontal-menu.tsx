import * as React from "react"

import { cn } from "@/lib/utils"

type HorizontalMenuProps = React.ComponentPropsWithoutRef<"ul">

const HorizontalMenu = React.forwardRef<HTMLUListElement, HorizontalMenuProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <ul
        ref={ref}
        data-slot="horizontal-menu"
        className={cn(
          "flex items-stretch border-b border-solid-gray-420 text-solid-gray-900 text-dns-16B-130",
          className
        )}
        {...props}
      >
        {children}
      </ul>
    )
  }
)
HorizontalMenu.displayName = "HorizontalMenu"

type HorizontalMenuItemProps = React.ComponentPropsWithoutRef<"li">

const HorizontalMenuItem = React.forwardRef<
  HTMLLIElement,
  HorizontalMenuItemProps
>(({ className, children, ...props }, ref) => {
  return (
    <li
      ref={ref}
      data-slot="horizontal-menu-item"
      className={cn("relative flex items-stretch", className)}
      {...props}
    >
      {children}
    </li>
  )
})
HorizontalMenuItem.displayName = "HorizontalMenuItem"

const itemInnerBaseStyle = [
  "group/horizontal-menu-item",
  "relative flex items-center gap-1",
  "min-h-16 px-5 py-4",
  // Hover
  "hover:bg-solid-gray-50",
  "hover:after:absolute hover:after:inset-x-0 hover:after:bottom-0 hover:after:border-b-2 hover:after:border-black hover:after:content-['']",
  // Current
  "[&[aria-current]:not([aria-current='false'])]:bg-white [&[aria-current]:not([aria-current='false'])]:text-key-1000",
  "[&[aria-current]:not([aria-current='false'])]:after:absolute [&[aria-current]:not([aria-current='false'])]:after:inset-x-0 [&[aria-current]:not([aria-current='false'])]:after:bottom-0 [&[aria-current]:not([aria-current='false'])]:after:border-b-4 [&[aria-current]:not([aria-current='false'])]:after:border-key-900 [&[aria-current]:not([aria-current='false'])]:after:content-['']",
  // Current + hover
  "[&[aria-current]:not([aria-current='false'])]:hover:text-key-900 [&[aria-current]:not([aria-current='false'])]:hover:underline [&[aria-current]:not([aria-current='false'])]:hover:underline-offset-[calc(3/16*1rem)] [&[aria-current]:not([aria-current='false'])]:hover:decoration-[calc(1/16*1rem)]",
  "[&[aria-current]:not([aria-current='false'])]:hover:after:border-b-4 [&[aria-current]:not([aria-current='false'])]:hover:after:border-key-900",
  // Focus visible
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:rounded-4 focus-visible:bg-yellow-300 focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300",
  "[&[aria-current]:not([aria-current='false'])]:focus-visible:bg-white",
].join(" ")

type HorizontalMenuItemLinkProps = React.ComponentPropsWithoutRef<"a">

const HorizontalMenuItemLink = React.forwardRef<
  HTMLAnchorElement,
  HorizontalMenuItemLinkProps
>(({ className, children, ...props }, ref) => {
  return (
    <a
      ref={ref}
      data-slot="horizontal-menu-item-link"
      className={cn(itemInnerBaseStyle, className)}
      {...props}
    >
      {children}
    </a>
  )
})
HorizontalMenuItemLink.displayName = "HorizontalMenuItemLink"

type HorizontalMenuItemButtonProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  "type"
>

const HorizontalMenuItemButton = React.forwardRef<
  HTMLButtonElement,
  HorizontalMenuItemButtonProps
>(({ className, children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="horizontal-menu-item-button"
      className={cn(itemInnerBaseStyle, className)}
      {...props}
    >
      {children}
    </button>
  )
})
HorizontalMenuItemButton.displayName = "HorizontalMenuItemButton"

export {
  HorizontalMenu,
  HorizontalMenuItem,
  HorizontalMenuItemLink,
  HorizontalMenuItemButton,
  itemInnerBaseStyle,
}
export type {
  HorizontalMenuProps,
  HorizontalMenuItemProps,
  HorizontalMenuItemLinkProps,
  HorizontalMenuItemButtonProps,
}
