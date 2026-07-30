import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AdminSettings } from '@shared/schema';

// Fallback for when admin settings haven't been saved yet (fresh install).
export const DEFAULT_EXPORT_NOTES = `All prices provided are estimated and may vary by
approximately 10–20% based on final measurements
and material selection. Appliances and accessories
are not included.`;

interface ExportNotesDialogProps {
	open: boolean;
	onCancel: () => void;
	onConfirm: (notes: string) => void;
}

export function ExportNotesDialog({
	open,
	onCancel,
	onConfirm,
}: ExportNotesDialogProps) {
	const { data: settings } = useQuery<AdminSettings>({
		queryKey: ['/api/admin/settings'],
	});
	const defaultNotes = settings?.defaultExportNotes || DEFAULT_EXPORT_NOTES;
	const [notes, setNotes] = useState(defaultNotes);

	useEffect(() => {
		if (open) setNotes(defaultNotes);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Export PDF</DialogTitle>
					<DialogDescription>
						Review the notes shown on each items page. You can edit this text
						before exporting.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2 py-2">
					<label className="text-sm font-medium">Notes</label>
					<Textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						rows={6}
						className="resize-none"
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={() => onConfirm(notes)}>Export</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
