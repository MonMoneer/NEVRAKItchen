import { useState, useEffect, useCallback, useRef } from "react";
import { evaluateExpression, formatResult } from "@/lib/expression-evaluator";

/**
 * Writes a value to a React-controlled <input> by calling the native setter
 * and dispatching a real 'input' event, which triggers React's onChange.
 */
function setNativeInputValue(el: HTMLInputElement, value: string): void {
	const setter = Object.getOwnPropertyDescriptor(
		window.HTMLInputElement.prototype,
		"value"
	)?.set;
	if (setter) setter.call(el, value);
	el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Map from a key character/name to (code, keyCode) so dispatched events look
 * close enough to real ones for React handlers and the canvas-level
 * document keydown listener.
 */
function keyMeta(key: string): { code: string; keyCode: number } {
	if (key === "Enter") return { code: "Enter", keyCode: 13 };
	if (key === "Escape") return { code: "Escape", keyCode: 27 };
	if (key === "Backspace") return { code: "Backspace", keyCode: 8 };
	if (key === ".") return { code: "Period", keyCode: 190 };
	if (/^[0-9]$/.test(key)) return { code: `Digit${key}`, keyCode: 48 + Number(key) };
	return { code: key, keyCode: 0 };
}

/**
 * Dispatches a synthetic key event sequence (keydown + keyup) on the given
 * target so React handlers fire as if the user pressed a real key. Used to
 * route on-screen keypad presses to either a focused <input> (form-input
 * behavior) or document.body (canvas-drawing flow at DesignerCanvas.tsx
 * which listens for keydown on document/window).
 */
function dispatchKey(target: EventTarget, key: string): void {
	const { code, keyCode } = keyMeta(key);
	const common = {
		key,
		code,
		keyCode,
		which: keyCode,
		bubbles: true,
		cancelable: true,
	};
	target.dispatchEvent(new KeyboardEvent("keydown", common));
	if (key === "Enter") {
		// keypress is legacy but some handlers still listen for it
		target.dispatchEvent(new KeyboardEvent("keypress", common));
	}
	target.dispatchEvent(new KeyboardEvent("keyup", common));
}

/** Back-compat shim — preserves the old call site for Enter-on-input. */
function dispatchEnter(el: HTMLInputElement): void {
	dispatchKey(el, "Enter");
}

function isNumberInput(el: Element | null): el is HTMLInputElement {
	return (
		el instanceof HTMLInputElement &&
		(el.type === "number" || el.type === "text") &&
		!el.readOnly &&
		!el.disabled
	);
}

type KeyDef = {
	label: string;
	send?: string; // character to append (if different from label)
	kind: "digit" | "op" | "eq" | "clear" | "ce" | "esc";
	colSpan?: number;
	rowSpan?: number;
	className?: string;
};

const KEYS: KeyDef[] = [
	{ label: "C", kind: "clear", className: "bg-red-100 hover:bg-red-200 text-red-700" },
	{ label: "÷", send: "/", kind: "op", className: "bg-amber-50 hover:bg-amber-100 text-amber-700" },
	{ label: "×", send: "*", kind: "op", className: "bg-amber-50 hover:bg-amber-100 text-amber-700" },
	{ label: "CE", kind: "ce", className: "bg-muted hover:bg-muted/80 text-muted-foreground" },
	{ label: "7", kind: "digit" },
	{ label: "8", kind: "digit" },
	{ label: "9", kind: "digit" },
	{ label: "−", send: "-", kind: "op", className: "bg-amber-50 hover:bg-amber-100 text-amber-700" },
	{ label: "4", kind: "digit" },
	{ label: "5", kind: "digit" },
	{ label: "6", kind: "digit" },
	{ label: "+", kind: "op", className: "bg-amber-50 hover:bg-amber-100 text-amber-700" },
	{ label: "1", kind: "digit" },
	{ label: "2", kind: "digit" },
	{ label: "3", kind: "digit" },
	{ label: "=", kind: "eq", className: "bg-slate-800 hover:bg-slate-900 text-white" },
	{ label: "%", send: "%", kind: "op", className: "bg-amber-50 hover:bg-amber-100 text-amber-700" },
	{ label: "0", kind: "digit" },
	{ label: ".", kind: "digit" },
	{ label: "Esc", kind: "esc", className: "bg-red-600 hover:bg-red-700 text-white" },
];

export function Keypad() {
	// Scratchpad expression (used when no input focused)
	const [scratchpad, setScratchpad] = useState("");
	// Last focused input element (for auto-transfer)
	const lastFocusedInputRef = useRef<HTMLInputElement | null>(null);
	const [mirroredValue, setMirroredValue] = useState<string | null>(null);

	// Track focused number input
	useEffect(() => {
		const onFocusIn = (e: FocusEvent) => {
			const target = e.target as Element | null;
			if (isNumberInput(target)) {
				lastFocusedInputRef.current = target;
				setMirroredValue(target.value);
				// Auto-transfer scratchpad on focus
				if (scratchpad.length > 0) {
					setNativeInputValue(target, scratchpad);
					setScratchpad("");
					setMirroredValue(target.value);
				}
			}
		};
		const onFocusOut = (e: FocusEvent) => {
			// Delay to let any new focus arrive first
			setTimeout(() => {
				const active = document.activeElement;
				if (!isNumberInput(active)) {
					lastFocusedInputRef.current = null;
					setMirroredValue(null);
				}
			}, 0);
		};
		const onInput = (e: Event) => {
			const target = e.target as Element | null;
			if (isNumberInput(target) && target === lastFocusedInputRef.current) {
				setMirroredValue(target.value);
			}
		};
		document.addEventListener("focusin", onFocusIn);
		document.addEventListener("focusout", onFocusOut);
		document.addEventListener("input", onInput);
		return () => {
			document.removeEventListener("focusin", onFocusIn);
			document.removeEventListener("focusout", onFocusOut);
			document.removeEventListener("input", onInput);
		};
	}, [scratchpad]);

	// Current expression: either the focused input's value or the scratchpad
	const activeExpression =
		lastFocusedInputRef.current && mirroredValue !== null
			? mirroredValue
			: scratchpad;

	const liveResult =
		activeExpression.length > 0 ? evaluateExpression(activeExpression) : null;
	const liveResultText =
		liveResult !== null ? `= ${formatResult(liveResult)}` : activeExpression.length > 0 ? "= —" : "";

	// Write to the focused input (keeping focus) OR mutate scratchpad
	const writeExpression = useCallback((next: string) => {
		const el = lastFocusedInputRef.current;
		if (el && document.activeElement === el) {
			setNativeInputValue(el, next);
			setMirroredValue(next);
		} else {
			setScratchpad(next);
		}
	}, []);

	const handleKey = useCallback(
		(key: KeyDef) => {
			const current = activeExpression;
			const focused = lastFocusedInputRef.current;
			const inputActive = focused && document.activeElement === focused;

			if (key.kind === "clear") {
				writeExpression("");
				return;
			}
			if (key.kind === "ce") {
				writeExpression(current.slice(0, -1));
				return;
			}
			if (key.kind === "esc") {
				// Mirrors physical Escape. With a focused input, deliver Escape to
				// it (panel-specific handlers may close/clear). Without one, deliver
				// at document level so the canvas drawing flow's keydown listener
				// (DesignerCanvas wallTypedInput / island phase walk-back) sees it.
				if (inputActive) {
					dispatchKey(focused, "Escape");
				} else {
					dispatchKey(document.body, "Escape");
				}
				// Always clear the keypad's own expression — Escape means "abandon".
				writeExpression("");
				return;
			}
			if (key.kind === "eq") {
				if (current.length === 0) return;
				const result = evaluateExpression(current);
				if (result === null) return;
				const formatted = formatResult(result);
				if (inputActive) {
					// Focused input path (existing behavior): write result + Enter.
					setNativeInputValue(focused, formatted);
					setMirroredValue(formatted);
					setScratchpad("");
					dispatchEnter(focused);
				} else {
					// Canvas-drawing path: the canvas reads digits via document
					// keydown, so re-emit each digit of the evaluated result and
					// then Enter. This makes `500-200` then `=` behave as if the
					// user had typed `300<Enter>` on a physical keyboard.
					for (const ch of formatted) {
						if (/^[0-9.]$/.test(ch)) dispatchKey(document.body, ch);
					}
					dispatchKey(document.body, "Enter");
					setScratchpad("");
					setMirroredValue(null);
				}
				return;
			}
			// digit or op — append character
			const ch = key.send ?? key.label;
			// Prevent consecutive operators (except unary minus at start)
			if (key.kind === "op" && ch !== "%") {
				const last = current[current.length - 1];
				if (last && "+-*/".includes(last)) {
					// Replace last operator
					writeExpression(current.slice(0, -1) + ch);
					return;
				}
				if (current.length === 0 && ch !== "-") {
					// Can't start with +, *, / (only - as unary)
					return;
				}
			}
			// Prevent double decimal in the current operand
			if (ch === ".") {
				// Find last operator position
				let i = current.length - 1;
				while (i >= 0 && !"+-*/%".includes(current[i])) i--;
				const operand = current.slice(i + 1);
				if (operand.includes(".")) return;
			}
			writeExpression(current + ch);
			// Mirror digits/decimal at document level so the canvas's drawing
			// keydown listener sees them. Operators stay keypad-local: the canvas
			// only consumes pure-numeric typed input, and `=` resolves the
			// expression via evaluateExpression above before re-emitting digits.
			if (!inputActive && (key.kind === "digit" || ch === ".")) {
				dispatchKey(document.body, ch);
			}
		},
		[activeExpression, writeExpression]
	);

	return (
		<div className="flex flex-col gap-1 p-2 border-t border-border bg-card">
			{/* Display strip */}
			<div className="bg-muted/30 rounded-md px-3 py-1.5 min-h-[44px] flex flex-col items-end justify-center">
				<div
					className="text-sm font-mono text-foreground truncate w-full text-right"
					data-testid="keypad-expression"
				>
					{activeExpression || <span className="text-muted-foreground">0</span>}
				</div>
				<div
					className="text-[10px] font-mono text-muted-foreground text-right"
					data-testid="keypad-preview"
				>
					{liveResultText || "\u00A0"}
				</div>
			</div>

			{/* Button grid: 4 columns, 5 rows. Esc sits under = in col 4. */}
			<div className="grid grid-cols-4 grid-rows-5 gap-1">
				{KEYS.map((k, idx) => {
					const baseStyle =
						"flex items-center justify-center rounded-md text-sm font-semibold h-10 select-none active:scale-95 transition-transform touch-manipulation";
					const style = k.className ?? "bg-secondary hover:bg-secondary/80 text-secondary-foreground";
					const gridStyle: React.CSSProperties = {};
					if (k.rowSpan) gridStyle.gridRow = `span ${k.rowSpan}`;
					return (
						<button
							key={idx}
							type="button"
							onMouseDown={(e) => {
								// Prevent stealing focus from the active input
								e.preventDefault();
							}}
							onClick={() => handleKey(k)}
							style={gridStyle}
							className={`${baseStyle} ${style}`}
							data-testid={`keypad-key-${k.label}`}
						>
							{k.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
