import { getFiberFromHostInstance, getFiberStack } from "bippy"; // must be imported BEFORE react
import type { FPMessage } from "@/libs/messages";
import { setupNetworkInterception } from "@/libs/networkInterceptor";
import { setNamespace, onMessage } from "webext-bridge/window";

const handleResponseData = (url: string, data: unknown) => {
	console.debug("injected script response:", url, data);
	const message: FPMessage = {
		type: "handleResponseData",
		url,
		data,
	};
	window.postMessage(message);
};

const extractTweetId = (article: HTMLElement): string | undefined => {
	const fiber = getFiberFromHostInstance(article);
	if (!fiber) {
		return;
	}
	const fiberStack = getFiberStack(fiber);
	if (!fiberStack) {
		return;
	}
	const tweet = fiberStack.find((f) => f.type?.displayName === "Tweet");
	if (!tweet) {
		return;
	}
	// Access the tweet ID through the memoized props with proper type safety
	const tweetData = (
		tweet.memoizedProps as {
			tweet?: { legacy?: { id_str?: string }; id_str?: string };
		}
	)?.tweet;
	const tweetId = tweetData?.legacy?.id_str || tweetData?.id_str;
	if (!tweetId) {
		return;
	}
	return tweetId;
};

export default defineUnlistedScript(() => {
	console.log("Hello from the main world!");
	setNamespace("main");

	onMessage("xGetTweetId", async ({ data }) => {
		const article = document.querySelector(data.selector);
		if (!article) {
			console.warn("No article found for selector:", data.selector);
			return { tweetId: undefined };
		}
		const tweetId = await extractTweetId(article as HTMLElement);
		return { tweetId };
	});

	// Set up network interception
	setupNetworkInterception(handleResponseData);
});
