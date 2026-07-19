// Portions derived from or inspired by digital-go-jp/design-system-example-components-react.
// Original code licensed under the MIT License.
// See THIRD_PARTY_LICENSES.md for details.
"use client"

import * as React from "react"
import {
  Button as AriaButton,
  Calendar as AriaCalendar,
  CalendarCell as AriaCalendarCell,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
  Heading as AriaHeading,
} from "react-aria-components"

import { cn } from "@/lib/utils"

const Calendar = React.forwardRef<
  React.ElementRef<typeof AriaCalendar>,
  React.ComponentPropsWithoutRef<typeof AriaCalendar>
>(({ className, ...props }, ref) => (
  <AriaCalendar
    ref={ref}
    data-slot="calendar"
    className={cn("flex flex-col items-center w-max", className)}
    {...props}
  />
))
Calendar.displayName = "Calendar"

const CalendarButton = React.forwardRef<
  React.ElementRef<typeof AriaButton>,
  React.ComponentPropsWithoutRef<typeof AriaButton>
>(({ className, ...props }, ref) => (
  <AriaButton
    ref={ref}
    data-slot="calendar-button"
    className={cn("rounded-4 px-2 py-1 hover:bg-solid-gray-50", className)}
    {...props}
  />
))
CalendarButton.displayName = "CalendarButton"

const CalendarHeading = React.forwardRef<
  React.ElementRef<typeof AriaHeading>,
  React.ComponentPropsWithoutRef<typeof AriaHeading>
>(({ className, ...props }, ref) => (
  <AriaHeading
    ref={ref}
    data-slot="calendar-heading"
    className={cn("font-bold", className)}
    {...props}
  />
))
CalendarHeading.displayName = "CalendarHeading"

const CalendarGrid = React.forwardRef<
  React.ElementRef<typeof AriaCalendarGrid>,
  React.ComponentPropsWithoutRef<typeof AriaCalendarGrid>
>(({ className, ...props }, ref) => (
  <AriaCalendarGrid
    ref={ref}
    data-slot="calendar-grid"
    className={cn("mx-3 mb-2", className)}
    {...props}
  />
))
CalendarGrid.displayName = "CalendarGrid"

const CalendarGridHeader = React.forwardRef<
  React.ElementRef<typeof AriaCalendarGridHeader>,
  React.ComponentPropsWithoutRef<typeof AriaCalendarGridHeader>
>(({ className, ...props }, ref) => (
  <AriaCalendarGridHeader
    ref={ref}
    data-slot="calendar-grid-header"
    className={cn("[&_th]:p-0", className)}
    {...props}
  />
))
CalendarGridHeader.displayName = "CalendarGridHeader"

const CalendarHeaderCell = React.forwardRef<
  React.ElementRef<typeof AriaCalendarHeaderCell>,
  React.ComponentPropsWithoutRef<typeof AriaCalendarHeaderCell>
>(({ className, ...props }, ref) => (
  <AriaCalendarHeaderCell
    ref={ref}
    data-slot="calendar-header-cell"
    className={cn("size-12 text-center font-bold", className)}
    {...props}
  />
))
CalendarHeaderCell.displayName = "CalendarHeaderCell"

const CalendarGridBody = React.forwardRef<
  React.ElementRef<typeof AriaCalendarGridBody>,
  React.ComponentPropsWithoutRef<typeof AriaCalendarGridBody>
>(({ className, ...props }, ref) => (
  <AriaCalendarGridBody
    ref={ref}
    data-slot="calendar-grid-body"
    className={cn("[&_td]:p-0", className)}
    {...props}
  />
))
CalendarGridBody.displayName = "CalendarGridBody"

const CalendarCell = React.forwardRef<
  React.ElementRef<typeof AriaCalendarCell>,
  React.ComponentPropsWithoutRef<typeof AriaCalendarCell>
>(({ className, ...props }, ref) => (
  <AriaCalendarCell
    ref={ref}
    data-slot="calendar-cell"
    className={cn(
      "m-1 flex items-center justify-center size-10 rounded-full underline-offset-[calc(3/16*1rem)] aria-disabled:hidden hover:bg-solid-gray-50 hover:underline focus:outline-0 data-[focus-visible]:bg-yellow-300 data-[focus-visible]:outline data-[focus-visible]:outline-4 data-[focus-visible]:outline-black data-[focus-visible]:outline-offset-[calc(2/16*1rem)] data-[focus-visible]:ring-[calc(2/16*1rem)] data-[focus-visible]:ring-yellow-300 data-[selected]:!bg-key-900 data-[selected]:border data-[selected]:border-transparent data-[selected]:text-white",
      className
    )}
    {...props}
  />
))
CalendarCell.displayName = "CalendarCell"

export {
  Calendar,
  CalendarButton,
  CalendarHeading,
  CalendarGrid,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarGridBody,
  CalendarCell,
}
