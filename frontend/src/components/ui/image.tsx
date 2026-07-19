import * as React from "react"

import { cn } from "@/lib/utils"

const Image = React.forwardRef<HTMLImageElement, React.ComponentProps<"img">>(
  ({ className, alt = "", ...props }, ref) => {
    return (
      <img
        ref={ref}
        data-slot="image"
        alt={alt}
        className={cn(
          "block max-w-full h-auto group-data-[full-width]/image:w-full",
          className
        )}
        {...props}
      />
    )
  }
)
Image.displayName = "Image"

const ImageFigure = React.forwardRef<
  HTMLElement,
  React.ComponentProps<"figure"> & { fullWidth?: boolean }
>(({ className, fullWidth, children, ...props }, ref) => {
  return (
    <figure
      ref={ref}
      data-slot="image-figure"
      data-full-width={fullWidth ? "" : undefined}
      className={cn("group/image w-fit data-[full-width]:w-full", className)}
      {...props}
    >
      {children}
    </figure>
  )
})
ImageFigure.displayName = "ImageFigure"

const ImageArea = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { bordered?: boolean }
>(({ className, bordered, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="image-area"
      data-bordered={bordered ? "" : undefined}
      className={cn(
        "[&_img]:block [&_img]:max-w-full [&_img]:h-auto group-data-[full-width]/image:[&_img]:w-full data-[bordered]:outline data-[bordered]:outline-1 data-[bordered]:outline-solid-gray-420 data-[bordered]:[outline-offset:-1px]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
ImageArea.displayName = "ImageArea"

const ImageAreaLink = React.forwardRef<
  HTMLAnchorElement,
  Omit<React.ComponentProps<"a">, "href"> & { href: string }
>(({ className, children, ...props }, ref) => {
  return (
    <a
      ref={ref}
      data-slot="image-area-link"
      className={cn(
        "block [&_img]:block [&_img]:max-w-full [&_img]:h-auto group-data-[full-width]/image:[&_img]:w-full outline outline-1 outline-blue-900 [outline-offset:-1px] hover:outline-4 hover:[outline-offset:-4px] focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300",
        className
      )}
      {...props}
    >
      {children}
    </a>
  )
})
ImageAreaLink.displayName = "ImageAreaLink"

type ImageCaptionStyle = "dashed" | "solid"

const ImageCaption = React.forwardRef<
  HTMLElement,
  React.ComponentProps<"figcaption"> & { captionStyle?: ImageCaptionStyle }
>(({ className, captionStyle, children, ...props }, ref) => {
  return (
    <figcaption
      ref={ref}
      data-slot="image-caption"
      data-style={captionStyle}
      className={cn(
        "mt-2 [contain:inline-size] py-2 px-6 text-solid-gray-900 text-std-16N-170 data-[style=dashed]:border data-[style=dashed]:border-dashed data-[style=dashed]:border-solid-gray-700 data-[style=solid]:border data-[style=solid]:border-solid-gray-420",
        className
      )}
      {...props}
    >
      {children}
    </figcaption>
  )
})
ImageCaption.displayName = "ImageCaption"

export {
  Image,
  ImageFigure,
  ImageArea,
  ImageAreaLink,
  ImageCaption,
  type ImageCaptionStyle,
}
