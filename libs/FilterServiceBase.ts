import { generateObject, type ModelMessage } from "ai";
import { getModel, CHEAP_MODEL } from "./llm";
import type { Rule } from "./storage";
import * as z from "zod";

const filterSchema = z.object({
	ruleId: z.string().describe("id of the corresponding rule"),
	reason: z.string().describe("Short explanation for the filter result"),
	blocked: z
		.boolean()
		.describe(
			"Whether the content should be blocked according corresponding criteria",
		),
});

const ruleToPrompt = (rule: Rule): string => {
	let msgText = "<criteria>\n";
	msgText += `<id>${rule.id}</id>\n`;
	msgText += `<type>${rule.mode}</type>\n`;
	msgText += `<criteria>${rule.criteria}</criteria>\n`;
	msgText += `</criteria>\n`;
	return msgText;
};

export const filterResultSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("block"),
		reason: z.string(),
	}),
	z.object({
		type: z.literal("pass"),
	}),
]);

export type FilterResult = z.infer<typeof filterResultSchema>;

export class FilterService {
	async filter(content: ModelMessage[], rules: Rule[]): Promise<FilterResult> {
		const model = getModel(CHEAP_MODEL);
		const messages: ModelMessage[] = [
			{
				role: "system",
				content: `You will determine whether the provided content fits any one of the provided criterias
          If a rule has type "Block", we want to block the content if it fits the criteria. For example, you should return {blocked:true} when criteria is "posts about cryptocurrency" and the content is a launch post on a new memecoin.
          If a rule has type "Allow", we want to block all content that does not fit the criteria. For example, you should return {blocked:true} when criteria is "posts about cryptocurrency" and the content is a post about a new movie.
          You should return a list of objects representing whether the content fits each of the criteria provided.
          `,
			},
			{
				role: "system",
				content: `<criterias>\n ${rules.map(ruleToPrompt).join("\n")} \n</criterias>`,
			},
			{
				role: "user",
				content: "<content>",
			},
			...content,
			{
				role: "user",
				content: "</content>",
			},
		];
		const result = await generateObject({
			model,
			messages,
			schema: filterSchema,
			output: "array",
		});
		console.log(result.object);

		const blockedItem = result.object.find((item) => item.blocked);
		if (blockedItem) {
			return {
				type: "block",
				reason: blockedItem.reason,
			};
		}

		return { type: "pass" };
	}
}
