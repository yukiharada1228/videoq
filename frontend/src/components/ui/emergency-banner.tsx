// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const emergencyBannerVariants = cva(
  "block px-2.5 py-3.5 border-[6px] bg-white desktop:p-[calc(26/16*1rem)] border-warning-orange-1"
)

const EmergencyBanner = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="emergency-banner"
      className={cn(emergencyBannerVariants(), className)}
      {...props}
    >
      {children}
    </div>
  )
})
EmergencyBanner.displayName = "EmergencyBanner"

type EmergencyBannerHeadingLevel = "h2" | "h3" | "h4" | "h5" | "h6"

const emergencyBannerHeadingVariants = cva(
  "text-std-20B-150 text-black desktop:text-std-24B-150"
)

type EmergencyBannerHeadingProps = React.ComponentPropsWithoutRef<"h2"> & {
  level: EmergencyBannerHeadingLevel
}

const EmergencyBannerHeading = React.forwardRef<
  HTMLHeadingElement,
  EmergencyBannerHeadingProps
>(({ level, className, children, ...props }, ref) => {
  const Tag = level

  return (
    <Tag
      ref={ref}
      data-slot="emergency-banner-heading"
      className={cn(emergencyBannerHeadingVariants(), className)}
      {...props}
    >
      【緊急】
      {children}
    </Tag>
  )
})
EmergencyBannerHeading.displayName = "EmergencyBannerHeading"

const emergencyBannerBodyVariants = cva("mt-2 desktop:mt-4")

const EmergencyBannerBody = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="emergency-banner-body"
      className={cn(emergencyBannerBodyVariants(), className)}
      {...props}
    >
      {children}
    </div>
  )
})
EmergencyBannerBody.displayName = "EmergencyBannerBody"

const emergencyBannerButtonVariants = cva(`
  relative block mx-auto p-[calc(18/16*1rem)] w-full border-2 border-transparent bg-error-1 text-white text-oln-16B-100 text-center rounded-12
  desktop:p-5 desktop:w-fit desktop:min-w-[50%] desktop:border-4 desktop:rounded-16
  after:absolute after:inset-0 after:border-2 after:border-white after:rounded-[calc(10/16*1rem)]
  desktop:after:border-4 desktop:after:rounded-12
  hover:underline hover:underline-offset-[calc(3/16*1rem)] hover:bg-error-2
  focus-visible:outline focus-visible:outline-[calc(4/16*1rem)] focus-visible:outline-black focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300
`)

const EmergencyBannerButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a">
>(({ className, children, ...props }, ref) => {
  return (
    <a
      ref={ref}
      data-slot="emergency-banner-button"
      className={cn(emergencyBannerButtonVariants(), className)}
      {...props}
    >
      {children}
      {props.target === "_blank" && (
        <EmergencyBannerNewWindowIcon className="ml-1 align-top" />
      )}
    </a>
  )
})
EmergencyBannerButton.displayName = "EmergencyBannerButton"

const EmergencyBannerNewWindowIcon = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"svg">) => {
  return (
    <svg
      aria-label={`${props["aria-label"] ?? "新規タブで開きます"}`}
      className={cn("inline", className)}
      fill="none"
      height="16"
      role="img"
      viewBox="0 0 16 16"
      width="16"
    >
      <g>
        <path
          clipRule="evenodd"
          d="M3 13.5H13V9.16667H14V14.5H2V2.5H7.33333V3.5H3V13.5ZM9.33333 3.5V2.5H14V7.16667H13V4.23333L7 10.1667L6.33333 9.5L12.2667 3.5H9.33333Z"
          fillRule="evenodd"
          fill="currentColor"
        />
      </g>
    </svg>
  )
}

export {
  EmergencyBanner,
  EmergencyBannerHeading,
  EmergencyBannerBody,
  EmergencyBannerButton,
  emergencyBannerVariants,
  emergencyBannerHeadingVariants,
  emergencyBannerBodyVariants,
  emergencyBannerButtonVariants,
}
export type { EmergencyBannerHeadingProps, EmergencyBannerHeadingLevel }
