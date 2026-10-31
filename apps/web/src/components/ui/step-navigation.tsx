import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/digital-agency/cn"

export type StepNavigationOrientation = "horizontal" | "vertical"
export type StepNavigationSize = "normal" | "small"
export type StepNavigationStepState =
  "reached" | "completed" | "editing" | "error" | "skipped"

// --- Root ---

export type StepNavigationProps = React.ComponentProps<"div"> & {
  orientation?: StepNavigationOrientation
  size?: StepNavigationSize
  asChild?: boolean
}

const StepNavigation = React.forwardRef<HTMLDivElement, StepNavigationProps>(
  (
    {
      asChild = false,
      className,
      orientation = "horizontal",
      size = "normal",
      style,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "div"

    // サイズ依存の寸法は CSS 変数で下位要素に配る（upstream と同じ変数名）。
    const mergedStyle: React.CSSProperties = {
      ...style,
      ["--step-number-size" as string]:
        size === "normal" ? "calc(44/16*1rem)" : "calc(32/16*1rem)",
      ["--step-number-margin" as string]:
        size === "normal" ? "calc(4/16*1rem)" : "calc(3/16*1rem)",
      ["--step-outline-width" as string]:
        size === "normal" ? "calc(2/16*1rem)" : "calc(1/16*1rem)",
      ["--step-title-margin" as string]:
        size === "normal" ? "calc(24/16*1rem)" : "calc(16/16*1rem)",
      ["--step-description-margin" as string]:
        size === "normal" ? "calc(8/16*1rem)" : "calc(4/16*1rem)",
    }

    return (
      <Comp
        ref={ref}
        data-slot="step-navigation"
        className={cn(
          `
            group/step-nav
            text-solid-gray-800 text-std-16N-170 [overflow-wrap:anywhere]
            data-[orientation=horizontal]:overflow-x-auto data-[orientation=horizontal]:pt-[calc(6/16*1rem)] data-[orientation=horizontal]:pb-[calc(6/16*1rem)]
          `,
          className
        )}
        data-orientation={orientation}
        data-size={size}
        style={mergedStyle}
        {...props}
      />
    )
  }
)
StepNavigation.displayName = "StepNavigation"

// --- List ---

const StepNavigationList = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-slot="step-navigation-list"
    className={cn(
      "flex group-data-[orientation=vertical]/step-nav:flex-col",
      className
    )}
    {...props}
  />
))
StepNavigationList.displayName = "StepNavigationList"

// --- Step ---

export type StepNavigationStepProps = React.ComponentProps<"li"> & {
  state?: StepNavigationStepState
  first?: boolean
  last?: boolean
}

const connectorHorizontalBaseClass =
  "hidden absolute -z-10 top-[calc(var(--step-number-size)/2+var(--step-number-margin))] w-1/2 border-b border-current group-data-[orientation=horizontal]/step-nav:block"

const connectorVerticalBaseClass =
  "hidden absolute -z-10 left-[calc(var(--step-number-size)/2+var(--step-number-margin))] border-r border-current group-data-[orientation=vertical]/step-nav:block"

const StepNavigationStep = React.forwardRef<
  HTMLLIElement,
  StepNavigationStepProps
>(
  (
    {
      "aria-current": ariaCurrent,
      children,
      className,
      first,
      last,
      state,
      ...props
    },
    ref
  ) => {
    const isCurrent =
      ariaCurrent != null && ariaCurrent !== false && ariaCurrent !== "false"

    return (
      <li
        ref={ref}
        data-slot="step-navigation-step"
        className={cn(
          `
            group/step relative
            group-data-[orientation=horizontal]/step-nav:w-[calc(var(--step-width,320)/16*1rem)] group-data-[orientation=horizontal]/step-nav:min-w-[calc(var(--step-min-width,160)/16*1rem)] group-data-[orientation=horizontal]/step-nav:px-4
            group-data-[orientation=vertical]/step-nav:flex-1 group-data-[orientation=vertical]/step-nav:pb-6 group-data-[orientation=vertical]/step-nav:last:pb-0
          `,
          className
        )}
        data-state={state}
        data-first={first ? "" : undefined}
        data-last={last ? "" : undefined}
        data-current={isCurrent ? "" : undefined}
        aria-current={ariaCurrent}
        {...props}
      >
        {!first && (
          <>
            <span
              aria-hidden={true}
              className={cn(connectorHorizontalBaseClass, "right-1/2")}
            />
            <span
              aria-hidden={true}
              className={cn(connectorVerticalBaseClass, "top-0 h-8")}
            />
          </>
        )}
        {!last && (
          <>
            <span
              aria-hidden={true}
              className={cn(connectorHorizontalBaseClass, "left-1/2")}
            />
            <span
              aria-hidden={true}
              className={cn(
                connectorVerticalBaseClass,
                "bottom-0 h-[calc(100%-32/16*1rem)]"
              )}
            />
          </>
        )}
        {children}
      </li>
    )
  }
)
StepNavigationStep.displayName = "StepNavigationStep"

// --- Step header ---

