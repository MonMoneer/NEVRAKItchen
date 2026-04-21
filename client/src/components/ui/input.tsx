import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, inputMode, ...props }, ref) => {
    // On touch devices, `type="number"` still shows the full QWERTY by
    // default — only `inputMode="decimal"` forces the compact numeric
    // keyboard. Auto-apply it for number inputs so every numeric field
    // in the app becomes thumb-friendly without touching every call site.
    const resolvedInputMode =
      inputMode ?? (type === "number" ? "decimal" : undefined);
    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        inputMode={resolvedInputMode}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
