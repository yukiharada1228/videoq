// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const Breadcrumbs = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"nav">
>(({ className, children, ...props }, ref) => {
  return (
    <nav ref={ref} data-slot="breadcrumbs" className={cn(className)} {...props}>
      {children}
    </nav>
  )
})
Breadcrumbs.displayName = "Breadcrumbs"

const BreadcrumbsLabel = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span">
>(({ className, children, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="breadcrumbs-label"
      className={cn(className)}
      {...props}
    >
      {children}
    </span>
  )
})
BreadcrumbsLabel.displayName = "BreadcrumbsLabel"

const BreadcrumbList = React.forwardRef<
  HTMLOListElement,
  React.ComponentPropsWithoutRef<"ol">
>(({ className, children, ...props }, ref) => {
  return (
    <ol
      ref={ref}
      data-slot="breadcrumb-list"
      className={cn("inline", className)}
      {...props}
    >
      {children}
    </ol>
  )
})
BreadcrumbList.displayName = "BreadcrumbList"

export type BreadcrumbItemProps = React.ComponentPropsWithoutRef<"li"> & {
  isCurrent?: boolean
}

const BreadcrumbItem = React.forwardRef<HTMLLIElement, BreadcrumbItemProps>(
  ({ isCurrent = false, className, children, ...props }, ref) => {
    if (isCurrent) {
      return (
        <li
          ref={ref}
          data-slot="breadcrumb-item"
          aria-current="page"
          className={cn("inline break-words text-oln-16N-100", className)}
          {...props}
        >
          {children}
        </li>
      )
    }

    return (
      <li
        ref={ref}
        data-slot="breadcrumb-item"
        className={cn("inline break-words", className)}
        {...props}
      >
        {children}
        <svg
          aria-hidden={true}
          className="mx-2 inline"
          fill="none"
          height="12"
          viewBox="0 0 12 12"
          width="12"
        >
          <path
            d="M4.50078 1.2998L3.80078 1.9998L7.80078 5.9998L3.80078 9.9998L4.50078 10.6998L9.20078 5.9998L4.50078 1.2998Z"
            fill="currentColor"
          />
        </svg>
      </li>
    )
  }
)
BreadcrumbItem.displayName = "BreadcrumbItem"

export const breadcrumbLinkStyle = `
  text-blue-1000 text-oln-16N-100 underline underline-offset-[calc(3/16*1rem)]
  hover:text-blue-900 hover:decoration-[calc(3/16*1rem)]
  active:text-orange-800 active:decoration-1
  focus-visible:rounded-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:bg-yellow-300 focus-visible:text-blue-1000 focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300
`

const breadcrumbLinkVariants = cva(breadcrumbLinkStyle)

export type BreadcrumbLinkProps = React.ComponentPropsWithoutRef<"a"> & {
  asChild?: boolean
}

const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  ({ className, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "a"

    return (
      <Comp
        ref={ref}
        data-slot="breadcrumb-link"
        className={cn(breadcrumbLinkVariants(), className)}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
BreadcrumbLink.displayName = "BreadcrumbLink"

export {
  Breadcrumbs,
  BreadcrumbsLabel,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  breadcrumbLinkVariants,
}
