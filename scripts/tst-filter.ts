import { FilterService } from "../libs/FilterServiceBase";
import type { Rule } from "@/libs/storage";
import type { ModelMessage } from "ai";

const sampleContent: ModelMessage[] = [
	{
		role: "user",
		content: "oh my god! this thing just happened!",
	},
];

const rules: Rule[] = [
	{
		id: "test-rule-1",
		criteria: "not sensational / engagement bait",
		mode: "block",
	},
];

const filterService = new FilterService();
const res = await filterService.filter(sampleContent, rules);

console.log("Filter result:", res);
console.log("Should block content:", res.type === "block");
if (res.type === "block") {
	console.log("Reason:", res.reason);
}
