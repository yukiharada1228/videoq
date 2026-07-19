// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"

import { cn } from "@/lib/utils"

export type ProgressIndicatorType = "stacked" | "inlined" | "stacked-underlay"
export type ProgressIndicatorSize = "lg" | "sm"

const progressIndicatorKeyframes = `
@keyframes digital-agency-spinner-rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes digital-agency-spinner-group-rotate {
  0% { transform: rotate(0deg); }
  30% { transform: rotate(135deg); }
  100% { transform: rotate(180deg); }
}

@keyframes digital-agency-spinner-bar-rotate {
  0% { transform: rotate(0deg); }
  4% { transform: rotate(0deg); }
  30% {
    transform: rotate(360deg);
    animation-timing-function: cubic-bezier(0.5, 0.4, 0.3, 0.9);
  }
  100% { transform: rotate(540deg); }
}

@keyframes digital-agency-spinner-bar-dash {
  0% { stroke-dasharray: 8 92; stroke-dashoffset: 4; }
  30% { stroke-dasharray: 80 20; stroke-dashoffset: 40; }
  100% { stroke-dasharray: 8 92; stroke-dashoffset: 4; }
}

@keyframes digital-agency-linear-rotate {
  0% { stroke-dashoffset: 100; }
  100% { stroke-dashoffset: -100; }
}
`

export type ProgressIndicatorProps = Omit<
  React.ComponentProps<"div">,
  "role" | "type"
> & {
  type: ProgressIndicatorType
  value?: number
  active?: boolean
}

const clampValue = (value: number) => Math.min(100, Math.max(0, value))

const ProgressIndicator = React.forwardRef<
  HTMLDivElement,
  ProgressIndicatorProps
