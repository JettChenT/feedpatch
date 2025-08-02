import {
	onCommitFiberRoot,
	traverseFiber,
	getFiberFromHostInstance,
	getFiberStack,
} from "bippy"; // must be imported BEFORE react
import type { FPMessage } from "@/libs/messages";

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
	const article = tweetToArticleMap.get(tweetId);
	if (!article) {
		console.warn("Article not found for tweet ID:", tweetId);
		return;
	}

	switch (style) {
		case "highlight-positive":
			article.style.backgroundColor = "green"; // light green
			break;
		case "highlight-negative":
			article.style.backgroundColor = "red"; // light red
			break;
		case "highlight-processing":
			article.style.backgroundColor = "yellow"; // light yellow
			break;
		case "highlight-dne":
			article.style.backgroundColor = "orange";
			break;
		default:
			console.warn("Unknown style:", style);
	}
};

export default defineUnlistedScript(() => {
	console.log("Hello from the main world!");

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
				tweetToArticleMap.forEach((article, tweetId) => {
					// Reset styling
					article.style.backgroundColor = "";
					// Notify content script about the tweet again
					const message: FPMessage = {
						type: "tweetInDom",
						tweetId,
					};
					window.postMessage(message);
				});
				break;
			}
		}
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

	// Intercept network requests
	((xhr) => {
		const XHR = XMLHttpRequest.prototype;
		const open = XHR.open;
		const send = XHR.send;

		XHR.open = function (method: string, url: string | URL) {
			(this as any)._method = method;
			(this as any)._url = url;
			return open.apply(this, arguments as any);
		};

		XHR.send = function (postData?: Document | XMLHttpRequestBodyInit | null) {
			this.addEventListener("load", function () {
				handleResponseData((this as any)._url, this.response);
			});
			return send.apply(this, arguments as any);
		};
	})(XMLHttpRequest);

	const { fetch: origFetch } = window;

	window.fetch = async (...args) => {
		const response = await origFetch(...args);
		response
			.clone()
			.blob()
			.then((data) => {
				handleResponseData(args[0].toString(), data);
			})
			.catch((err) => console.debug(err));
		return response;
	};
});
