import * as z from "zod";
import { FilterResult, filterResultSchema } from "./FilterServiceBase";
import { TweetSchema } from "./x/types";

export const ruleSchema = z.object({
	id: z.string(),
	criteria: z.string(),
	mode: z.enum(["block", "allow"]),
});

export const tweetStateSchema = z.object({
	tweetData: z.optional(TweetSchema),
	filterResult: z.optional(filterResultSchema),
	isExpanded: z.boolean(),
});

export type TweetState = z.infer<typeof tweetStateSchema>;

export type Rule = z.infer<typeof ruleSchema>;

// Define storage for an array of rules
export const storageRuleItems = storage.defineItem<Rule[]>("sync:ruleItems", {
	init: () => [],
});

// Define storage for debug configuration
export const storageDebugConfig = storage.defineItem<boolean>(
	"sync:debugConfig",
	{
		init: () => false,
	},
);

// Tweet id -> TweetState
export const storageXTweetState = storage.defineItem<
	Record<string, TweetState>
>("local:xTweetStates", {
	fallback: {},
});
