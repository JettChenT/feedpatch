import { registerFilterService } from "@/libs/FilterService";
import { onMessage } from "webext-bridge/background";

export default defineBackground(() => {
	console.log("Hello background!", { id: browser.runtime.id });
	onMessage("tstBackground", ({ data }) => {
		console.debug("background message", data);
		return { hello: "world" };
	});
	registerFilterService();
});
