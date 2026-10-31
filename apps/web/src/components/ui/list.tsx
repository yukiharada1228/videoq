import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/digital-agency/cn"

// `--list-spacing` rather than `--spacing`: the latter is Tailwind v4's own
// spacing scale variable, so overriding it rescales every spacing utility used
// inside the list (upstream 2166f11).
const listBaseStyle = `
  [&>li]:py-[var(--list-spacing,0px)]
  data-[spacing='4']:[--list-spacing:0.25rem] data-[spacing='8']:[--list-spacing:0.5rem] data-[spacing='12']:[--list-spacing:0.75rem]
  [&_ul]:mt-[var(--list-spacing,0px)] [&_ul]:mb-[calc(-1*var(--list-spacing,0px))]
`

const listDefaultStyle = "pl-8 list-[revert]"

const listNumberedStyle = `
  [&>li]:pl-8
  [&>li>a:only-child]:-ml-8 [&>li>a:only-child]:pl-8
  [&>li>span:first-child]:-ml-8 [&>li>span:first-child]:inline-block [&>li>span:first-child]:min-w-8 [&>li>span:first-child]:whitespace-nowrap
  [&>li>a:only-child>span:first-child]:-ml-8 [&>li>a:only-child>span:first-child]:inline-block [&>li>a:only-child>span:first-child]:min-w-8 [&>li>a:only-child>span:first-child]:whitespace-nowrap [&>li>a:only-child>span:first-child]:[text-decoration:inherit]
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

export { List }