export type StepNavigationStepHeaderProps = React.ComponentProps<"span"> & {
  asChild?: boolean
  /** Screen-reader prefix before the number (VideoQ: localized). */
  srLabel?: string
}

const stepHeaderClass = `
  group/step-header block text-pretty
  focus-visible:outline-none focus-visible:shadow-none
  data-[interactive]:underline data-[interactive]:decoration-[calc(1/16*1rem)] data-[interactive]:underline-offset-[calc(3/16*1rem)]
  data-[interactive]:hover:decoration-[calc(3/16*1rem)] data-[interactive]:hover:cursor-pointer
  group-data-[orientation=horizontal]/step-nav:w-full group-data-[orientation=horizontal]/step-nav:text-center
  group-data-[orientation=vertical]/step-nav:relative group-data-[orientation=vertical]/step-nav:flex group-data-[orientation=vertical]/step-nav:items-baseline group-data-[orientation=vertical]/step-nav:gap-x-4 group-data-[orientation=vertical]/step-nav:text-left
`

const StepNavigationStepHeader = React.forwardRef<
  HTMLSpanElement,
  StepNavigationStepHeaderProps
>(({ asChild = false, children, className, srLabel = "ステップ", ...props }, ref) => {
  const classNames = cn(stepHeaderClass, className)

  // asChild では `<a>` / `<button>` 側に sr-only テキストを差し込む。
  // 無効化された要素はリンク/ボタンとしての装飾を持たせない。
  if (asChild) {
    const child = children as React.ReactElement<{
      children?: React.ReactNode
      disabled?: boolean
    }>
    const isDisabled = child.props.disabled === true

    return (
      <Slot
        ref={ref}
        data-slot="step-navigation-step-header"
        className={classNames}
        data-interactive={isDisabled ? undefined : ""}
        {...props}
      >
        {React.cloneElement(
          child,
          {},
          <>
            <span className="sr-only">{srLabel}</span>
            {child.props.children}
          </>
        )}
      </Slot>
    )
  }

  return (
    <span
      ref={ref}
      data-slot="step-navigation-step-header"
      className={classNames}
      {...props}
    >
      <span className="sr-only">{srLabel}</span>
      {children}
    </span>
  )
})
StepNavigationStepHeader.displayName = "StepNavigationStepHeader"

// --- Number ---

const StepNavigationNumber = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<"span">
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="step-navigation-number"
    className={cn(
      `
        relative grid place-content-center w-fit rounded-full bg-white border-current
        [text-decoration:inherit] [text-decoration-thickness:inherit]
        px-[calc(2/16*1rem)] pb-[calc(2/16*1rem)]

        h-[var(--step-number-size)] min-w-[var(--step-number-size)] m-[var(--step-number-margin)] border-2 text-std-20B-150
        group-data-[size=small]/step-nav:border group-data-[size=small]/step-nav:text-[calc(16/16*1rem)]

        group-data-[orientation=horizontal]/step-nav:mx-auto
        group-data-[orientation=vertical]/step-nav:shrink-0

        group-data-[state=reached]/step:bg-solid-gray-800 group-data-[state=reached]/step:text-white group-data-[state=reached]/step:border-solid-gray-800
        group-data-[state=completed]/step:bg-solid-gray-50
        group-data-[state=error]/step:text-error-1
        group-data-[state=skipped]/step:border-dashed group-data-[state=skipped]/step:border

        forced-colors:group-data-[state=reached]/step:bg-[CanvasText]
        forced-colors:group-data-[state=reached]/step:text-[Canvas]
        forced-colors:group-data-[state=reached]/step:[forced-color-adjust:none]

        group-data-[current]/step:outline group-data-[current]/step:outline-solid-gray-800
        group-data-[current]/step:outline-offset-[calc(2/16*1rem)]
        group-data-[current]/step:shadow-[0_0_0_calc(2/16*1rem)_white]
        group-data-[current]/step:[outline-width:var(--step-outline-width)]

        [[data-interactive]:hover_&]:outline [[data-interactive]:hover_&]:[outline-width:1px]
        group-data-[state=reached]/step:[[data-interactive]:hover_&]:outline-solid-gray-800
        group-data-[state=skipped]/step:[[data-interactive]:hover_&]:outline-none
        group-data-[state=skipped]/step:[[data-interactive]:hover_&]:border-2

        group-focus-visible/step-header:!outline group-focus-visible/step-header:![outline-width:calc(4/16*1rem)]
        group-focus-visible/step-header:!outline-black
        group-focus-visible/step-header:!outline-offset-[calc(2/16*1rem)]
        group-focus-visible/step-header:!ring-[calc(2/16*1rem)] group-focus-visible/step-header:!ring-yellow-300
      `,
      className
    )}
    {...props}
  />
))
StepNavigationNumber.displayName = "StepNavigationNumber"

// --- State indicator ---

const CompletedIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden={true}>
    <circle
      cx="12"
      cy="12"
      r="12"
      fill="#666"
      className="forced-colors:fill-[CanvasText]"
    />
    <path
      d="M10 17.5 19.8 8l-1.5-1.5-8.1 8-4.1-4L4.5 12l5.6 5.5Z"
      fill="#fff"
      className="forced-colors:fill-[Canvas]"
    />
  </svg>
)

const EditingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden={true}>
    <path
      d="M5.8 20c-.5 0-1-.2-1.3-.5-.3-.4-.5-.8-.5-1.3V5.6c0-.5.2-.9.5-1.3.4-.3.8-.5 1.3-.5h8L12 5.6H5.8v12.6h12.6V12l1.8-1.8v8c0 .5-.2 1-.5 1.3-.4.3-.8.5-1.3.5H5.8Zm3.6-5.4v-3.8l8.3-8.3a1.8 1.8 0 0 1 2.5 0l1.3 1.3.4.6a1.7 1.7 0 0 1 0 1.3c-.1.3-.2.5-.4.6l-8.3 8.3H9.4Zm1.8-1.8h1.3l5.2-5.2L17 7l-.7-.7-5.2 5.2v1.3Z"
      fill="#333"
      className="forced-colors:fill-[CanvasText]"
    />
  </svg>
)

const ErrorIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden={true}>
    <path
      d="M1 21 12 2l11 19H1Zm3.5-2h15L12 6 4.5 19Zm7.5-1c.3 0 .5-.1.7-.3.2-.2.3-.4.3-.7a1 1 0 0 0-.3-.7 1 1 0 0 0-.7-.3 1 1 0 0 0-.7.3 1 1 0 0 0-.3.7c0 .3.1.5.3.7.2.2.4.3.7.3Zm-1-3h2v-5h-2v5Z"
      fill="#ec0000"
      className="forced-colors:fill-[CanvasText]"
    />
  </svg>
)

const stateIconClass = `
  absolute rounded-full bg-white
  top-[calc(-10/16*1rem)] left-[calc(50%+6/16*1rem)]
  group-data-[size=small]/step-nav:top-[calc(-9/16*1rem)] group-data-[size=small]/step-nav:left-[calc(50%+4/16*1rem)]
  [&>svg]:block [&>svg]:max-w-none
  group-data-[size=small]/step-nav:[&_svg]:w-5 group-data-[size=small]/step-nav:[&_svg]:h-5
`

const stateLabelClass = `
  absolute top-[calc(100%+0.5rem)] -inset-x-full bottom-0 mx-auto my-0
  w-[4em] h-[1.2em] bg-white text-dns-14N-120 text-center
`

export type StepNavigationStateIndicatorProps = Omit<
  React.ComponentProps<"span">,
  "children"
> & {
  state?: StepNavigationStepState
  /** Screen-reader text for the completed state (VideoQ: localized). */
  completedLabel?: string
}

const StepNavigationStateIndicator = React.forwardRef<
  HTMLSpanElement,
  StepNavigationStateIndicatorProps
>(({ className, state, completedLabel = "完了", ...props }, ref) => (
  <span
    ref={ref}
    data-slot="step-navigation-state-indicator"
    className={cn(className)}
    {...props}
  >
    {state === "completed" && (
      <>
        <span className={stateIconClass}>
          <CompletedIcon />
        </span>
        <span className="sr-only">{completedLabel}</span>
      </>
    )}

    {state === "editing" && (
      <>
        <span className={stateIconClass}>
          <EditingIcon />
        </span>
        <span className={stateLabelClass}>編集中</span>
      </>
    )}

    {state === "error" && (
      <>
        <span className={stateIconClass}>
          <ErrorIcon />
        </span>
        <span className={stateLabelClass}>エラー</span>
      </>
    )}

    {state === "skipped" && <span className="sr-only">スキップされました</span>}
  </span>
))
StepNavigationStateIndicator.displayName = "StepNavigationStateIndicator"

// --- Title ---

const StepNavigationTitle = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<"span">
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="step-navigation-title"
    className={cn(
      `
        block font-bold [text-decoration-thickness:inherit]
        text-std-18B-160
        group-data-[size=small]/step-nav:text-std-16B-170
        group-data-[orientation=horizontal]/step-nav:mt-[var(--step-title-margin)]
        group-data-[orientation=vertical]/step-nav:py-[calc(var(--step-number-size)/2+var(--step-number-margin)-0.875rem)]
      `,
      className
    )}
    {...props}
  />
))
StepNavigationTitle.displayName = "StepNavigationTitle"

// --- Description ---

const StepNavigationDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentProps<"p">
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="step-navigation-description"
    className={cn(
      `
        mt-[var(--step-description-margin)]
        group-data-[orientation=horizontal]/step-nav:text-center
        group-data-[orientation=vertical]/step-nav:mt-[calc(var(--step-description-margin)-(var(--step-number-size)/2+var(--step-number-margin)-0.875rem))]
        group-data-[orientation=vertical]/step-nav:pl-[calc(var(--step-number-size)+var(--step-number-margin)*2+1rem)]
      `,
      className
    )}
    {...props}
  />
))
StepNavigationDescription.displayName = "StepNavigationDescription"

export {
  StepNavigation,
  StepNavigationList,
  StepNavigationStep,
  StepNavigationStepHeader,
  StepNavigationNumber,
  StepNavigationStateIndicator,
  StepNavigationTitle,
  StepNavigationDescription,
}
