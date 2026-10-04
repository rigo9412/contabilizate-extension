import * as React from "react";
import { cn } from "@/lib/utils";

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Catálogo clave → descripción; cada opción se muestra como "clave - descripción". */
  options: Record<string, string>;
  placeholder?: string;
  /** false muestra solo la descripción (para opciones cuya clave no dice nada). */
  showKey?: boolean;
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, options, placeholder, showKey = true, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {/* JS ordena primero las llaves numéricas ("12") antes que "01"; se reordena por clave. */}
      {Object.entries(options)
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([key, label]) => (
        <option key={key} value={key}>
          {!showKey || key === label ? label : `${key} - ${label}`}
        </option>
      ))}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";
