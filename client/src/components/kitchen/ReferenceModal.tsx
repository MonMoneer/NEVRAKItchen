import { useEffect } from "react";
import { X } from "lucide-react";

interface ReferenceModalProps {
	imageSrc: string | null;
	open: boolean;
	onClose: () => void;
}

export function ReferenceModal({ imageSrc, open, onClose }: ReferenceModalProps) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open || !imageSrc) return null;

	return (
		<div
			className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
			onClick={onClose}
			data-testid="reference-modal"
		>
			<button
				onClick={onClose}
				className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
				aria-label="Close"
				data-testid="reference-modal-close"
			>
				<X className="w-5 h-5" />
			</button>
			<img
				src={imageSrc}
				alt="Estimated design reference"
				className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			/>
		</div>
	);
}
