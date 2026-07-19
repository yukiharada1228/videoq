import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

export const linkVariants = cva(
  cn(
    "text-blue-1000 underline underline-offset-[calc(3/16*1rem)]",
    "visited:text-magenta-900",
    "hover:text-blue-1000 hover:decoration-[calc(3/16*1rem)]",
    "focus-visible:rounded-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:bg-yellow-300 focus-visible:text-blue-1000 focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300",
    "active:text-orange-800 active:decoration-1"
  )
)

export type LinkExternalLinkIconProps = React.ComponentProps<"svg">

export const LinkExternalLinkIcon = ({
  className,
  ...props
}: LinkExternalLinkIconProps) => {
  return (
    <svg
      aria-label={props["aria-label"] ?? "新規タブで開きます"}
      className={cn(
        "mb-[calc(3/16*1rem)] ml-[calc(3/16*1rem)] inline",
        className
      )}
      fill="none"
      height="17"
      role="img"
      viewBox="0 0 16 17"
      width="16"
      {...props}
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

export type LinkProps = React.ComponentPropsWithoutRef<"a"> & {
  asChild?: boolean
  icon?: LinkExternalLinkIconProps
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, asChild = false, icon, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "a"

    return (
      <Comp
        data-slot="link"
        ref={ref}
        className={cn(linkVariants(), className)}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {children}
            {props.target === "_blank" && <LinkExternalLinkIcon {...icon} />}
          </>
        )}
      </Comp>
    )
  }
)
Link.displayName = "Link"

export { Link }
