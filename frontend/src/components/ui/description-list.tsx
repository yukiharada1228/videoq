import * as React from "react"

import { cn } from "@/lib/utils"

type DlProps = React.ComponentProps<"dl"> & {
  marker?: "none" | "bullet"
}

const Dl = React.forwardRef<HTMLDListElement, DlProps>(
  ({ className, marker, children, ...props }, ref) => {
    return (
      <dl
        ref={ref}
        data-slot="dl"
        data-marker={marker}
        className={cn("group/dl grid gap-y-2", className)}
        {...props}
      >
        {children}
      </dl>
    )
  }
)
Dl.displayName = "Dl"

const Dt = React.forwardRef<HTMLElement, React.ComponentProps<"dt">>(
  ({ className, children, ...props }, ref) => {
    return (
      <dt
        ref={ref}
        data-slot="dt"
        className={cn(
          "font-bold group-data-[marker=bullet]/dl:ml-8 group-data-[marker=bullet]/dl:list-item group-data-[marker=bullet]/dl:list-disc",
          className
        )}
        {...props}
      >
        {children}
      </dt>
    )
  }
)
Dt.displayName = "Dt"

const Dd = React.forwardRef<HTMLElement, React.ComponentProps<"dd">>(
  ({ className, children, ...props }, ref) => {
    return (
      <dd ref={ref} data-slot="dd" className={cn("ml-8", className)} {...props}>
        {children}
      </dd>
    )
  }
)
Dd.displayName = "Dd"

export { Dl, Dt, Dd }
export type { DlProps }
