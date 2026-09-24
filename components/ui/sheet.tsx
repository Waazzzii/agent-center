"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/lib/hooks/use-media-query"

/**
 * Right-hand panel for editing something BESIDE the thing it belongs to.
 *
 * Two modes. Overlay is the default; `docked` opts a panel into the other.
 *
 *   Docked (≥ lg, opt-in). An inspector. No scrim, non-modal: the page
 *   stays readable and clickable, and slides left to make room (the layout
 *   pads its main column by `--inspector-w`, which SheetContent publishes
 *   while mounted). Clicking the flow behind it does not close it — you
 *   close it with Cancel, ✕ or Escape, or open another step and it swaps.
 *   This is what "a slide-out so the flow stays visible" was always meant
 *   to be; as a modal with a black scrim it hid the flow it sat beside.
 *
 *   Overlay (< lg). Full-width modal sheet, dark scrim. There is no room to
 *   dock on a phone.
 *
 * `docked={false}` forces the overlay everywhere, for a panel that really is
 * a dialog (destructive confirmations belong in <Dialog> anyway).
 */

const DOCK_QUERY = "(min-width: 1024px)"
const SheetCtx = React.createContext<{ docked: boolean; open: boolean }>({ docked: false, open: false })

function Sheet({
  docked = false,
  modal,
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root> & { docked?: boolean }) {
  const wide = useMediaQuery(DOCK_QUERY)
  const isDocked = docked && wide
  // Open state is tracked here as well as in Radix, because SheetContent's
  // wrapper is mounted whether or not the panel is showing — only the Radix
  // primitive inside it is gated on `open`. The docked-width effect must
  // follow the panel, not the wrapper.
  const [uncontrolled, setUncontrolled] = React.useState(!!defaultOpen)
  const isOpen = open ?? uncontrolled
  return (
    <SheetCtx.Provider value={{ docked: isDocked, open: isOpen }}>
      <SheetPrimitive.Root
        data-slot="sheet"
        modal={modal ?? !isDocked}
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={(v) => { setUncontrolled(v); onOpenChange?.(v) }}
        {...props}
      />
    </SheetCtx.Provider>
  )
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/45 dark:bg-black/60",
        className
      )}
      {...props}
    />
  )
}

/**
 * Publishes the docked panel's width to the page while the panel is open.
 * The page's padding and the panel's slide share a 300ms curve, so they
 * move together on the way out as well as in.
 */
function useInspectorWidth(active: boolean, width: number) {
  React.useEffect(() => {
    if (!active) return
    const root = document.documentElement
    root.style.setProperty("--inspector-w", `${width}px`)
    return () => { root.style.removeProperty("--inspector-w") }
  }, [active, width])
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  width = 600,
  style,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "right" | "left"
  showCloseButton?: boolean
  /** Panel width in px on ≥ sm. Below sm the panel is full width. */
  width?: number
}) {
  const { docked, open } = React.useContext(SheetCtx)
  useInspectorWidth(docked && open, width)

  return (
    <SheetPortal data-slot="sheet-portal">
      {!docked && <SheetOverlay />}
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-docked={docked || undefined}
        style={{ ...style, ["--sheet-w" as string]: `${width}px` }}
        onInteractOutside={(e) => {
          onInteractOutside?.(e)
          // Docked: the page beside the panel is meant to be used while the
          // panel is open. A click out there is work, not a dismissal.
          if (docked) e.preventDefault()
        }}
        className={cn(
          "bg-background fixed inset-y-0 z-50 flex h-full w-full flex-col gap-4 p-5 outline-none sm:w-[var(--sheet-w)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out duration-300",
          // Docked reads as part of the page: a border, no drop shadow. The
          // overlay floats, and a shadow is what says so.
          docked ? "border-l shadow-none" : "border-l shadow-xl",
          side === "right" &&
            "right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          side === "left" &&
            "left-0 border-r border-l-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="ring-offset-background focus:ring-ring absolute top-4 right-4 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

/**
 * Title bar. `px-6 pt-5`, with `pb-0` when it carries a tab strip so the
 * strip's underline meets the bar's own rule. Callers add `border-b`.
 */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 pr-10", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex gap-2 sm:justify-end", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base leading-none font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
