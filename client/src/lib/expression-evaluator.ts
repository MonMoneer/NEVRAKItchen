// Pure arithmetic expression evaluator for the on-screen keypad.
// Supports: decimal numbers, + - * /, and % as a "/ 100" suffix operator.
// NO eval(), no parentheses, no functions, no variables.
//
// Precedence (highest → lowest):
//   1. % (suffix on a number: "10%" → 0.1)
//   2. * /
//   3. + -
//
// Returns the numeric result, or null if the expression is invalid
// (unbalanced, double operators, leading non-minus operator, division by zero, NaN).

type Token =
	| { type: 'num'; value: number }
	| { type: 'op'; value: '+' | '-' | '*' | '/' };

function tokenize(expr: string): Token[] | null {
	const tokens: Token[] = [];
	let i = 0;
	const s = expr.trim();
	if (s.length === 0) return null;

	while (i < s.length) {
		const ch = s[i];

		if (ch === ' ') {
			i++;
			continue;
		}

		// Number (including leading decimal and %-suffix)
		if (ch === '.' || (ch >= '0' && ch <= '9')) {
			let j = i;
			let seenDot = false;
			while (j < s.length) {
				const c = s[j];
				if (c >= '0' && c <= '9') {
					j++;
				} else if (c === '.' && !seenDot) {
					seenDot = true;
					j++;
				} else {
					break;
				}
			}
			const numStr = s.slice(i, j);
			if (numStr === '.' || numStr === '') return null;
			let value = parseFloat(numStr);
			if (!isFinite(value)) return null;
			i = j;
			// %-suffix: divide by 100
			if (s[i] === '%') {
				value = value / 100;
				i++;
			}
			tokens.push({ type: 'num', value });
			continue;
		}

		// Operator
		if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
			// Allow unary minus ONLY at the start or after another operator
			if (ch === '-') {
				const prev = tokens[tokens.length - 1];
				if (!prev || prev.type === 'op') {
					// Treat as unary: read following number and negate
					i++;
					// Skip whitespace
					while (i < s.length && s[i] === ' ') i++;
					if (i >= s.length || (s[i] !== '.' && (s[i] < '0' || s[i] > '9'))) {
						return null;
					}
					let j = i;
					let seenDot = false;
					while (j < s.length) {
						const c = s[j];
						if (c >= '0' && c <= '9') {
							j++;
						} else if (c === '.' && !seenDot) {
							seenDot = true;
							j++;
						} else {
							break;
						}
					}
					const numStr = s.slice(i, j);
					if (numStr === '.' || numStr === '') return null;
					let value = -parseFloat(numStr);
					if (!isFinite(value)) return null;
					i = j;
					if (s[i] === '%') {
						value = value / 100;
						i++;
					}
					tokens.push({ type: 'num', value });
					continue;
				}
			}
			// Binary operator — previous must be a number
			const prev = tokens[tokens.length - 1];
			if (!prev || prev.type === 'op') return null;
			tokens.push({ type: 'op', value: ch });
			i++;
			continue;
		}

		// Stray %
		if (ch === '%') return null;

		// Unknown char
		return null;
	}

	// Must end on a number
	const last = tokens[tokens.length - 1];
	if (!last || last.type === 'op') return null;

	return tokens;
}

function applyOps(tokens: Token[], ops: Array<'+' | '-' | '*' | '/'>): Token[] | null {
	const out: Token[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.type === 'num') {
			out.push(t);
			continue;
		}
		// t is op
		if (!ops.includes(t.value)) {
			out.push(t);
			continue;
		}
		// Apply: pop last num from out, combine with next num
		const left = out.pop();
		const right = tokens[++i];
		if (!left || left.type !== 'num' || !right || right.type !== 'num') return null;
		let result: number;
		switch (t.value) {
			case '+': result = left.value + right.value; break;
			case '-': result = left.value - right.value; break;
			case '*': result = left.value * right.value; break;
			case '/':
				if (right.value === 0) return null;
				result = left.value / right.value;
				break;
		}
		if (!isFinite(result)) return null;
		out.push({ type: 'num', value: result });
	}
	return out;
}

export function evaluateExpression(expr: string): number | null {
	const tokens = tokenize(expr);
	if (!tokens) return null;

	// Apply * / first
	const afterMulDiv = applyOps(tokens, ['*', '/']);
	if (!afterMulDiv) return null;

	// Apply + - second
	const afterAddSub = applyOps(afterMulDiv, ['+', '-']);
	if (!afterAddSub) return null;

	if (afterAddSub.length !== 1 || afterAddSub[0].type !== 'num') return null;
	return afterAddSub[0].value;
}

// Format a number for display in an input: strips trailing zeros, max 6 decimals.
export function formatResult(n: number): string {
	if (!isFinite(n)) return '';
	// Round to 6 decimals to avoid float noise, strip trailing zeros
	const rounded = Math.round(n * 1e6) / 1e6;
	return rounded.toString();
}
