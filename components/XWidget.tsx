import "@/assets/tailwind.css";
import { type TweetState } from "@/libs/storage";

export default function FPXOrb({
	tweetId,
	tweetState,
	isDebug,
}: {
	tweetId: string;
	tweetState: TweetState;
	isDebug: boolean;
}) {
	const msg = useMemo(() =>{
		if(tweetState.filterResult === undefined)return "PND";
		if(tweetState.filterResult.type === "pass")return "PASS";
		if(tweetState.filterResult.type === "block")return "BLOCK";
		return "UNKNOWN";
	},[tweetState])
	return (
		<div className="w-6 h-6 rounded-md border-2 border-blue-600 flex items-center justify-center hover:cursor-pointer">
			FP:{msg}
		</div>
	);
}
