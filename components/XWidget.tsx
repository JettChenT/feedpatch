import "@/assets/tailwind.css";
import type { TweetState } from "@/libs/storage";
import { Loader2, Check, X } from "lucide-react";
import { useMemo } from "react";

export default function FPXOrb({
	_tweetId,
	tweetState,
	_isDebug,
}: {
	_tweetId: string;
	tweetState: TweetState;
	_isDebug: boolean;
}) {
	const status = useMemo(() => {
		if (tweetState.filterResult === undefined) return "loading";
		if (tweetState.filterResult.type === "pass") return "pass";
		if (tweetState.filterResult.type === "block") return "block";
		return "unknown";
	}, [tweetState]);

	const tooltip = useMemo(() => {
		const fr = tweetState.filterResult;
		if (fr === undefined) return "Filtering…";
		if (fr.type === "pass") return "Allowed: no rules matched";
		if (fr.type === "block") return `Blocked: ${fr.reason}`;
		return "Unknown";
	}, [tweetState]);
	return (
		<div className="w-6 h-6 rounded-md border border-blue-600 flex items-center justify-center hover:cursor-pointer" title={tooltip}>
			{status === "loading" && (
				<Loader2 className="w-4 h-4 animate-spin text-blue-600" aria-label="Loading" />
			)}
			{status === "pass" && (
				<Check className="w-4 h-4 text-green-600" aria-label={tooltip} />
			)}
			{status === "block" && (
				<X className="w-4 h-4 text-red-600" aria-label={tooltip} />
			)}
			{status === "unknown" && (
				<Loader2 className="w-4 h-4 text-gray-400" aria-label="Unknown" />
			)}
		</div>
	);
}
