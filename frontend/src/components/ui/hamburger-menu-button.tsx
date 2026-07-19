import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

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

const hamburgerMenuIconButtonVariants = cva(
  "block w-fit rounded-4 p-0 text-black touch-manipulation hover:outline-1 hover:bg-solid-gray-50 focus-visible:bg-yellow-300 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300"
)

const HamburgerMenuIconButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(({ className, children, type = "button", ...props }, ref) => {
  return (
    <button
      ref={ref}
      data-slot="hamburger-menu-icon-button"
      type={type}
      className={cn(hamburgerMenuIconButtonVariants(), className)}
      {...props}
    >
      {children}
    </button>
  )
})
HamburgerMenuIconButton.displayName = "HamburgerMenuIconButton"

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

type HamburgerWithLabelIconProps = React.ComponentPropsWithoutRef<"svg"> & {
  isEnglish?: boolean
}

const HamburgerWithLabelIcon = React.forwardRef<
  SVGSVGElement,
  HamburgerWithLabelIconProps
>(({ className, isEnglish, ...props }, ref) => {
  return isEnglish ? (
    <svg
      ref={ref}
      data-slot="hamburger-with-label-icon"
      aria-label={`${props["aria-label"] ?? "MENU"}`}
      className={className}
      fill="none"
      height="44"
      role="img"
      viewBox="0 0 44 44"
      width="44"
      {...props}
    >
      <path
        d="M39 23v2H5v-2h34Zm0-6H5v-2h34v2Zm0-8H5V7h34v2ZM35.9 38.1c-2 0-3.4-1-3.4-3.5V30H34v4.7c0 1.8.8 2.3 1.9 2.3 1.1 0 2-.5 2-2.3V30h1.3v4.6c0 2.6-1.3 3.5-3.3 3.5ZM23.1 38v-8h1.5l4 6.4c-.2-2.1-.2-4.3-.2-6.4h1.3v8h-1.4l-4-6.4c.2 2.1.2 4.3.2 6.4H23ZM15.3 38v-8h5.3v1h-3.9v2.3H20v1h-3.3V37h4V38h-5.4ZM4.7 38v-8h1.6l2.3 5.7 2.2-5.7h1.7v8h-1.3l.1-6.4L9 37.2h-.9l-2.3-5.6c.2 2.1.2 4.2.2 6.4H4.7Z"
        fill="currentColor"
      />
    </svg>
  ) : (
    <svg
      ref={ref}
      data-slot="hamburger-with-label-icon"
      aria-label={`${props["aria-label"] ?? "メニュー"}`}
      className={className}
      fill="none"
      height="44"
      role="img"
      viewBox="0 0 44 44"
      width="44"
      {...props}
    >
      <path
        d="M39 23v2H5v-2h34Zm0-6H5v-2h34v2Zm0-8H5V7h34v2ZM31 33.2h8v1.5h-8v-1.5ZM29 33c-.4 1.2-.3 2.5-.5 3.7H30v1.2H23v-1.3H27l.4-2.7H24v-1.3c1.2 0 2.9.3 4.2 0l1 .5ZM14.5 31c2 .2 4.2.2 6.3 0v1.5h-6.3V31Zm-.8 4.9c2.5 0 5.3.2 8 0v1.5a85 85 0 0 0-8 0v-1.5ZM12.3 30.5c-.6 1.2-1 2.5-1.7 3.6.9.7 1.7 1.4 2.4 2.2l-1 1-2.2-2c-.9 1-2 2-3.7 3l-1.1-1c1.6-.8 2.8-1.8 3.7-3a27 27 0 0 0-2.6-1.8l.8-1a40 40 0 0 1 2.6 1.8c.7-1 1.2-2.2 1.4-3.3l1.4.5Z"
        fill="currentColor"
      />
    </svg>
  )
})
HamburgerWithLabelIcon.displayName = "HamburgerWithLabelIcon"

type CloseWithLabelIconProps = React.ComponentPropsWithoutRef<"svg"> & {
  isEnglish?: boolean
}

const CloseWithLabelIcon = React.forwardRef<
  SVGSVGElement,
  CloseWithLabelIconProps