>(
  (
    { children, className, type, value, active = true, style, ...rest },
    ref
  ) => {
    if (!active) return null

    const hasValue = value !== undefined && Number.isFinite(value)
    const normalizedValue = hasValue ? clampValue(value as number) : undefined
    const isIndeterminate = normalizedValue === undefined

    const mergedStyle: React.CSSProperties = {
      ...style,
      ...(normalizedValue !== undefined
        ? { ["--value" as string]: String(normalizedValue) }
        : {}),
    }

    return (
      <div
        ref={ref}
        data-slot="progress-indicator"
        className={cn(
          `
        group/progress-indicator flex justify-center items-center gap-y-4 gap-x-2 text-solid-gray-900 text-std-16N-170
        data-[type=stacked]:flex-col
        data-[type=stacked-underlay]:flex-col data-[type=stacked-underlay]:mx-auto data-[type=stacked-underlay]:box-border data-[type=stacked-underlay]:w-fit data-[type=stacked-underlay]:rounded-16 data-[type=stacked-underlay]:border data-[type=stacked-underlay]:border-solid-gray-500 data-[type=stacked-underlay]:bg-white
        data-[type=stacked-underlay]:has-[[data-indicator=spinner]]:min-w-[calc(128/16*1rem)] data-[type=stacked-underlay]:has-[[data-indicator=spinner]]:min-h-[calc(128/16*1rem)] data-[type=stacked-underlay]:has-[[data-indicator=spinner]]:p-4
        data-[type=stacked-underlay]:has-[[data-indicator=static]]:min-w-[calc(128/16*1rem)] data-[type=stacked-underlay]:has-[[data-indicator=static]]:min-h-[calc(128/16*1rem)] data-[type=stacked-underlay]:has-[[data-indicator=static]]:p-4
        data-[type=stacked-underlay]:has-[[data-indicator=linear]]:p-6
      `,
          className
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedValue}
        data-type={type}
        data-indeterminate={isIndeterminate ? "" : undefined}
        style={mergedStyle}
        {...rest}
      >
        <style
          dangerouslySetInnerHTML={{ __html: progressIndicatorKeyframes }}
        />
        {children}
      </div>
    )
  }
)
ProgressIndicator.displayName = "ProgressIndicator"

// --- Spinner ---

const spinnerBarAnimationClass = `
  group-data-[indeterminate]/progress-indicator:[animation:digital-agency-spinner-bar-rotate_2.5s_cubic-bezier(0.4,0,0.3,1)_infinite,digital-agency-spinner-bar-dash_2.5s_cubic-bezier(0.4,0,0.3,1)_infinite]
  motion-reduce:![animation:none]
`

const spinnerOuterGroupAnimationClass = `
  group-data-[indeterminate]/progress-indicator:[animation:digital-agency-spinner-rotate_13s_linear_infinite]
  motion-reduce:![animation:none]
`

const spinnerInnerGroupAnimationClass = `
  group-data-[indeterminate]/progress-indicator:[animation:digital-agency-spinner-group-rotate_2.5s_linear_infinite]
  motion-reduce:![animation:none]
`

export type ProgressIndicatorSpinnerProps = Omit<
  React.ComponentProps<"svg">,
  "children"
> & {
  size?: ProgressIndicatorSize
}

const ProgressIndicatorSpinner = React.forwardRef<
  SVGSVGElement,
  ProgressIndicatorSpinnerProps
>(({ size = "lg", className, ...rest }, ref) => {
  const isLg = size === "lg"
  const dimension = isLg ? 48 : 24
  const center = isLg ? 24 : 12
  const radius = isLg ? 22 : 8
  const outerRadius = isLg ? 23.5 : 9.5
  const strokeWidth = isLg ? 4 : 3

  return (
    <svg
      ref={ref}
      data-slot="progress-indicator-spinner"
      width={dimension}
      height={dimension}
      viewBox={`0 0 ${dimension} ${dimension}`}
      stroke="currentcolor"
      fill="none"
      aria-hidden={true}
      data-indicator="spinner"
      className={cn(className)}
      {...rest}
    >
      <circle
        className="stroke-current text-key-100 forced-colors:text-[Canvas]"
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={strokeWidth}
      />
      <g
        className={`[transform-origin:center] ${spinnerOuterGroupAnimationClass}`}
      >
        <g
          className={`[transform-origin:center] ${spinnerInnerGroupAnimationClass}`}
        >
          <circle
            className={`
              text-key-1200 [stroke-dasharray:100] [transform:rotate(-90deg)] [transform-origin:center]
              [stroke-dashoffset:calc(100-clamp(0,var(--value,35),100))]
              forced-colors:text-[CanvasText]
              ${spinnerBarAnimationClass}
            `}
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
            pathLength={100}
          />
        </g>
      </g>
      <circle
        className="text-key-1200 forced-colors:text-[CanvasText]"
        cx={center}
        cy={center}
        r={outerRadius}
        strokeWidth={1}
      />
    </svg>
  )
})
ProgressIndicatorSpinner.displayName = "ProgressIndicatorSpinner"

// --- Linear ---

const linearBarClass = `
  [stroke-dasharray:100]
  group-data-[indeterminate]/progress-indicator:[stroke-dasharray:35_65]
  group-data-[indeterminate]/progress-indicator:[animation:digital-agency-linear-rotate_4s_linear_infinite]
  motion-reduce:![animation:none]
`

export type ProgressIndicatorLinearProps = Omit<
  React.ComponentProps<"svg">,
  "children"
> & {
  size?: ProgressIndicatorSize
}

const ProgressIndicatorLinear = React.forwardRef<
  SVGSVGElement,
  ProgressIndicatorLinearProps
>(({ size = "lg", className, ...rest }, ref) => {
  const width = size === "lg" ? 240 : 80

  return (
    <svg
      ref={ref}
      data-slot="progress-indicator-linear"
      width={width}
      height={4}
      viewBox={`0 0 ${width} 4`}
      stroke="currentcolor"
      fill="none"
      aria-hidden={true}
      data-indicator="linear"
      className={cn(className)}
      {...rest}
    >
      <line
        className="stroke-current text-key-100 forced-colors:text-[Canvas]"
        x1={0}
        y1={2}
        x2={width}
        y2={2}
        strokeWidth={4}
      />
      <line
        className={`
          text-key-1200 forced-colors:text-[CanvasText]
          [stroke-dashoffset:calc(100-clamp(0,var(--value,35),100))]
          ${linearBarClass}
        `}
        x1={0}
        y1={2}
        x2={width}
        y2={2}
        strokeWidth={4}
        pathLength={100}
      />
      <line
        className="text-key-1200 forced-colors:text-[CanvasText]"
        x1={0}
        y1={3.5}
        x2={width}
        y2={3.5}
        strokeWidth={1}
      />
    </svg>
  )
})
ProgressIndicatorLinear.displayName = "ProgressIndicatorLinear"

// --- Static ---

export type ProgressIndicatorStaticProps = Omit<
  React.ComponentProps<"svg">,
  "children"
> & {
  size?: ProgressIndicatorSize
}

const ProgressIndicatorStatic = React.forwardRef<
  SVGSVGElement,
  ProgressIndicatorStaticProps
>(({ size = "lg", className, ...rest }, ref) => {
  if (size === "lg") {
    return (
      <svg
        ref={ref}
        data-slot="progress-indicator-static"
        width={48}
        height={48}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden={true}
        data-indicator="static"
        className={cn(
          "text-key-1200 forced-colors:text-[CanvasText]",
          className
        )}
        {...rest}
      >
        <path
          fill="currentcolor"
          d="M17 15c0 2.5 2.2 7 7 7s7-5 7-7H17ZM15 42h18c0-2-1-4.5-1-4.5L24 34l-8 3.5S15 40 15 42Z"
        />
        <path
          fill="none"
          stroke="currentcolor"
          strokeWidth={2}
          d="M24 24C34.5 24 35.5 6 35.5 4.8V4M24 24C13.5 24 12.5 6 12.5 4.8V4M24 24c7 0 11.5 11.8 11.5 18.3V44M24 24c-7 0-11.5 11.8-11.5 18.3V44M9 4h30M9 44h30"
        />
        <circle cx={24} cy={28} r={1} fill="currentcolor" />
        <circle cx={24} cy={31} r={1} fill="currentcolor" />
      </svg>
    )
  }

  return (
    <svg
      ref={ref}
      data-slot="progress-indicator-static"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={true}
      data-indicator="static"
      className={cn("text-key-1200 forced-colors:text-[CanvasText]", className)}
      {...rest}
    >
      <path
        fill="currentcolor"
        d="M9 6c0 1.8 1.1 5 3.5 5S16 7.4 16 6H9ZM8 21h9c0-1-.5-2.2-.5-2.2l-4-1.8-4 1.8S8 20 8 21Z"
      />
      <path
        fill="none"
        stroke="currentcolor"
        d="M4 1.5h17m-17 21h17M6 1.5C6 5.1 7.6 12 12.5 12S18.9 5 19 1.5M19 22.5c.3-3.7-2.2-10.5-6.5-10.5S5.7 18.8 6 22.5"
      />
      <circle cx={12.5} cy={13.5} r={0.5} fill="currentcolor" />
      <circle cx={12.5} cy={15.5} r={0.5} fill="currentcolor" />
    </svg>
  )
})
ProgressIndicatorStatic.displayName = "ProgressIndicatorStatic"

// --- Announcer hook ---

const DEFAULT_ANNOUNCE_INTERVAL_SEC = 5

export type ProgressIndicatorAnnouncerMessages = {
  start?: string
  end?: string
  long?: string
  longWithValue?: string
}

const defaultMessages: Required<ProgressIndicatorAnnouncerMessages> = {
  start: "読み込みを開始しました",
  end: "読み込みが完了しました",
  long: "読み込み中です",
  longWithValue: "{value}% 読み込みました。",
}

export type UseProgressIndicatorAnnouncerProps = {
  active: boolean
  value?: number
  announceInterval?: number
  messages?: ProgressIndicatorAnnouncerMessages
}

const format = (template: string, variables: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key) =>
    variables[key] !== undefined ? String(variables[key]) : match
  )

