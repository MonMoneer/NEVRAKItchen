import { useEffect, useRef } from "react";
import type { WallPointItem } from "@/stores/useCanvasStore";

interface WallPointPopupProps {
  point: WallPointItem;
  screenX: number;
  screenY: number;
  containerWidth: number;
  containerHeight: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const POPUP_WIDTH = 280;
const POPUP_HEIGHT_ESTIMATE = 300;
const OFFSET = 20;

export function WallPointPopup({
  point,
  screenX,
  screenY,
  containerWidth,
  containerHeight,
  onEdit,
  onDelete,
  onClose,
}: WallPointPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Click-away dismiss
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the click that opened the popup from immediately closing it
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Edge-clamped positioning
  let left = screenX + OFFSET;
  let top = screenY - POPUP_HEIGHT_ESTIMATE / 2;

  if (left + POPUP_WIDTH > containerWidth) {
    left = screenX - POPUP_WIDTH - OFFSET;
  }
  if (left < 10) left = 10;
  if (top + POPUP_HEIGHT_ESTIMATE > containerHeight) {
    top = containerHeight - POPUP_HEIGHT_ESTIMATE - 10;
  }
  if (top < 10) top = 10;

  return (
    <div
      ref={popupRef}
      className="absolute z-50 bg-white border-2 border-gray-200 rounded-xl shadow-xl p-4 pointer-events-auto"
      style={{ left, top, width: POPUP_WIDTH }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            {point.type === "electrical" ? "\u26A1" : "\uD83D\uDCA7"}
          </span>
          <h3 className="text-sm font-bold text-gray-800">
            {point.type === "electrical" ? "Electrical Point" : "Plumbing Point"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          x
        </button>
      </div>

      <div className="space-y-2 text-sm text-gray-700">
        <div className="flex justify-between">
          <span className="text-gray-500">Height from floor</span>
          <span className="font-semibold">{point.heightCm} cm</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Distance from corner</span>
          <span className="font-semibold">{point.distanceCm} cm</span>
        </div>
        {point.note && (
          <div>
            <span className="text-gray-500 block">Note</span>
            <span className="text-gray-800">{point.note}</span>
          </div>
        )}
        {point.photo && (
          <img
            src={point.photo}
            alt="wall point photo"
            className="w-full h-28 object-cover rounded-lg border border-gray-200 mt-1"
          />
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg py-1.5 hover:bg-blue-50 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="flex-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg py-1.5 hover:bg-red-50 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