>(({ className, isEnglish, ...props }, ref) => {
  return isEnglish ? (
    <svg
      ref={ref}
      data-slot="close-with-label-icon"
      aria-label={`${props["aria-label"] ?? "CLOSE"}`}
      className={className}
      fill="none"
      height="44"
      role="img"
      viewBox="0 0 44 44"
      width="44"
      {...props}
    >
      <path
        d="M37.3 39H33v-8h4.3v1h-3.1v2.3h3v1h-3V38h3.1v1ZM31.7 36.8c0 1.5-1 2.3-2.7 2.3-.9 0-1.6-.1-2.1-.4v-1.1c.6.3 1.4.5 2.2.5 1 0 1.5-.5 1.5-1.2 0-.9-1-1.2-1.7-1.5-1.1-.4-2-1.2-2-2.4 0-1.4 1.3-2.1 2.5-2.1a5 5 0 0 1 2.2.5l-.4 1c-.5-.3-1.1-.5-1.8-.5-.8 0-1.3.5-1.3 1 0 1 1 1.3 1.6 1.6 1.1.4 2 1 2 2.3ZM25.8 35c0 1.5-.5 3.2-2 3.8-.5.2-1 .3-1.6.3a4 4 0 0 1-1.6-.3c-1.4-.7-2-2.3-2-3.8 0-1.7.6-3 1.6-3.6.6-.3 1.2-.5 2-.5s1.5.2 2 .5c1 .7 1.6 2 1.6 3.6Zm-6 0c0 1.3.4 2.2 1.1 2.7.4.3.8.4 1.3.4.6 0 1-.1 1.4-.4.7-.5 1-1.4 1-2.7 0-1-.2-2.1-1-2.7-.4-.3-.8-.4-1.4-.4-.5 0-1 .1-1.3.4-.7.5-1 1.4-1 2.7ZM13.5 39l.1-8h1.2v7H18v1h-4.5ZM10.2 32c-1.7 0-2.4 1.5-2.4 3 0 1.9.8 3 2.4 3 .7 0 1.2 0 1.9-.3v1c-.7.3-1.4.4-2 .4-2.4 0-3.5-1.9-3.5-4 0-2.3 1.2-4.2 3.6-4.2.8 0 1.6.2 2.2.5l-.5 1a4 4 0 0 0-1.7-.5ZM13 26l-2-2 9-9-9-9 2-2 9 9 9-9 2 2-9 9 9 9-2 2-9-9-9 9Z"
        fill="currentColor"
      />
    </svg>
  ) : (
    <svg
      ref={ref}
      data-slot="close-with-label-icon"
      aria-label={`${props["aria-label"] ?? "閉じる"}`}
      className={className}
      fill="none"
      height="44"
      role="img"
      viewBox="0 0 44 44"
      width="44"
      {...props}
    >
      <path
        d="m13 26-2-2 9-9-9-9 2-2 9 9 9-9 2 2-9 9 9 9-2 2-9-9-9 9ZM11.8 30v3.6H9v5.3H8V30h3.8ZM9 32.1v.7h1.7V32H9Zm0-.7h1.7v-.6H9v.6ZM16.4 30v7.6c0 .5 0 1-.5 1.1-.4.2-1 .2-2 .2 0-.3-.1-.7-.3-1h1.5c.2 0 .2-.1.2-.3v-4h-2.8V30h4Zm-2.8 2.1v.7h1.7v-.7h-1.7Zm0-1.3v.6h1.7v-.6h-1.7ZM13.3 34.6h1.4v.9h-1.4v2.2c0 .5 0 .7-.4.8-.3.2-.7.2-1.3.2l-.3-.9h.9l.1-.1v-1.5a8 8 0 0 1-2.3 1.9l-.6-.8c1-.4 1.8-1 2.5-1.8H9.7v-1h2.6v-.7h1v.8ZM23 31l1 1.6-.9.4c-.2-.6-.5-1.1-.9-1.6l.8-.3Zm1.3-.5 1 1.6-.8.4-1-1.6.8-.4Zm-4-.3c-.2 2-.1 4-.2 6 0 .3 0 .6.2.8.3.4.7.5 1.3.5 1.7 0 2.7-1 3.4-2l.9 1a5.3 5.3 0 0 1-4.3 2.2c-1 0-2-.3-2.3-1-.3-.3-.3-.6-.3-1.2v-6.3h1.4ZM28.8 30.5H31a60.3 60.3 0 0 0 2.8-.1l.6.8c-1.1.6-2 1.5-3 2.3l1-.1c1.5 0 3 .9 3 2.4 0 1.1-.6 2-1.6 2.4-.5.3-1.2.4-2 .4-1 0-2.3-.4-2.3-1.6 0-.9.8-1.5 1.7-1.5a2 2 0 0 1 2.1 2l-1 .2c0-.7-.4-1.3-1.1-1.3-.3 0-.7.2-.7.5 0 .6.7.7 1.1.7 1.7 0 2.6-.7 2.6-1.8 0-1-1.2-1.6-2-1.6-.9 0-1.5.2-2 .6-.7.3-1.2.8-1.8 1.5l-.8-.9 2.6-2.1 2.1-1.8c-1.1 0-2.2 0-3.3.2v-1.2Z"
        fill="currentColor"
      />
    </svg>
  )
})
CloseWithLabelIcon.displayName = "CloseWithLabelIcon"

export {
  HamburgerMenuButton,
  hamburgerMenuButtonVariants,
  HamburgerMenuIconButton,
  hamburgerMenuIconButtonVariants,
  HamburgerIcon,
  CloseIcon,
  HamburgerWithLabelIcon,
  CloseWithLabelIcon,
}
export type {
  HamburgerIconProps,
  CloseIconProps,
  HamburgerWithLabelIconProps,
  CloseWithLabelIconProps,
}
