import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const listBaseStyle = `
  [&>li]:py-[var(--spacing,0px)]
  data-[spacing='4']:[--spacing:0.25rem] data-[spacing='8']:[--spacing:0.5rem] data-[spacing='12']:[--spacing:0.75rem]
  [&_ul]:mt-[var(--spacing,0px)] [&_ul]:mb-[calc(-1*var(--spacing,0px))]
`

const listDefaultStyle = "pl-8 list-[revert]"

const listNumberedStyle = `
  grid grid-cols-[minmax(2rem,auto)_1fr]
  [&>li]:grid [&>li]:col-span-full [&>li]:grid-cols-[inherit] [&>li]:items-baseline
  [&>li>a]:grid [&>li>a]:col-span-full [&>li>a]:grid-cols-[inherit] [&>li>a]:items-baseline
  [&>li>a>span]:[text-decoration-thickness:inherit]
  [&>li>:not(a):not(span)]:col-start-2
  supports-[grid-template-columns:subgrid]:[&>li]:grid-cols-subgrid
  supports-[grid-template-columns:subgrid]:[&>li>a]:grid-cols-subgrid
`

const listVariants = cva(listBaseStyle, {
  variants: {
    marker: {
      default: listDefaultStyle,
      number: listNumberedStyle,
    },
  },
  defaultVariants: {
    marker: "default",
  },
})

type ListProps = React.ComponentProps<"ul"> &
  Omit<VariantProps<typeof listVariants>, "marker"> & {
    spacing: "4" | "8" | "12"
    marker?: "number"
  }

const List = React.forwardRef<HTMLUListElement, ListProps>(
  ({ className, spacing, marker, children, ...props }, ref) => {
    const resolvedMarker = marker === "number" ? "number" : "default"

    return (
      <ul
        ref={ref}
        data-slot="list"
        data-spacing={spacing}
        data-marker={marker}
        className={cn(listVariants({ marker: resolvedMarker }), className)}
        {...props}
      >
        {children}
      </ul>
    )
  }
)
List.displayName = "List"

export {
  List,
  listVariants,
  listBaseStyle,
  listDefaultStyle,
  listNumberedStyle,
}
export type { ListProps }
