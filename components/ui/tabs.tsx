"use client"

/**
 * Tabs — two shapes, one rule: a tab strip is always part of a frame.
 *
 * `attached` (the default) is a folder tab. The strip is just the rule that
 * forms the TOP EDGE of the panel it switches; the active tab is cut from the
 * panel's own surface and its bottom edge opens straight into the content.
 * Pair it with <TabsPanel> for the body. The connection between a tab and
 * what it shows is physical — the same surface, joined — rather than implied
 * by a coloured underline floating over unrelated content, which is what an
 * earlier pass here shipped and what read as "bare and disconnected".
 *
 * `line` is the underline, and it exists for one place: inside a header bar
 * that already has its own bottom rule (the inspector's SheetHeader). There
 * the bar is the frame, so the underline meets its border. Do not use it on
 * a page background.
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex flex-col", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative flex w-full items-end text-muted-foreground",
  {
    variants: {
      variant: {
        // No band behind the strip — just the rule the panel's top edge
        // makes. The active tab alone carries the panel's surface, which is
        // sharper than a tinted header and lets the page show through.
        // px-3 insets the first tab from the panel's corner, so the tab
        // reads as sitting ON the panel rather than being its edge.
        attached: "gap-1 border-b border-border px-3",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: { variant: "attached" },
  }
)

function TabsList({
  className,
  variant = "attached",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "group/tabs-trigger relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium outline-none transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-muted-foreground data-[state=active]:[&_svg]:text-brand",

        // attached — the folder tab.
        "group-data-[variant=attached]/tabs-list:-mb-px group-data-[variant=attached]/tabs-list:h-10 group-data-[variant=attached]/tabs-list:rounded-t-lg group-data-[variant=attached]/tabs-list:border group-data-[variant=attached]/tabs-list:border-transparent group-data-[variant=attached]/tabs-list:px-4",
        // Inactive: a soft rounded hover so the tab shape exists before you
        // pick it; the strip stays flat.
        "group-data-[variant=attached]/tabs-list:hover:bg-muted/40 group-data-[variant=attached]/tabs-list:hover:text-foreground",
        // Active: the panel's surface, its own side and top borders, no
        // bottom border — and one pixel lower than the band so it sits over
        // the band's rule. The result is a tab that opens into the panel.
        "group-data-[variant=attached]/tabs-list:data-[state=active]:z-10 group-data-[variant=attached]/tabs-list:data-[state=active]:border-border group-data-[variant=attached]/tabs-list:data-[state=active]:border-b-card group-data-[variant=attached]/tabs-list:data-[state=active]:bg-card group-data-[variant=attached]/tabs-list:data-[state=active]:font-semibold group-data-[variant=attached]/tabs-list:data-[state=active]:text-foreground group-data-[variant=attached]/tabs-list:data-[state=active]:hover:bg-card",
        // A brand thread along the top of the active tab: the one place the
        // accent colour appears, and it marks the tab, not the whole strip.
        // Inside the border, not over it, and clear of the rounded corners.
        "group-data-[variant=attached]/tabs-list:data-[state=active]:before:absolute group-data-[variant=attached]/tabs-list:data-[state=active]:before:inset-x-3 group-data-[variant=attached]/tabs-list:data-[state=active]:before:top-0 group-data-[variant=attached]/tabs-list:data-[state=active]:before:h-0.5 group-data-[variant=attached]/tabs-list:data-[state=active]:before:rounded-b-full group-data-[variant=attached]/tabs-list:data-[state=active]:before:bg-brand",

        // line — underline that meets the header bar's own rule.
        "group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:pb-2.5 group-data-[variant=line]/tabs-list:pt-1",
        "group-data-[variant=line]/tabs-list:hover:text-foreground group-data-[variant=line]/tabs-list:data-[state=active]:text-foreground",
        "group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-2 group-data-[variant=line]/tabs-list:after:-bottom-px group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:after:rounded-full group-data-[variant=line]/tabs-list:after:bg-brand group-data-[variant=line]/tabs-list:after:opacity-0 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

/** Muted count after a tab label — "Logs 4". */
function TabsCount({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground group-data-[state=active]/tabs-trigger:bg-brand-soft", className)}>
      {children}
    </span>
  )
}

/**
 * The body an `attached` strip opens into. Shares the strip's border and
 * surface; the strip's border-b is this panel's top edge, so it has none.
 * `flush` for content that draws its own inner frame (a log viewer, a
 * payload viewer) and should meet the panel edge.
 */
function TabsPanel({ className, flush, ...props }: React.ComponentProps<"div"> & { flush?: boolean }) {
  return (
    <div
      data-slot="tabs-panel"
      className={cn(
        // Top corners square: the strip's rule is the top edge and the
        // active tab sits on it, so a rounded corner there would gap.
        "rounded-b-xl border border-t-0 bg-card",
        flush ? "overflow-hidden" : "p-5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsCount, TabsPanel, tabsListVariants }
