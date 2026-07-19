// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"
import { type VariantProps, cva } from "class-variance-authority"

import { cn } from "@/lib/utils"
import {
  CloseIcon,
  HamburgerIcon,
  HamburgerMenuButton,
} from "@/components/ui/hamburger-menu-button"

export type DrawerSide = "full" | "right" | "left"

export const drawerVariants = cva(
  "m-[unset] max-h-[unset] bg-white [scrollbar-gutter:stable]",
  {
    variants: {
      side: {
        full: "max-w-[unset] w-full h-dvh",
        right:
          "max-w-full w-72 h-dvh start-auto shadow-2 border-l border-l-transparent backdrop:bg-opacity-gray-100 forced-colors:backdrop:bg-[#000b]",
        left: "max-w-full w-72 h-dvh end-auto shadow-2 border-l border-l-transparent backdrop:bg-opacity-gray-100 forced-colors:backdrop:bg-[#000b]",
      },
    },
    defaultVariants: {
      side: "full",
    },
  }
)

export type DrawerProps = React.ComponentPropsWithoutRef<"dialog"> &
  VariantProps<typeof drawerVariants> & {
    side?: DrawerSide
  }

const Drawer = React.forwardRef<HTMLDialogElement, DrawerProps>(
  ({ className, side = "full", children, ...props }, ref) => {
    return (
      <dialog
        ref={ref}
        data-slot="drawer"
        data-side={side}
        className={cn(drawerVariants({ side }), className)}
        {...props}
      >
        {children}
      </dialog>
    )
  }
)
Drawer.displayName = "Drawer"

export type DrawerTriggerProps = React.ComponentPropsWithoutRef<
  typeof HamburgerMenuButton
> & {
  label?: React.ReactNode
}

const DrawerTrigger = React.forwardRef<HTMLButtonElement, DrawerTriggerProps>(
  ({ className, children, label = "メニュー", ...props }, ref) => {
    return (
      <HamburgerMenuButton
        ref={ref}
        data-slot="drawer-trigger"
        className={cn("p-1", className)}
        {...props}
      >
        {children ?? (
          <>
            <HamburgerIcon className="flex-none" />
            {label}
          </>
        )}
      </HamburgerMenuButton>
    )
  }
)
DrawerTrigger.displayName = "DrawerTrigger"

export type DrawerCloseProps = React.ComponentPropsWithoutRef<
  typeof HamburgerMenuButton
> & {
  label?: React.ReactNode
}

const DrawerClose = React.forwardRef<HTMLButtonElement, DrawerCloseProps>(
  ({ className, children, label = "閉じる", ...props }, ref) => {
    return (
      <HamburgerMenuButton
        ref={ref}
        data-slot="drawer-close"
        className={cn("p-1", className)}
        {...props}
      >
        {children ?? (
          <>
            <CloseIcon className="flex-none" />
            {label}
          </>
        )}
      </HamburgerMenuButton>
    )
  }
)
DrawerClose.displayName = "DrawerClose"

const DrawerHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="drawer-header"
      className={cn("flex justify-end p-4", className)}
      {...props}
    />
  )
})
DrawerHeader.displayName = "DrawerHeader"

const DrawerTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<"h2">
>(({ className, ...props }, ref) => {
  return (
    <h2
      ref={ref}
      data-slot="drawer-title"
      className={cn("sr-only", className)}
      {...props}
    />
  )
})
DrawerTitle.displayName = "DrawerTitle"

const DrawerBody = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<"ul">
>(({ className, ...props }, ref) => {
  return (
    <ul
      ref={ref}
      data-slot="drawer-body"
      className={cn("px-6 py-4", className)}
      {...props}
    />
  )
})
DrawerBody.displayName = "DrawerBody"

export const drawerMenuLinkVariants = cva(
  "flex min-h-[calc(44/16*1rem)] items-center px-4 py-3 text-dns-16N-120 rounded-4 hover:bg-solid-gray-50 hover:underline hover:underline-offset-[calc(3/16*1rem)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:-outline-offset-4 focus-visible:bg-yellow-300 focus-visible:ring-[calc(6/16*1rem)] focus-visible:ring-inset focus-visible:ring-yellow-300"
)

const DrawerMenuLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a">
>(({ className, ...props }, ref) => {
  return (
    <a
      ref={ref}
      data-slot="drawer-menu-link"
      className={cn(drawerMenuLinkVariants(), className)}
      {...props}
    />
  )
})
DrawerMenuLink.displayName = "DrawerMenuLink"

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerMenuLink,
}
