import * as React from "react"

import { cn } from "@/lib/utils"

const ErrorText = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentProps<"p">
>(({ className, children, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-slot="error-text"
      className={cn("text-dns-16N-130 text-error-1", className)}
      {...props}
    >
      {children}
    </p>
  )
})
ErrorText.displayName = "ErrorText"

export { ErrorText }
