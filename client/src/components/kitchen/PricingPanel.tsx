import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { PricingConfig, FinishingOption } from '@shared/schema';
import type { Cabinet, Wall } from '@/lib/kitchen-engine';
import {
	pixelsToCm,
	CABINET_COLORS,
	groupConnectedCabinets,
} from '@/lib/kitchen-engine';

interface PricingPanelProps {
	cabinets: Cabinet[];
	walls: Wall[];
	selectedFinishing: string;
	onFinishingChange: (finishing: string) => void;
}

const cabinetLabels: Record<string, string> = {
	base: 'Base Cabinet',
	wall_cabinet: 'Wall Cabinet',
	tall: 'Tall Cabinet',
};

export function PricingPanel({
	cabinets,
	walls,
	selectedFinishing,
	onFinishingChange,
}: PricingPanelProps) {
	const { data: pricing, isLoading: pricingLoading } = useQuery<
		PricingConfig[]
	>({
		queryKey: ['/api/pricing'],
	});

	const { data: finishingOptions, isLoading: finishingLoading } = useQuery<
		FinishingOption[]
	>({
		queryKey: ['/api/finishing-options'],
	});

	const isLoading = pricingLoading || finishingLoading;

	const activeFinishing =
		finishingOptions?.find((o) => o.id.toString() === selectedFinishing) ||
		finishingOptions?.[0];

	const multiplier = activeFinishing
		? parseFloat(activeFinishing.multiplier)
		: 1;

	const getPricePerMeter = (type: string): number => {
		const config = pricing?.find((p) => p.unitType === type);
		return config ? parseFloat(config.pricePerMeter) : 0;
	};

	const groups = groupConnectedCabinets(cabinets, walls);

	const groupItems = groups.map((group) => {
		const lengthM = pixelsToCm(group.rawLengthPx) / 100;
		const billableLengthM = pixelsToCm(group.effectiveLengthPx) / 100;
		const pricePerM = getPricePerMeter(group.type);
		const subtotal = billableLengthM * pricePerM * multiplier;
		return { ...group, lengthM, billableLengthM, pricePerM, subtotal };
	});

	const total = groupItems.reduce((sum, item) => sum + item.subtotal, 0);
	const currency = pricing?.[0]?.currency || 'AED';

	return (
		<div
			className="flex flex-col h-full bg-sidebar border-l border-sidebar-border"
			data-testid="pricing-panel"
		>
			<div className="p-3 border-b border-sidebar-border">
				<h3 className="text-sm font-semibold text-sidebar-foreground">
					Pricing
				</h3>
				<p className="text-[10px] text-muted-foreground mt-0.5">
					Live cost estimation
				</p>
			</div>

			<div className="p-3 border-b border-sidebar-border">
				<label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
					Finishing Option
				</label>
				{isLoading ? (
					<Skeleton className="h-9 w-full" />
				) : (
					<Select
						value={
							selectedFinishing ||
							finishingOptions?.[0]?.id.toString() ||
							''
						}
						onValueChange={onFinishingChange}
					>
						<SelectTrigger
							className="h-9 text-xs"
							data-testid="select-finishing"
						>
							<SelectValue placeholder="Select finishing" />
						</SelectTrigger>
						<SelectContent>
							{finishingOptions?.map((option) => (
								<SelectItem
									key={option.id}
									value={option.id.toString()}
									data-testid={`option-finishing-${option.id}`}
								>
									<div className="flex items-center justify-between gap-2 w-full">
										<span>{option.label}</span>
										<span className="text-muted-foreground text-[10px]">
											x{option.multiplier}
										</span>
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>

			<div className="flex-1 overflow-auto p-3">
				<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
					Items ({groupItems.length})
				</p>

				{groupItems.length === 0 ? (
					<div className="text-center py-8">
						<p className="text-xs text-muted-foreground">
							No cabinets placed yet
						</p>
						<p className="text-[10px] text-muted-foreground mt-1">
							Select a cabinet tool and click on the canvas to
							start
						</p>
					</div>
				) : (
					<div className="space-y-2">
						{groupItems.map((item, idx) => (
							<div
								key={item.ids.join('-')}
								className="rounded-md border border-border bg-card p-2.5"
								data-testid={`pricing-item-${idx}`}
							>
								<div className="flex items-center gap-1.5 mb-1.5">
									<div
										className="w-2.5 h-2.5 rounded-sm shrink-0"
										style={{
											backgroundColor: (
												CABINET_COLORS as Record<
													string,
													string
												>
											)[item.type],
										}}
									/>
									<span className="text-xs font-medium text-card-foreground">
										{cabinetLabels[item.type]}
									</span>
									{item.ids.length > 1 && (
										<Badge
											variant="secondary"
											className="ml-1 text-[9px] px-1 py-0"
										>
											{item.ids.length} segments
										</Badge>
									)}
									<Badge
										variant="outline"
										className="ml-auto text-[10px] px-1.5 py-0"
									>
										#{idx + 1}
									</Badge>
								</div>
								<div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
									<span className="text-muted-foreground">
										Length
									</span>
									<span className="text-right font-mono text-card-foreground">
										{item.billableLengthM.toFixed(2)} m
									</span>
									<span className="text-muted-foreground">
										Price/m
									</span>
									<span className="text-right font-mono text-card-foreground">
										{item.pricePerM.toFixed(0)} {currency}
									</span>
									<span className="text-muted-foreground">
										Multiplier
									</span>
									<span className="text-right font-mono text-card-foreground">
										x{multiplier.toFixed(1)}
									</span>
								</div>
								<Separator className="my-1.5" />
								<div className="flex justify-between text-xs">
									<span className="font-medium text-card-foreground">
										Subtotal
									</span>
									<span className="font-semibold font-mono text-primary">
										{item.subtotal.toFixed(0)} {currency}
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="p-3 border-t border-sidebar-border bg-sidebar">
				<div className="flex justify-between items-baseline">
					<span className="text-xs font-medium text-sidebar-foreground">
						Total Estimated
					</span>
					<span
						className="text-lg font-bold font-mono text-primary"
						data-testid="text-total-price"
					>
						{total.toFixed(0)} {currency}
					</span>
				</div>
				{activeFinishing && (
					<p className="text-[10px] text-muted-foreground mt-0.5">
						Finishing: {activeFinishing.label}
					</p>
				)}
			</div>
		</div>
	);
}
