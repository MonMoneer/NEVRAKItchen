import type { TimelineData } from "@shared/schema";

// Auto-generates a full delivery schedule from just two dates — the Agreement
// (deposit / 60% advance, which unlocks production) and the Measurement date —
// using the day-offsets from NIVRA's reference schedule. Everything downstream
// flows from the Agreement date (A); the design phase flows from Measurement (M).

interface GenInput {
	project: {
		id?: number;
		name?: string | null;
		clientName?: string | null;
		clientPhone?: string | null;
		address?: string | null;
	};
	agreementDate: string; // ISO yyyy-mm-dd
	measurementDate: string; // ISO yyyy-mm-dd
	projectValue?: number; // AED
}

const money = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(iso: string): Date {
	return new Date(iso + "T00:00:00");
}
function addDays(base: Date, n: number): Date {
	const d = new Date(base);
	d.setDate(d.getDate() + n);
	return d;
}
function iso(d: Date): string {
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}
function fmtDay(d: Date): string {
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtRange(a: Date, b: Date): string {
	if (iso(a) === iso(b)) return fmtDay(a);
	// Same month → "11 – 29 May"; different months → "12 Mar – 25 Apr".
	if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
		return `${a.getDate()} – ${b.getDate()} ${MONTHS[a.getMonth()]}`;
	}
	return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

export function generateSchedule(input: GenInput): TimelineData {
	const A = parse(input.agreementDate);
	const M = parse(input.measurementDate);
	const v = input.projectValue && input.projectValue > 0 ? input.projectValue : 0;
	const p1 = v ? money(v * 0.6) : "";
	const p2 = v ? money(v * 0.3) : "";
	const p3 = v ? money(v * 0.1) : "";

	// Offset anchors (days from A unless noted).
	const designStart = addDays(M, 1);
	const designEndRaw = addDays(A, -3);
	const designEnd = designEndRaw < designStart ? designStart : designEndRaw;
	const handover = addDays(A, 112);
	const daysFromMeasure = Math.round((handover.getTime() - M.getTime()) / 86400000);

	const step = (
		title: string,
		detail: string,
		s: Date,
		e: Date,
		est = false,
	) =>
		({
			kind: "step" as const,
			title,
			detail,
			start: iso(s),
			end: iso(e),
			dateLabel: (est ? "Est. " : "") + fmtRange(s, e),
		});

	const payment = (
		eyebrow: string,
		amount: string,
		detail: string,
		s: Date,
		status: "paid" | "due" | "pending",
		whenPrefix = "",
	) =>
		({
			kind: "payment" as const,
			eyebrow,
			amount,
			detail,
			when: whenPrefix + fmtDay(s),
			status,
			pillLabel: status === "paid" ? "✓ Paid" : status === "due" ? "Due" : "Pending",
			start: iso(s),
			end: iso(s),
		});

	return {
		docRef: `Ref · NK-${A.getFullYear()}-${String(input.project.id ?? "").padStart(4, "0")}`,
		issuedDate: fmtDay(new Date()),
		eyebrow: "Project Schedule & Payment Plan",
		title: input.project.name || "Kitchen Project",
		subtitle: input.project.clientName
			? `Prepared for ${input.project.clientName}. This is the live schedule for your kitchen — design through manufacture, sea freight, and on-site installation.`
			: "Live schedule for your kitchen — design through manufacture, sea freight, and on-site installation.",
		note: "",
		theme: "orange",
		client: {
			name: input.project.clientName || "",
			tag: "Client · Residential",
			phone: input.project.clientPhone || "",
			address: input.project.address || "",
			projectValue: v ? `${money(v)} — kitchen only` : "",
			approval: "",
		},
		phases: [
			{
				num: "Phase One",
				title: "Site measurement & design",
				sub: "Site visit, 3D design, material & finish selection",
				items: [
					step("Site measurement on site", "Photos taken, site condition form signed by client.", M, M),
					step("Deep design — 3D renders & material selection", "Final layout, finishes, accessories and appliances confirmed.", designStart, designEnd),
					payment("Payment One — 60% Advance", p1, "Paid on final quotation approval. Unlocks production.", A, "paid", "~"),
				],
			},
			{
				num: "Phase Two",
				title: "Manufacturing",
				sub: "~35 day production window",
				items: [
					step("Production order placed at factory", "Technical drawings & specifications transmitted; lead time confirmed.", addDays(A, 1), addDays(A, 2)),
					step("Manufacturing in progress", "Weekly factory updates monitored with the team.", addDays(A, 2), addDays(A, 46)),
					payment("Payment Two — 30% Progress", p2, "Due during production, before shipment.", addDays(A, 51), "pending", "Due "),
					step("Factory QC, pre-shipment & crating", "Finish and dimensions reviewed; export documents prepared.", addDays(A, 54), addDays(A, 61)),
				],
			},
			{
				num: "Phase Three",
				title: "Sea freight",
				sub: "25 – 35 day transit window",
				items: [
					step("Vessel departure", "Bill of lading issued. Tracking shared with client.", addDays(A, 62), addDays(A, 62)),
					{ kind: "transit", text: "Transit window 25 – 35 days" },
					step("Vessel arrival — UAE port", "Port of discharge. Customs process begins on arrival.", addDays(A, 87), addDays(A, 97), true),
				],
			},
			{
				num: "Phase Four",
				title: "Customs clearance & delivery",
				sub: "Port → site",
				items: [
					step("UAE customs clearance & cargo release", "Duties paid, documents submitted, container released.", addDays(A, 87), addDays(A, 102), true),
					payment("Payment Three — 10% Balance", p3, "Due on delivery, prior to installation.", addDays(A, 97), "pending", "Est. "),
					step("Delivery & unboxing on site", "All items verified on site. Delivery note signed by client.", addDays(A, 97), addDays(A, 107), true),
				],
			},
			{
				num: "Phase Five",
				title: "On-site installation",
				sub: "4 – 5 working days",
				items: [
					{
						kind: "days",
						title: "Installation begins",
						detail: "Site preparation, base unit positioning, wall fixings and levelling.",
						start: iso(addDays(A, 102)),
						end: iso(addDays(A, 112)),
						dateLabel: "Est. " + fmtRange(addDays(A, 102), addDays(A, 112)),
						days: [
							"Day 1 Base units & structure",
							"Day 2 Wall units & panels",
							"Day 3 Worktops & splashbacks",
							"Day 4 Appliances & plumbing",
							"Day 5 Snagging & walkthrough",
						],
					},
				],
			},
		],
		completion: {
			title: "Kitchen fully installed & handed over",
			dateBig: `${MONTHS[handover.getMonth()]} ${handover.getFullYear()}`,
			dateSub: `~${daysFromMeasure} days from site measurement`,
		},
		summary: {
			total: v ? money(v) : "",
			payments: [
				{ label: "60% Advance", amount: p1, status: "paid", when: `~${fmtDay(A)}` },
				{ label: "30% Progress", amount: p2, status: "pending", when: `Due ${fmtDay(addDays(A, 51))}` },
				{ label: "10% Balance", amount: p3, status: "pending", when: "On delivery" },
			],
		},
		footer: "",
	};
}
