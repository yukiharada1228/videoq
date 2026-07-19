import * as React from "react"

import { cn } from "@/lib/utils"

export type SupportTextProps = React.ComponentPropsWithoutRef<"p">

const SupportText = React.forwardRef<HTMLParagraphElement, SupportTextProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        data-slot="support-text"
        className={cn("text-std-16N-170 text-solid-gray-600", className)}
        {...props}
      >
        {children}
      </p>
    )
  }
)
SupportText.displayName = "SupportText"

export { SupportText }
