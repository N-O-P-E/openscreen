import { Circle, RectangleHorizontal, Square } from "lucide-react";
import type { WebcamMaskShape } from "@/components/video-editor/types";
import { cn } from "@/lib/utils";

type ShapeOption = {
	value: WebcamMaskShape;
	label: string;
	Icon: typeof Circle;
};

const OPTIONS: ShapeOption[] = [
	{ value: "circle", label: "Circle", Icon: Circle },
	{ value: "square", label: "Square", Icon: Square },
	{ value: "rectangle", label: "Original", Icon: RectangleHorizontal },
];

type Props = {
	value: WebcamMaskShape;
	onChange: (shape: WebcamMaskShape) => void;
};

export function ShapeSelector({ value, onChange }: Props) {
	return (
		<div
			style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
			className={cn(
				"absolute bottom-3 left-1/2 -translate-x-1/2",
				"flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 shadow-lg backdrop-blur-sm",
				"transition-opacity duration-150",
				"opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
			)}
		>
			{OPTIONS.map(({ value: optionValue, label, Icon }) => {
				const selected = optionValue === value;
				return (
					<button
						key={optionValue}
						type="button"
						aria-label={label}
						aria-pressed={selected}
						onClick={() => onChange(optionValue)}
						className={cn(
							"flex h-7 w-7 items-center justify-center rounded-full transition-colors",
							selected ? "bg-white text-black" : "text-white/80 hover:bg-white/20",
						)}
					>
						<Icon size={14} />
					</button>
				);
			})}
		</div>
	);
}
