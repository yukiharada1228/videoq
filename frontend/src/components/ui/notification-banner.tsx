import * as React from "react"

import { cn } from "@/lib/utils"

type NotificationBannerHeadingLevel = "h2" | "h3" | "h4" | "h5" | "h6"
type NotificationBannerStyle = "standard" | "color-chip"
type NotificationBannerType =
  "info1" | "info2" | "warning" | "error" | "success"

const bannerStyleClasses = `
  data-[style=standard]:border-[calc(3/16*1rem)] data-[style=standard]:rounded-12
  data-[style=color-chip]:[--color-chip-color:currentColor] data-[style=color-chip]:border-[calc(2/16*1rem)] data-[style=color-chip]:!pl-6 data-[style=color-chip]:shadow-[inset_calc(8/16*1rem)_0_0_0_var(--color-chip-color)]
  data-[style=color-chip]:desktop:!pl-10 data-[style=color-chip]:desktop:shadow-[inset_calc(16/16*1rem)_0_0_0_var(--color-chip-color)]
`

const bannerTypeClasses = `
  data-[type=info1]:text-blue-900
  data-[type=info2]:text-solid-gray-536
  data-[type=warning]:text-warning-yellow-2 data-[type=warning]:[--color-chip-color:theme(colors.yellow.400)]
  data-[type=error]:text-error-1
  data-[type=success]:text-success-2
`

type IconProps = React.ComponentProps<"svg">

const InfoIcon = (props: IconProps) => {
  return (
    <svg
      aria-label="インフォメーション"
      fill="none"
      height="24"
      role="img"
      viewBox="0 0 24 24"
      width="24"
      {...props}
    >
      <circle cx="12" cy="12" r="10" fill="currentcolor" />
      <circle cx="12" cy="8" r="1" fill="Canvas" />
      <path d="M11 11h2v6h-2z" fill="Canvas" />
    </svg>
  )
}

const WarningIcon = (props: IconProps) => {
  return (
    <svg
      aria-label="警告"
      fill="none"
      height="24"
      role="img"
      viewBox="0 0 24 24"
      width="24"
      {...props}
    >
      <path d="M1 21 12 2l11 19H1Z" fill="currentcolor" />
      <path d="M13 15h-2v-5h2v5Z" fill="Canvas" />
      <circle cx="12" cy="17" r="1" fill="Canvas" />
    </svg>
  )
}

const ErrorIcon = (props: IconProps) => {
  return (
    <svg
      aria-label="エラー"
      fill="none"
      height="24"
      role="img"
      viewBox="0 0 24 24"
      width="24"
      {...props}
    >
      <path
        d="M8.25 21 3 15.75v-7.5L8.25 3h7.5L21 8.25v7.5L15.75 21h-7.5Z"
        fill="currentcolor"
      />
      <path
        d="m12 13.4-2.85 2.85-1.4-1.4L10.6 12 7.75 9.15l1.4-1.4L12 10.6l2.85-2.85 1.4 1.4L13.4 12l2.85 2.85-1.4 1.4L12 13.4Z"
        fill="Canvas"
      />
    </svg>
  )
}

const SuccessIcon = (props: IconProps) => {
  return (
    <svg
      aria-label="成功"
      fill="none"
      height="24"
      role="img"
      viewBox="0 0 24 24"
      width="24"
      {...props}
    >
      <circle cx="12" cy="12" r="10" fill="currentcolor" />
      <path
        d="m17.6 9.6-7 7-4.3-4.3L7.7 11l2.9 2.9 5.7-5.6 1.3 1.4Z"
        fill="Canvas"
      />
    </svg>
  )
}

type NotificationBannerIconProps = React.ComponentProps<"svg"> & {
  type: NotificationBannerType
}

const NotificationBannerIcon = ({
  type,
  className,
  ...props
}: NotificationBannerIconProps) => {
  switch (type) {
    case "info1":
    case "info2":
      return <InfoIcon className={className} {...props} />
    case "warning":
      return <WarningIcon className={className} {...props} />
    case "error":
      return <ErrorIcon className={className} {...props} />
    case "success":
      return <SuccessIcon className={className} {...props} />
    default:
      return null
  }
}

type NotificationBannerProps = React.ComponentPropsWithoutRef<"div"> & {
  children: React.ReactNode
  bannerStyle: NotificationBannerStyle
  type: NotificationBannerType
  title: string
  headingLevel?: NotificationBannerHeadingLevel
}

const NotificationBanner = React.forwardRef<
  HTMLDivElement,
  NotificationBannerProps
>(
  (
    { className, children, bannerStyle, type, title, headingLevel, ...props },
    ref
  ) => {
    const Tag = headingLevel ?? "div"

    return (
      <div
        ref={ref}
        data-slot="notification-banner"
        className={cn(
          `
        grid grid-cols-[var(--icon-size)_1fr_minmax(0,auto)] grid-rows-[minmax(calc(36/16*1rem),auto)] border-current px-4 pt-2 pb-6 [--icon-size:calc(24/16*1rem)] gap-4
        desktop:gap-x-6 desktop:px-6 desktop:pt-6 desktop:pb-8 desktop:[--icon-size:calc(36/16*1rem)]
        ${bannerStyleClasses}
        ${bannerTypeClasses}
      `,
          className
        )}
        data-type={type}
        data-style={bannerStyle}
        {...props}
      >
        <Tag className={`col-span-2 grid grid-cols-[inherit] gap-[inherit]`}>
          <NotificationBannerIcon
            className="justify-self-center mt-[calc(3/16*1rem)] size-7 max-w-none max-h-none desktop:size-11 desktop:-my-1"
            type={type}
          />
          <span className="pt-[calc(3/16*1rem)] text-std-17B-170 text-solid-gray-900 desktop:text-std-20B-150 desktop:pt-0.5">
            {title}
          </span>
        </Tag>
        {children}
      </div>
    )
  }
)
NotificationBanner.displayName = "NotificationBanner"

