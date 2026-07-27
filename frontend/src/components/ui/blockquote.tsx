import * as React from "react"

import { cn } from "@/lib/utils"

const Blockquote = React.forwardRef<
  HTMLQuoteElement,
  React.ComponentProps<"blockquote">
>(({ className, children, ...props }, ref) => {
  return (
    <blockquote
      ref={ref}
      data-slot="blockquote"
      className={cn(
        "border-l-8 border-solid-gray-536 py-2 pl-6 pr-4 mx-10 [&>*:first-child]:!mt-0 [&>*:last-child]:!mb-0",
        className
      )}
      {...props}
    >
      {children}
    </blockquote>
  )
})
Blockquote.displayName = "Blockquote"

export { Blockquote }
