import type { TimelineData } from "@shared/schema";

interface SeedProject {
	id?: number;
	name?: string | null;
	clientName?: string | null;
	clientPhone?: string | null;
	address?: string | null;
}

const money = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;

/**
 * Seeds a fresh timeline with NIVRA's standard kitchen journey (design →
 * manufacture → sea freight → customs/delivery → installation). Client info is
 * pre-filled from the project; dates start empty for the user to set. If a
 * project value is known, the 60/30/10 payment plan is pre-computed.
 */
export function defaultTimelineData(
	project: SeedProject,
	projectValue?: number,
): TimelineData {
	const v = projectValue && projectValue > 0 ? projectValue : 0;
	const p1 = v ? money(v * 0.6) : "";
	const p2 = v ? money(v * 0.3) : "";
	const p3 = v ? money(v * 0.1) : "";
	const year = new Date().getFullYear();

	return {
		docRef: `Ref · NK-${year}-${String(project.id ?? "").padStart(4, "0")}`,
		issuedDate: new Date().toLocaleDateString("en-GB", {
			day: "numeric",
			month: "short",
			year: "numeric",
		}),
		eyebrow: "Project Schedule & Payment Plan",
		title: project.name ? `${project.name}` : "Kitchen Project",
		subtitle: project.clientName
			? `Prepared for ${project.clientName}. This is the live schedule for your kitchen — design through manufacture, sea freight, and on-site installation.`
			: "Live schedule for your kitchen — design through manufacture, sea freight, and on-site installation.",
		note: "",
		theme: "orange",
		client: {
			name: project.clientName || "",
			tag: "Client · Residential",
			phone: project.clientPhone || "",
			address: project.address || "",
			projectValue: v ? `${money(v)} — kitchen only` : "",
			approval: "",
		},
		phases: [
			{
				num: "Phase One",
				title: "Site measurement & design",
				sub: "Site visit, 3D design, material & finish selection",
				items: [
					{ kind: "step", title: "Site measurement on site", detail: "Photos taken, site condition form signed by client.", start: "", end: "", dateLabel: "" },
					{ kind: "step", title: "Deep design — 3D renders & material selection", detail: "Final layout, finishes, accessories and appliances confirmed.", start: "", end: "", dateLabel: "" },
					{ kind: "payment", eyebrow: "Payment One — 60% Advance", amount: p1, detail: "Paid on final quotation approval. Unlocks production.", when: "", status: "pending", pillLabel: "", start: "", end: "" },
				],
			},
			{
				num: "Phase Two",
				title: "Manufacturing",
				sub: "~35 day production window",
				items: [
					{ kind: "step", title: "Production order placed at factory", detail: "Technical drawings & specifications transmitted; lead time confirmed.", start: "", end: "", dateLabel: "" },
					{ kind: "step", title: "Manufacturing in progress", detail: "Weekly factory updates monitored with the team.", start: "", end: "", dateLabel: "" },
					{ kind: "payment", eyebrow: "Payment Two — 30% Progress", amount: p2, detail: "Due during production, before shipment.", when: "", status: "pending", pillLabel: "", start: "", end: "" },
					{ kind: "step", title: "Factory QC, pre-shipment & crating", detail: "Finish and dimensions reviewed; export documents prepared.", start: "", end: "", dateLabel: "" },
				],
			},
			{
				num: "Phase Three",
				title: "Sea freight",
				sub: "25 – 35 day transit window",
				items: [
					{ kind: "step", title: "Vessel departure", detail: "Bill of lading issued. Tracking shared with client.", start: "", end: "", dateLabel: "" },
					{ kind: "transit", text: "Transit window 25 – 35 days" },
					{ kind: "step", title: "Vessel arrival — UAE port", detail: "Port of discharge. Customs process begins on arrival.", start: "", end: "", dateLabel: "" },
				],
			},
			{
				num: "Phase Four",
				title: "Customs clearance & delivery",
				sub: "Port → site",
				items: [
					{ kind: "step", title: "UAE customs clearance & cargo release", detail: "Duties paid, documents submitted, container released.", start: "", end: "", dateLabel: "" },
					{ kind: "payment", eyebrow: "Payment Three — 10% Balance", amount: p3, detail: "Due on delivery, prior to installation.", when: "", status: "pending", pillLabel: "", start: "", end: "" },
					{ kind: "step", title: "Delivery & unboxing on site", detail: "All items verified on site. Delivery note signed by client.", start: "", end: "", dateLabel: "" },
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
						start: "",
						end: "",
						dateLabel: "",
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
			dateBig: "",
			dateSub: "",
		},
		summary: {
			total: v ? money(v) : "",
			payments: [
				{ label: "60% Advance", amount: p1, status: "pending", when: "" },
				{ label: "30% Progress", amount: p2, status: "pending", when: "" },
				{ label: "10% Balance", amount: p3, status: "pending", when: "" },
			],
		},
		footer: "",
	};
}
