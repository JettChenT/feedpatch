import { ProtocolWithReturn } from "webext-bridge";

declare module "webext-bridge" {
	export interface ProtocolMap {
		xGetTweetId: ProtocolWithReturn<{ selector: string }, { tweetId?: string }>;
		handleResponseData: ProtocolWithReturn<{ url: string; data: string }, void>;
	}
}
