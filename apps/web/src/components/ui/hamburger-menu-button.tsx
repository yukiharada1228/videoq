import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/digital-agency/cn"

const hamburgerMenuButtonVariants = cva(
  "flex w-fit touch-manipulation items-center gap-x-1 rounded-6 px-3 pb-1.5 pt-1 text-oln-16N-100 hover:bg-solid-gray-50 hover:underline hover:underline-offset-[calc(3/16*1rem)] focus-visible:bg-yellow-300 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300"
)

const HamburgerMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(({ className, children, type = "button", ...props }, ref) => {
  return (
    <button
      ref={ref}
      data-slot="hamburger-menu-button"
      type={type}
      className={cn(hamburgerMenuButtonVariants(), className)}
      {...props}
    >
      {children}
    </button>
  )
})
HamburgerMenuButton.displayName = "HamburgerMenuButton"

type HamburgerIconProps = React.ComponentPropsWithoutRef<"svg">

const HamburgerIcon = React.forwardRef<SVGSVGElement, HamburgerIconProps>(
  ({ className, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        data-slot="hamburger-icon"
        aria-hidden={true}
        className={className}
        height="24"
        viewBox="0 0 24 24"
        width="24"
        {...props}
      >
        <path
          clipRule="evenodd"
          d="M3 18V16H21V18H3ZM3 13V11H21V13H3ZM3 8V6H21V8H3Z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </svg>
    )
  }
)
HamburgerIcon.displayName = "HamburgerIcon"

type CloseIconProps = React.ComponentPropsWithoutRef<"svg">

const CloseIcon = React.forwardRef<SVGSVGElement, CloseIconProps>(
  ({ className, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        data-slot="close-icon"
        aria-hidden={true}
        className={className}
        fill="none"
        height="24"
        viewBox="0 0 120 120"
        width="24"
        {...props}
      >
        <path
          d="M32 95L25 88L53 60L25 32L32 25L60 53L88 25L95 32L67 60L95 88L88 95L60 67L32 95Z"
          fill="currentColor"
        />
      </svg>
    )
  }
)
CloseIcon.displayName = "CloseIcon"
export { HamburgerMenuButton, HamburgerIcon, CloseIcon }
