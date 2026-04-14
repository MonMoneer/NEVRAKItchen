import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface Props {
  label: string;                        // e.g. "Offset cm" / "Length cm" / "Depth cm"
  initialValue?: string;
  cursorPx: { x: number; y: number };   // position on canvas wrapper (screen px)
  onCommit: (value: number) => void;
  onCancel: () => void;
}

export function IslandInputOverlay({
  label,
  initialValue = "",
  cursorPx,
  onCommit,
  onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const n = parseFloat(value);
      if (Number.isFinite(n) && n > 0) onCommit(n);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="absolute bg-card border border-border rounded-md shadow-lg px-2 py-1 flex items-center gap-1 pointer-events-auto"
      style={{
        left: cursorPx.x + 14,
        top: cursorPx.y - 18,
        zIndex: 60,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        ref={inputRef}
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-20 h-7 text-xs"
        placeholder={label}
      />
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}
