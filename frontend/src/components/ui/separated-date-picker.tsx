// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
import * as React from "react"

import { cn } from "@/lib/utils"

export type SeparatedDatePickerSize = "lg" | "md" | "sm"

export type SeparatedDatePickerRenderProps = {
  readOnly?: boolean
  "aria-disabled"?: boolean
  "aria-invalid"?: boolean
}

export type SeparatedDatePickerProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "children"
> & {
  size?: SeparatedDatePickerSize
  isError?: boolean
  isReadonly?: boolean
  isDisabled?: boolean
  children: (props: SeparatedDatePickerRenderProps) => React.ReactElement
}

const SeparatedDatePicker = React.forwardRef<
  HTMLDivElement,
  SeparatedDatePickerProps
>(
  (
    {
      className,
      size = "lg",
      isError,
      isReadonly,
      isDisabled,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <div className="pt-3 inline-block">
        <div
          ref={ref}
          data-slot="separated-date-picker"
          className={cn(
            "flex h-14 gap-x-4 text-solid-gray-900 data-[size=md]:h-12 data-[size=sm]:h-10",
            className
          )}
          data-size={size}
          {...rest}
        >
          {children({
            readOnly: isReadonly,
            "aria-disabled": isDisabled,
            "aria-invalid": isError,
          })}
        </div>
      </div>
    )
  }
)
SeparatedDatePicker.displayName = "SeparatedDatePicker"

const separatedDatePickerFieldClass =
  'h-full rounded-8 border border-solid-gray-600 bg-white text-center read-only:[&:not([aria-disabled="true"])]:border-dashed hover:border-solid-gray-900 hover:read-only:border-solid-gray-600 focus:border-solid-gray-900 focus:outline focus:outline-4 focus:outline-offset-[calc(2/16*1rem)] focus:outline-black focus:ring-[calc(2/16*1rem)] focus:ring-yellow-300 aria-disabled:bg-solid-gray-50 aria-disabled:text-solid-gray-420 aria-disabled:hover:border-solid-gray-600 aria-[invalid=true]:border-error-1 aria-[invalid=true]:hover:border-red-1000 forced-colors:[&:read-write]:aria-disabled:border-[GrayText]'

const separatedDatePickerLabelSpanClass =
  "absolute inset-x-0 -top-3 mx-auto w-6 bg-white p-1 text-oln-16N-100 [&:has(+[aria-disabled=true])]:text-solid-gray-420 forced-colors:[&:has(+[aria-disabled=true])]:text-[GrayText]"

export type SeparatedDatePickerYearProps =
  React.ComponentPropsWithoutRef<"input">

const SeparatedDatePickerYear = React.forwardRef<
  HTMLInputElement,
  SeparatedDatePickerYearProps
>(({ className, "aria-disabled": disabled, readOnly, ...rest }, ref) => {
  return (
    <label
      data-slot="separated-date-picker-year"
      className='relative [&:has([aria-disabled="true"])]:pointer-events-none'
    >
      <span className={separatedDatePickerLabelSpanClass}>年</span>
      <input
        className={cn(
          separatedDatePickerFieldClass,
          "w-[calc(72/16*1rem)]",
          className
        )}
        type="text"
        inputMode="numeric"
        pattern="\d+"
        readOnly={disabled ? true : readOnly}
        aria-disabled={disabled}
        ref={ref}
        {...rest}
      />
    </label>
  )
})
SeparatedDatePickerYear.displayName = "SeparatedDatePickerYear"

export type SeparatedDatePickerMonthProps =
  React.ComponentPropsWithoutRef<"input">

const SeparatedDatePickerMonth = React.forwardRef<
  HTMLInputElement,
  SeparatedDatePickerMonthProps
>(({ className, "aria-disabled": disabled, readOnly, ...rest }, ref) => {
  return (
    <label
      data-slot="separated-date-picker-month"
      className='relative [&:has([aria-disabled="true"])]:pointer-events-none'
    >
      <span className={separatedDatePickerLabelSpanClass}>月</span>
      <input
        className={cn(separatedDatePickerFieldClass, "w-14", className)}
        type="text"
        inputMode="numeric"
        pattern="\d+"
        readOnly={disabled ? true : readOnly}
        aria-disabled={disabled}
        ref={ref}
        {...rest}
      />
    </label>
  )
})
SeparatedDatePickerMonth.displayName = "SeparatedDatePickerMonth"

export type SeparatedDatePickerDateProps =
  React.ComponentPropsWithoutRef<"input">

const SeparatedDatePickerDate = React.forwardRef<
  HTMLInputElement,
  SeparatedDatePickerDateProps
>(({ className, "aria-disabled": disabled, readOnly, ...rest }, ref) => {
  return (
    <label
      data-slot="separated-date-picker-date"
      className='relative [&:has([aria-disabled="true"])]:pointer-events-none'
    >
      <span className={separatedDatePickerLabelSpanClass}>日</span>
      <input
        className={cn(separatedDatePickerFieldClass, "w-14", className)}
        type="text"
        inputMode="numeric"
        pattern="\d+"
        readOnly={disabled ? true : readOnly}
        aria-disabled={disabled}
        ref={ref}
        {...rest}
      />
    </label>
  )
})
SeparatedDatePickerDate.displayName = "SeparatedDatePickerDate"

export type SeparatedDatePickerCalendarButtonProps =
  React.ComponentPropsWithoutRef<"button"> & {
    size?: SeparatedDatePickerSize
  }

const SeparatedDatePickerCalendarButton = React.forwardRef<
  HTMLButtonElement,
  SeparatedDatePickerCalendarButtonProps
>(({ className, size = "lg", ...rest }, ref) => {
  return (
    <button
      data-slot="separated-date-picker-calendar-button"
      className={cn(
        "group flex h-14 items-center justify-center gap-x-1 rounded-6 border border-key-900 bg-white px-3 text-key-900 hover:border-[calc(3/16*1rem)] hover:px-2.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300 data-[size=md]:h-12 data-[size=sm]:h-10",
        className
      )}
      type="button"
      data-size={size}
      ref={ref}
      {...rest}
    >
      <svg
        width="24px"
        height="24px"
        viewBox="0 -960 960 960"
        role="img"
        aria-label="カレンダー"
      >
        <path
          d="M360-300q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Z"
          fill="currentcolor"
        />
      </svg>
      <svg
        className="size-4 group-aria-expanded:rotate-180"
        viewBox="0 0 24 24"
        aria-hidden={true}
      >
        <path
          d="M12 17.1L3 8L4 7L12 15L20 7L21 8L12 17.1Z"
          fill="currentcolor"
        />
      </svg>
    </button>
  )
})
SeparatedDatePickerCalendarButton.displayName =
  "SeparatedDatePickerCalendarButton"

export {
  SeparatedDatePicker,
  SeparatedDatePickerYear,
  SeparatedDatePickerMonth,
  SeparatedDatePickerDate,
  SeparatedDatePickerCalendarButton,
}
