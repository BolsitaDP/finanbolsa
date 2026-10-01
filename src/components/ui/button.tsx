import { Button as ButtonPrimitive } from "@base-ui/react/button"
import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Clases **nombradas**, no utilidades sueltas.
 *
 * Antes esta tabla era la lista literal de utilidades de cada variante y cada
 * `<button>` la llevaba dentro del `class`. Medido en `/transacciones` a 50 filas:
 * 809 caracteres repetidos 151 veces, unos 122 KB de los 433 KB de la página — el
 * 28% del peso era la misma lista copiada, y crecía con cada botón nuevo que se
 * añadía a una fila.
 *
 * Ahora cada botón emite `btn btn-ghost btn-icon-sm` y las utilidades viven en
 * `src/app/globals.css`, en un bloque `@layer components` con `@apply`. El CSS lo
 * descarga el navegador una vez; el HTML viaja en cada respuesta.
 *
 * **El API no cambia.** Sigue siendo `cva`, con los mismos nombres de `variant` y
 * `size`, así que los ~100 sitios que llaman a `<Button>` no se tocan. Lo que
 * cambia es dónde vive la lista, no qué hay en ella — por eso el cambio es
 * verificable comparando el CSS compilado antes y después.
 *
 * Lo que aquí parece más corto que la definición de abajo es correcto: `variant` y
 * `size` sin valor ya no aportan nada, y `cva` los omite.
 */
const buttonVariants = cva("btn", {
  variants: {
    variant: {
      default: "btn-default",
      outline: "btn-outline",
      secondary: "btn-secondary",
      ghost: "btn-ghost",
      destructive: "btn-destructive",
      link: "btn-link",
    },
    size: {
      default: "btn-default-size",
      xs: "btn-xs",
      sm: "btn-sm",
      lg: "btn-lg",
      icon: "btn-icon",
      "icon-xs": "btn-icon-xs",
      "icon-sm": "btn-icon-sm",
      "icon-lg": "btn-icon-lg",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
})

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