/**
 * スクリーンリーダーへの通知テキストを管理する hook。
 * 戻り値を `role="status"` のビジュアル上隠した要素に差し込んで使用する。
 */
const useProgressIndicatorAnnouncer = (
  props: UseProgressIndicatorAnnouncerProps
) => {
  const { active, value, announceInterval, messages } = props
  const [text, setText] = React.useState("")

  const valueRef = React.useRef(value)
  valueRef.current = value

  const messagesRef = React.useRef(messages)
  messagesRef.current = messages

  const previousActiveRef = React.useRef(false)

  React.useEffect(() => {
    const getMessage = (key: keyof ProgressIndicatorAnnouncerMessages) =>
      messagesRef.current?.[key] ?? defaultMessages[key]

    const timers: number[] = []

    const announce = (nextText: string) => {
      const showTimer = window.setTimeout(() => {
        setText(nextText)
        const clearTextTimer = window.setTimeout(() => setText(""), 1000)
        timers.push(clearTextTimer)
      }, 100)
      timers.push(showTimer)
    }

    const announceLong = () => {
      const currentValue = valueRef.current
      if (currentValue !== undefined && Number.isFinite(currentValue)) {
        announce(
          format(getMessage("longWithValue"), {
            value: Math.round(currentValue),
          })
        )
      } else {
        announce(getMessage("long"))
      }
    }

    const wasActive = previousActiveRef.current
    previousActiveRef.current = active

    if (active) {
      if (!wasActive) {
        announce(getMessage("start"))
      }

      const intervalMs =
        (announceInterval && announceInterval > 0
          ? announceInterval
          : DEFAULT_ANNOUNCE_INTERVAL_SEC) * 1000

      const longTimer = window.setTimeout(() => {
        announceLong()
        const repeatTimer = window.setInterval(announceLong, intervalMs)
        timers.push(repeatTimer)
      }, intervalMs)
      timers.push(longTimer)
    } else if (wasActive) {
      announce(getMessage("end"))
    }

    return () => {
      for (const id of timers) {
        window.clearTimeout(id)
        window.clearInterval(id)
      }
    }
  }, [active, announceInterval])

  return text
}

export {
  ProgressIndicator,
  ProgressIndicatorSpinner,
  ProgressIndicatorLinear,
  ProgressIndicatorStatic,
  useProgressIndicatorAnnouncer,
}
