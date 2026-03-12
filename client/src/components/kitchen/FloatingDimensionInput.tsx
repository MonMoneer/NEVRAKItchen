import { useState, useEffect, useRef } from "react";

interface FloatingDimensionInputProps {
  x: number;
  y: number;
  unit: "cm" | "m";
  onConfirm: (valueCm: number) => void;
  onCancel: () => void;
  stageOffset: { x: number; y: number };
  scale: number;
  label?: string;
}

export function FloatingDimensionInput({
  x,
  y,
  unit,
  onConfirm,
  onCancel,
  stageOffset,
  scale,
  label,
}: FloatingDimensionInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const num = parseFloat(value);
      if (!isNaN(num) && num > 0) {
        const cm = unit === "m" ? num * 100 : num;
        onConfirm(cm);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const screenX = x * scale + stageOffset.x;
  const screenY = y * scale + stageOffset.y;

  return (
    <div
      className="absolute z-50 pointer-events-auto"
      style={{
        left: `${screenX + 16}px`,
        top: `${screenY - 20}px`,
      }}
      data-testid="floating-dimension-input"
    >
      {label && (
        <div className="text-[10px] font-medium text-primary mb-1 whitespace-nowrap select-none" data-testid="text-dimension-label">
          {label}
        </div>
      )}
      <div className="flex items-center bg-card border border-border rounded-md shadow-lg overflow-visible">
        <input
          ref={inputRef}
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0"
          className="w-20 h-8 px-2.5 text-sm font-mono bg-transparent text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          data-testid="input-dimension"
          step="any"
          min="0"
        />
        <span className="text-[11px] text-muted-foreground font-medium pr-2.5 select-none">
          {unit}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap select-none">
        Enter to confirm, Esc to cancel
      </div>
    </div>
  );
}