const NotificationBannerBody = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="notification-banner-body"
      className={cn(
        `
        col-start-1 -col-end-1 desktop:col-start-2 text-std-16N-170 text-solid-gray-800 grid gap-y-2
      `,
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
NotificationBannerBody.displayName = "NotificationBannerBody"

type NotificationBannerCloseProps = React.ComponentProps<"button"> & {
  label?: string
}

const NotificationBannerClose = React.forwardRef<
  HTMLButtonElement,
  NotificationBannerCloseProps
>(({ className, label, ...props }, ref) => {
  return (
    <button
      ref={ref}
      data-slot="notification-banner-close"
      className={cn(
        `
        -mr-3 inline-flex items-center self-start gap-1 rounded-6 px-3 pb-1.5 pt-1 text-solid-gray-900
        hover:bg-solid-gray-50 hover:underline hover:underline-offset-[calc(3/16*1rem)]
        focus-visible:bg-yellow-300 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300
      `,
        className
      )}
      type="button"
      {...props}
    >
      <svg
        aria-hidden={true}
        className="mt-0.5 size-6"
        fill="none"
        height="24"
        viewBox="0 0 24 24"
        width="24"
      >
        <g>
          <path
            d="m6.4 18.6-1-1 5.5-5.6-5.6-5.6 1.1-1 5.6 5.5 5.6-5.6 1 1.1L13 12l5.6 5.6-1 1L12 13l-5.6 5.6Z"
            fill="currentColor"
          />
        </g>
      </svg>
      <span className="text-oln-16N-100">{label ?? "閉じる"}</span>
    </button>
  )
})
NotificationBannerClose.displayName = "NotificationBannerClose"

const NotificationBannerMobileClose = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      data-slot="notification-banner-mobile-close"
      className={cn(
        `
        mt-1 self-start touch-manipulation rounded-4 text-solid-gray-900
        hover:bg-solid-gray-50 hover:outline hover:outline-1
        focus-visible:bg-yellow-300 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300
      `,
        className
      )}
      type="button"
      {...props}
    >
      <svg
        className=""
        width="44"
        height="44"
        viewBox="0 0 44 44"
        role="img"
        aria-label="閉じる"
      >
        <path
          d="m13 26-2-2 9-9-9-9 2-2 9 9 9-9 2 2-9 9 9 9-2 2-9-9-9 9ZM11.8 30v3.6H9v5.3H8V30h3.8ZM9 32.1v.7h1.7V32H9Zm0-.7h1.7v-.6H9v.6ZM16.4 30v7.6c0 .5 0 1-.5 1.1-.4.2-1 .2-2 .2 0-.3-.1-.7-.3-1h1.5c.2 0 .2-.1.2-.3v-4h-2.8V30h4Zm-2.8 2.1v.7h1.7v-.7h-1.7Zm0-1.3v.6h1.7v-.6h-1.7ZM13.3 34.6h1.4v.9h-1.4v2.2c0 .5 0 .7-.4.8-.3.2-.7.2-1.3.2l-.3-.9h.9l.1-.1v-1.5a8 8 0 0 1-2.3 1.9l-.6-.8c1-.4 1.8-1 2.5-1.8H9.7v-1h2.6v-.7h1v.8ZM23 31l1 1.6-.9.4c-.2-.6-.5-1.1-.9-1.6l.8-.3Zm1.3-.5 1 1.6-.8.4-1-1.6.8-.4Zm-4-.3c-.2 2-.1 4-.2 6 0 .3 0 .6.2.8.3.4.7.5 1.3.5 1.7 0 2.7-1 3.4-2l.9 1a5.3 5.3 0 0 1-4.3 2.2c-1 0-2-.3-2.3-1-.3-.3-.3-.6-.3-1.2v-6.3h1.4ZM28.8 30.5H31a60.3 60.3 0 0 0 2.8-.1l.6.8c-1.1.6-2 1.5-3 2.3l1-.1c1.5 0 3 .9 3 2.4 0 1.1-.6 2-1.6 2.4-.5.3-1.2.4-2 .4-1 0-2.3-.4-2.3-1.6 0-.9.8-1.5 1.7-1.5a2 2 0 0 1 2.1 2l-1 .2c0-.7-.4-1.3-1.1-1.3-.3 0-.7.2-.7.5 0 .6.7.7 1.1.7 1.7 0 2.6-.7 2.6-1.8 0-1-1.2-1.6-2-1.6-.9 0-1.5.2-2 .6-.7.3-1.2.8-1.8 1.5l-.8-.9 2.6-2.1 2.1-1.8c-1.1 0-2.2 0-3.3.2v-1.2Z"
          fill="currentcolor"
        ></path>
      </svg>
    </button>
  )
})
NotificationBannerMobileClose.displayName = "NotificationBannerMobileClose"

export {
  NotificationBanner,
  NotificationBannerBody,
  NotificationBannerClose,
  NotificationBannerMobileClose,
  NotificationBannerIcon,
  bannerStyleClasses,
  bannerTypeClasses,
}
export type {
  NotificationBannerProps,
  NotificationBannerCloseProps,
  NotificationBannerHeadingLevel,
  NotificationBannerStyle,
  NotificationBannerType,
}
