import { getFiberFromHostInstance, getFiberStack } from "bippy"; // must be imported BEFORE react
import { signal, effect } from "@preact/signals-core";
import type { FPMessage } from "@/libs/messages";
import { setupNetworkInterception } from "@/libs/networkInterceptor";
import { sendMessage, setNamespace } from "webext-bridge/window";

const handleResponseData = (url: string, data: any) => {
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
	const tweetData = (tweet.memoizedProps as any)?.tweet;
	const tweetId = tweetData?.legacy?.id_str || tweetData?.id_str;
	if (!tweetId) {
		return;
	}
	return tweetId;
};

const seenTweets = new Set<string>();
const tweetToArticleMap = new Map<string, HTMLElement>();

// Reactive state for tweet manipulations
const tweetManipulations = signal<Map<string, string>>(new Map());
// Reactive state for debug mode
const debugMode = signal<boolean>(false);

const scanForTweets = () => {
	const articles = document.querySelectorAll("article");

	articles.forEach((article) => {
		const tweetId = extractTweetId(article);
		if (!tweetId) {
			article.style.backgroundColor = "brown";
			console.warn("no tweet id found for article", article);
			return;
		}
		if (tweetId) {
			seenTweets.add(tweetId);
			// Store direct reference to article for later manipulation
			tweetToArticleMap.set(tweetId, article as HTMLElement);

			const message: FPMessage = {
				type: "tweetInDom",
				tweetId,
			};
			window.postMessage(message);
		}
	});
};

const handleManipulateTweet = (tweetId: string, style: string) => {
	// Update the reactive state instead of directly manipulating DOM
	const currentManipulations = new Map(tweetManipulations.value);
	currentManipulations.set(tweetId, style);
	tweetManipulations.value = currentManipulations;
};

// Apply styles based on the manipulation data
const applyTweetStyle = (
	tweetId: string,
	style: string,
	isDebug: boolean = false,
) => {
	const article = tweetToArticleMap.get(tweetId);
	if (!article) {
		console.warn("Article not found for tweet ID:", tweetId);
		return;
	}

	switch (style) {
		case "highlight-positive":
			if (isDebug) {
				article.style.backgroundColor = "green"; // visible green when debugging
			}
			break;
		case "highlight-negative":
			article.style.backgroundColor = "red"; // red background
			if (!isDebug) {
				article.style.display = "none"; // hide when not debugging
			}
			// When debugging, stays visible with red background
			break;
		case "highlight-processing":
			article.style.backgroundColor = "yellow"; // light yellow
			break;
		case "highlight-dne":
			if (isDebug) {
				article.style.backgroundColor = "orange";
			}
			break;
		default:
			console.warn("Unknown style:", style);
	}
};

export default defineUnlistedScript(() => {
	console.log("Hello from the main world!");
	setNamespace("main");

	// Listen for messages from content script
	window.addEventListener("message", (event) => {
		const data = event.data as FPMessage;
		if (!data?.type) {
			return;
		}

		switch (data.type) {
			case "manipulateTweet": {
				const { tweetId, style } = data;
				handleManipulateTweet(tweetId, style);
				break;
			}
			case "requestRescan": {
				// Clear visual styling and rescan all tweets
				console.log("Rescanning tweets due to rule changes");
				// Clear all manipulations - this will trigger the effect to reset all styles
				tweetManipulations.value = new Map();
				// Notify content script about all existing tweets again
				tweetToArticleMap.forEach((article, tweetId) => {
					const message: FPMessage = {
						type: "tweetInDom",
						tweetId,
					};
					window.postMessage(message);
				});
				break;
			}
			case "debugModeChanged": {
				const { isDebug } = data;
				console.log("Debug mode changed:", isDebug);
				debugMode.value = isDebug;
				break;
			}
		}
	});

	// Set up reactive effect to apply tweet manipulations
	effect(() => {
		const manipulations = tweetManipulations.value;
		const isDebug = debugMode.value;

		// First, reset all articles to default styling
		tweetToArticleMap.forEach((article) => {
			article.style.backgroundColor = "";
			article.style.display = "block";
		});

		// Then apply current manipulations with debug context
		manipulations.forEach((style, tweetId) => {
			applyTweetStyle(tweetId, style, isDebug);
		});
	});

	// Set up DOM observation for new tweets
	const observer = new MutationObserver(() => {
		scanForTweets();
	});

	// Start observing when DOM is ready
	if (document.body) {
		observer.observe(document.body, { childList: true, subtree: true });
		scanForTweets(); // Initial scan
	} else {
		document.addEventListener("DOMContentLoaded", () => {
			observer.observe(document.body, { childList: true, subtree: true });
			scanForTweets();
		});
	}

	setTimeout(async () => {
		const res = await sendMessage(
			"tstHello",
			{ hello: "world" },
			"content-script",
		);
		console.log("tstHello", res);
	}, 1000);

	// Set up network interception
	setupNetworkInterception(handleResponseData);
});
