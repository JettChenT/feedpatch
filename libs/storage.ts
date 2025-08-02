import * as z from "zod";

export const ruleSchema = z.object({
	id: z.string(),
	criteria: z.string(),
	mode: z.enum(["block", "allow"]),
});

export type Rule = z.infer<typeof ruleSchema>;

// Define storage for an array of rules
export const storageRuleItems = storage.defineItem<Rule[]>("sync:ruleItems", {
	defaultValue: [],
});
