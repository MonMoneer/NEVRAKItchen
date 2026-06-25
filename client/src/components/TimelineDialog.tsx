import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { defaultTimelineData } from "@/lib/timeline-defaults";
import { generateSchedule } from "@/lib/timeline-formula";
import type {
	TimelineData,
	TimelineItem,
	TimelinePhase,
} from "@shared/schema";
import {
	CalendarClock,
	Copy,
	ExternalLink,
	Plus,
	Trash2,
	Loader2,
} from "lucide-react";

interface SeedProject {
	id?: number;
	name?: string | null;
	clientName?: string | null;
	clientPhone?: string | null;
	address?: string | null;
}

interface TimelineDialogProps {
	open: boolean;
	onClose: () => void;
	projectId: number;
	project: SeedProject;
	/** Optional computed quotation total (AED) used to seed the 60/30/10 plan. */
	projectValue?: number;
}

const money = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;

// ── Small field primitives ──────────────────────────────────────────────────
function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<label className="block">
			<span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</span>
			{children}
		</label>
	);
}

const STATUS_OPTIONS = ["pending", "due", "paid"] as const;

export function TimelineDialog({
	open,
	onClose,
	projectId,
	project,
	projectValue,
}: TimelineDialogProps) {
	const { toast } = useToast();
	const [data, setData] = useState<TimelineData | null>(null);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [shareToken, setShareToken] = useState<string | null>(null);
	// Create-mode inputs (shown when no timeline exists yet).
	const [agreementDate, setAgreementDate] = useState("");
	const [measurementDate, setMeasurementDate] = useState("");
	const [genValue, setGenValue] = useState("");

	// Load existing timeline whenever the dialog opens. If none exists, stay in
	// create-mode (data === null) and ask for the 2 dates.
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		setShareToken(null);
		setData(null);
		setAgreementDate("");
		setMeasurementDate("");
		setGenValue(projectValue ? String(projectValue) : "");
		fetch(`/api/projects/${projectId}/timeline`, { credentials: "include" })
			.then((r) => (r.ok ? r.json() : null))
			.then((row) => {
				if (cancelled || !row?.data) return;
				setData(row.data as TimelineData);
				setShareToken(row.shareToken);
			})
			.catch(() => {})
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [open, projectId]);

	const generate = () => {
		if (!agreementDate || !measurementDate) {
			toast({ title: "Enter both dates", variant: "destructive" });
			return;
		}
		const num = parseFloat(genValue.replace(/[^0-9.]/g, "")) || projectValue || 0;
		setData(
			generateSchedule({ project, agreementDate, measurementDate, projectValue: num }),
		);
	};

	if (!open) return null;

	// ── Immutable update helpers ──────────────────────────────────────────────
	const patch = (p: Partial<TimelineData>) =>
		setData((d) => (d ? { ...d, ...p } : d));
	const patchClient = (p: Partial<TimelineData["client"]>) =>
		setData((d) => (d ? { ...d, client: { ...d.client, ...p } } : d));
	const patchPhase = (pi: number, p: Partial<TimelinePhase>) =>
		setData((d) =>
			d
				? {
						...d,
						phases: d.phases.map((ph, i) => (i === pi ? { ...ph, ...p } : ph)),
					}
				: d,
		);
	const patchItem = (pi: number, ii: number, p: Partial<TimelineItem>) =>
		setData((d) =>
			d
				? {
						...d,
						phases: d.phases.map((ph, i) =>
							i === pi
								? {
										...ph,
										items: ph.items.map((it, j) =>
											j === ii ? ({ ...it, ...p } as TimelineItem) : it,
										),
									}
								: ph,
						),
					}
				: d,
		);
	const removeItem = (pi: number, ii: number) =>
		setData((d) =>
			d
				? {
						...d,
						phases: d.phases.map((ph, i) =>
							i === pi
								? { ...ph, items: ph.items.filter((_, j) => j !== ii) }
								: ph,
						),
					}
				: d,
		);
	const addItem = (pi: number, kind: TimelineItem["kind"]) => {
		const blank: Record<string, TimelineItem> = {
			step: { kind: "step", title: "New step", detail: "", start: "", end: "", dateLabel: "" },
			payment: { kind: "payment", eyebrow: "Payment", amount: "", detail: "", when: "", status: "pending", pillLabel: "", start: "", end: "" },
			transit: { kind: "transit", text: "Transit note" },
			days: { kind: "days", title: "Installation", detail: "", start: "", end: "", dateLabel: "", days: ["Day 1 …"] },
		};
		setData((d) =>
			d
				? {
						...d,
						phases: d.phases.map((ph, i) =>
							i === pi ? { ...ph, items: [...ph.items, blank[kind]] } : ph,
						),
					}
				: d,
		);
	};

	// Recompute the 60/30/10 plan from a single project value.
	const applyValue = (raw: string) => {
		const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
		setData((d) => {
			if (!d) return d;
			const pct = (p: number) => (num > 0 ? money(num * p) : "");
			return {
				...d,
				client: { ...d.client, projectValue: num > 0 ? `${money(num)} — kitchen only` : "" },
				summary: {
					total: num > 0 ? money(num) : "",
					payments: d.summary.payments.map((sp) => {
						const m = /(\d+)\s*%/.exec(sp.label);
						return m ? { ...sp, amount: pct(parseInt(m[1]) / 100) } : sp;
					}),
				},
				phases: d.phases.map((ph) => ({
					...ph,
					items: ph.items.map((it) => {
						if (it.kind !== "payment") return it;
						const m = /(\d+)\s*%/.exec(it.eyebrow);
						return m ? { ...it, amount: pct(parseInt(m[1]) / 100) } : it;
					}),
				})),
			};
		});
	};

	const save = async () => {
		if (!data) return;
		setSaving(true);
		try {
			const res = await apiRequest("PUT", `/api/projects/${projectId}/timeline`, data);
			const row = await res.json();
			setShareToken(row.shareToken);
			toast({ title: "Timeline saved", description: "Share link is ready below." });
		} catch (e) {
			toast({ title: "Save failed", variant: "destructive" });
		} finally {
			setSaving(false);
		}
	};

	const shareUrl = shareToken ? `${window.location.origin}/timeline/${shareToken}` : "";

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<CalendarClock className="h-5 w-5" /> Project Timeline
					</DialogTitle>
					<DialogDescription>
						Set the schedule the client sees. Statuses advance automatically by
						date — set the dates and share the link.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
					</div>
				) : !data ? (
					// ── Create mode: 2 dates → auto-generate the whole schedule ──
					<div className="flex-1 overflow-y-auto py-4">
						<div className="mx-auto max-w-md space-y-4">
							<p className="text-sm text-muted-foreground">
								Enter the two key dates — the rest of the schedule is generated
								automatically. You can fine-tune anything afterward.
							</p>
							<Field label="Agreement date (deposit / 60% advance)">
								<Input
									type="date"
									value={agreementDate}
									onChange={(e) => setAgreementDate(e.target.value)}
								/>
							</Field>
							<Field label="Measurement date">
								<Input
									type="date"
									value={measurementDate}
									onChange={(e) => setMeasurementDate(e.target.value)}
								/>
							</Field>
							<Field label="Project value (AED) — sets the 60/30/10 plan">
								<Input
									placeholder="e.g. 50507"
									value={genValue}
									onChange={(e) => setGenValue(e.target.value)}
								/>
							</Field>
							<Button className="w-full" onClick={generate}>
								<CalendarClock className="mr-2 h-4 w-4" /> Generate schedule
							</Button>
							<button
								className="block w-full text-center text-xs text-muted-foreground underline"
								onClick={() => setData(defaultTimelineData(project, projectValue))}
							>
								or start from a blank template
							</button>
						</div>
					</div>
				) : (
					<div className="flex-1 overflow-y-auto pr-1 space-y-6 text-sm">
						{/* Share link (after save) */}
						{shareUrl && (
							<div className="rounded-md border border-primary/30 bg-primary/5 p-3">
								<div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
									Client link
								</div>
								<div className="flex items-center gap-2">
									<Input readOnly value={shareUrl} className="h-8 text-xs" />
									<Button
										size="sm"
										variant="outline"
										onClick={() => {
											navigator.clipboard.writeText(shareUrl);
											toast({ title: "Link copied" });
										}}
									>
										<Copy className="h-3.5 w-3.5" />
									</Button>
									<a href={shareUrl} target="_blank" rel="noreferrer">
										<Button size="sm" variant="outline">
											<ExternalLink className="h-3.5 w-3.5" />
										</Button>
									</a>
									<a
										href={`https://wa.me/?text=${encodeURIComponent("Your NIVRA project schedule: " + shareUrl)}`}
										target="_blank"
										rel="noreferrer"
									>
										<Button size="sm" variant="outline">WhatsApp</Button>
									</a>
								</div>
							</div>
						)}

						{/* Header */}
						<section className="space-y-3">
							<h3 className="font-semibold">Header</h3>
							<div className="grid grid-cols-2 gap-3">
								<Field label="Title">
									<Input value={data.title} onChange={(e) => patch({ title: e.target.value })} />
								</Field>
								<Field label="Doc ref">
									<Input value={data.docRef} onChange={(e) => patch({ docRef: e.target.value })} />
								</Field>
							</div>
							<Field label="Subtitle">
								<Textarea rows={2} value={data.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} />
							</Field>
							<div className="grid grid-cols-2 gap-3">
								<Field label="Issued date">
									<Input value={data.issuedDate} onChange={(e) => patch({ issuedDate: e.target.value })} />
								</Field>
								<Field label="Theme">
									<select
										className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
										value={data.theme}
										onChange={(e) => patch({ theme: e.target.value as TimelineData["theme"] })}
									>
										<option value="orange">Warm (orange)</option>
										<option value="charcoal">Charcoal</option>
										<option value="blue">Blue</option>
									</select>
								</Field>
							</div>
							<Field label="Exception note (optional)">
								<Input value={data.note} onChange={(e) => patch({ note: e.target.value })} />
							</Field>
						</section>

						{/* Client + value */}
						<section className="space-y-3">
							<h3 className="font-semibold">Client</h3>
							<div className="grid grid-cols-2 gap-3">
								<Field label="Name">
									<Input value={data.client.name} onChange={(e) => patchClient({ name: e.target.value })} />
								</Field>
								<Field label="Phone">
									<Input value={data.client.phone} onChange={(e) => patchClient({ phone: e.target.value })} />
								</Field>
								<Field label="Delivery address">
									<Input value={data.client.address} onChange={(e) => patchClient({ address: e.target.value })} />
								</Field>
								<Field label="Approval">
									<Input value={data.client.approval} onChange={(e) => patchClient({ approval: e.target.value })} />
								</Field>
							</div>
							<Field label="Project value (AED) — auto-fills the 60/30/10 plan">
								<Input
									placeholder="e.g. 50507"
									defaultValue={projectValue ? String(projectValue) : ""}
									onChange={(e) => applyValue(e.target.value)}
								/>
							</Field>
						</section>

						{/* Phases */}
						<section className="space-y-4">
							<h3 className="font-semibold">Phases &amp; dates</h3>
							{data.phases.map((ph, pi) => (
								<div key={pi} className="rounded-md border p-3 space-y-3">
									<div className="grid grid-cols-[1fr_2fr] gap-3">
										<Field label="Phase">
											<Input value={ph.num} onChange={(e) => patchPhase(pi, { num: e.target.value })} />
										</Field>
										<Field label="Title">
											<Input value={ph.title} onChange={(e) => patchPhase(pi, { title: e.target.value })} />
										</Field>
									</div>
									<Field label="Sub">
										<Input value={ph.sub} onChange={(e) => patchPhase(pi, { sub: e.target.value })} />
									</Field>

									{ph.items.map((it, ii) => (
										<div key={ii} className="rounded border bg-muted/30 p-2 space-y-2">
											<div className="flex items-center justify-between">
												<span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
													{it.kind}
												</span>
												<button
													className="text-muted-foreground hover:text-destructive"
													onClick={() => removeItem(pi, ii)}
													title="Remove"
												>
													<Trash2 className="h-3.5 w-3.5" />
												</button>
											</div>

											{it.kind === "transit" ? (
												<Input value={it.text} onChange={(e) => patchItem(pi, ii, { text: e.target.value })} />
											) : it.kind === "payment" ? (
												<>
													<div className="grid grid-cols-2 gap-2">
														<Input placeholder="Eyebrow" value={it.eyebrow} onChange={(e) => patchItem(pi, ii, { eyebrow: e.target.value })} />
														<Input placeholder="Amount" value={it.amount} onChange={(e) => patchItem(pi, ii, { amount: e.target.value })} />
													</div>
													<Input placeholder="Detail" value={it.detail} onChange={(e) => patchItem(pi, ii, { detail: e.target.value })} />
													<div className="grid grid-cols-3 gap-2">
														<Input type="date" value={it.start} onChange={(e) => patchItem(pi, ii, { start: e.target.value })} />
														<Input placeholder="When label" value={it.when} onChange={(e) => patchItem(pi, ii, { when: e.target.value })} />
														<select
															className="h-9 rounded-md border border-input bg-background px-2 text-sm"
															value={it.status}
															onChange={(e) => patchItem(pi, ii, { status: e.target.value as "paid" | "due" | "pending" })}
														>
															{STATUS_OPTIONS.map((s) => (
																<option key={s} value={s}>{s}</option>
															))}
														</select>
													</div>
												</>
											) : (
												// step | days
												<>
													<Input placeholder="Title" value={it.title} onChange={(e) => patchItem(pi, ii, { title: e.target.value })} />
													<Input placeholder="Detail" value={it.detail} onChange={(e) => patchItem(pi, ii, { detail: e.target.value })} />
													<div className="grid grid-cols-3 gap-2">
														<Input type="date" value={it.start} onChange={(e) => patchItem(pi, ii, { start: e.target.value })} />
														<Input type="date" value={it.end} onChange={(e) => patchItem(pi, ii, { end: e.target.value })} />
														<Input placeholder="Date label" value={it.dateLabel} onChange={(e) => patchItem(pi, ii, { dateLabel: e.target.value })} />
													</div>
													{it.kind === "days" && (
														<Textarea
															rows={3}
															placeholder="One day per line"
															value={it.days.join("\n")}
															onChange={(e) => patchItem(pi, ii, { days: e.target.value.split("\n").filter(Boolean) })}
														/>
													)}
												</>
											)}
										</div>
									))}

									<div className="flex flex-wrap gap-1">
										{(["step", "payment", "transit", "days"] as const).map((k) => (
											<Button key={k} size="sm" variant="outline" className="h-7 text-xs" onClick={() => addItem(pi, k)}>
												<Plus className="mr-1 h-3 w-3" />{k}
											</Button>
										))}
									</div>
								</div>
							))}
						</section>

						{/* Completion */}
						<section className="space-y-3">
							<h3 className="font-semibold">Completion</h3>
							<div className="grid grid-cols-3 gap-3">
								<Field label="Title">
									<Input value={data.completion.title} onChange={(e) => patch({ completion: { ...data.completion, title: e.target.value } })} />
								</Field>
								<Field label="Date (big)">
									<Input value={data.completion.dateBig} onChange={(e) => patch({ completion: { ...data.completion, dateBig: e.target.value } })} />
								</Field>
								<Field label="Date (sub)">
									<Input value={data.completion.dateSub} onChange={(e) => patch({ completion: { ...data.completion, dateSub: e.target.value } })} />
								</Field>
							</div>
							<Field label="Footer journey line (optional)">
								<Input value={data.footer} onChange={(e) => patch({ footer: e.target.value })} />
							</Field>
						</section>
					</div>
				)}

				<DialogFooter className="border-t pt-3">
					<Button variant="outline" onClick={onClose}>Close</Button>
					<Button onClick={save} disabled={saving || loading || !data}>
						{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{shareToken ? "Save changes" : "Save & get link"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
