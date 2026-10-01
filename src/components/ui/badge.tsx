import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Clases nombradas, no utilidades sueltas — el mismo motivo que en `button.tsx`.
 * La definición vive en `src/app/globals.css`; aquí solo se nombran las variantes.
 * El API no cambia, así que los usos existentes no se tocan.
 */
const badgeVariants = cva("badge", {
  variants: {
    variant: {
      default: "badge-default",
      secondary: "badge-secondary",
      destructive: "badge-destructive",
      outline: "badge-outline",
      ghost: "badge-ghost",
      link: "badge-link",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
