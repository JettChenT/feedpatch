import { getFilterService } from "@/libs/FilterService";
import type { FilterResult } from "@/libs/FilterServiceBase";
import { handleXResponseData } from "@/libs/x/ingest";
import {
	getTweet,
	isAd,
	tweetToMessages,
	getModuleId,
	getModuleTweetIds,
	getModuleTweets,
	moduleToMessages,
} from "@/libs/x/processing";
import type { TimelineItem, TimelineModule, Tweet } from "@/libs/x/types";
import type { FPMessage, ManipulationStyle } from "@/libs/messages";
import {
	storageRuleItems,
	storageDebugConfig,
	type Rule,
} from "@/libs/storage";
import {
	sendMessage,
	allowWindowMessaging,
} from "webext-bridge/content-script";

export default defineContentScript({
	matches: ["*://x.com/*"],
	async main() {
		const filterService = getFilterService();

		allowWindowMessaging("main");
		await injectScript("/x-mainworld.js", { keepInDom: true });
		console.log("Content script loaded - main triaging hub active");

		// Initialize debug state
		const initializeDebugState = async () => {
			isDebugMode = await storageDebugConfig.getValue();
		};

		// Initialize state after 50ms delay
		setTimeout(() => {
			initializeDebugState();
		}, 50);

		// Storage for processing tasks
		const tasks: Map<string, Promise<FilterResult>> = new Map();
		// Storage for tweet data (for rescanning when rules change)
		const tweetCache: Map<string, { tweet: Tweet; isAd: boolean }> = new Map();

		// DOM manipulation state
		const seenTweets = new Set<string>();
		const tweetToArticleMap = new Map<string, HTMLElement>();
		const tweetManipulations = new Map<string, ManipulationStyle>();
		let isDebugMode = false;

		// Get rules from storage
		const getRules = async (): Promise<Rule[]> => {
			return await storageRuleItems.getValue();
		};

		// Clear all cached tasks and re-process visible tweets
		const invalidateCache = () => {
			console.log("Rules changed - invalidating cached filter results");
			console.log(
				`Clearing ${tasks.size} existing tasks, keeping ${tweetCache.size} cached tweets for rescanning`,
			);
			tasks.clear();

			// Clear current manipulations and re-process all visible tweets
			tweetManipulations.clear();
			tweetToArticleMap.forEach((article, tweetId) => {
				// Reset styling
				article.style.backgroundColor = "";
				article.style.display = "block";
				// Re-process the tweet
				handleTweetInDom(tweetId);
			});
		};

		// Listen for rule changes and invalidate cache
		storageRuleItems.watch((newRules, oldRules) => {
			// Check if rules actually changed (avoid unnecessary invalidation)
			const rulesChanged =
				JSON.stringify(newRules) !== JSON.stringify(oldRules);
			if (rulesChanged) {
				invalidateCache();
			}
		});

		// Listen for debug config changes and update local state
		storageDebugConfig.watch((newDebug) => {
			isDebugMode = newDebug;
			// Re-apply all current manipulations with new debug mode
			tweetManipulations.forEach((style, tweetId) => {
				applyTweetStyle(tweetId, style);
			});
		});

		const filterResultToStyle = (result: FilterResult): ManipulationStyle => {
			return result.type === "block"
				? "highlight-negative"
				: "highlight-positive";
		};

		// DOM manipulation functions
		const getTweetIdFromArticle = async (
			article: HTMLElement,
		): Promise<string | undefined> => {
			try {
				const ariaLabelledBy = article.getAttribute("aria-labelledby");
				if (!ariaLabelledBy) {
					console.warn("No aria-labelledby found on article:", article);
					return undefined;
				}

				const result = await sendMessage(
					"xGetTweetId",
					{
						selector: `[aria-labelledby="${ariaLabelledBy}"]`,
					},
					"window",
				);
				return result.tweetId;
			} catch (error) {
				console.warn("Failed to get tweet ID from article:", error);
				return undefined;
			}
		};

		const applyTweetStyle = (tweetId: string, style: ManipulationStyle) => {
			const article = tweetToArticleMap.get(tweetId);
			if (!article) {
				console.warn("Article not found for tweet ID:", tweetId);
				return;
			}

			// Reset styles first
			article.style.backgroundColor = "";
			article.style.display = "block";

			switch (style) {
				case "highlight-positive":
					if (isDebugMode) {
						article.style.backgroundColor = "green"; // visible green when debugging
					}
					break;
				case "highlight-negative":
					article.style.backgroundColor = "red"; // red background
					if (!isDebugMode) {
						article.style.display = "none"; // hide when not debugging
					}
					break;
				case "highlight-processing":
					article.style.backgroundColor = "yellow"; // light yellow
					break;
				case "highlight-dne":
					if (isDebugMode) {
						article.style.backgroundColor = "orange";
					}
					break;
				default:
					console.warn("Unknown style:", style);
			}
		};

		const scanForTweets = async () => {
			console.log("scanning for tweets");
			const articles = Array.from(document.querySelectorAll("article"));

			const tweetIdPromises = articles.map(async (article) => {
				const tweetId = await getTweetIdFromArticle(article as HTMLElement);
				return { article, tweetId };
			});

			const results = await Promise.all(tweetIdPromises);

			for (const { article, tweetId } of results) {
				if (!tweetId) {
					if (isDebugMode) {
						(article as HTMLElement).style.backgroundColor = "brown";
					}
					console.warn("no tweet id found for article", article);
					continue;
				}

				seenTweets.add(tweetId);
				// Store direct reference to article for later manipulation
				tweetToArticleMap.set(tweetId, article as HTMLElement);
				// Process the tweet
				handleTweetInDom(tweetId);
			}
		};

		const manipulateTweet = (tweetId: string, style: ManipulationStyle) => {
			tweetManipulations.set(tweetId, style);
			applyTweetStyle(tweetId, style);
		};

		const handleTweetInDom = async (tweetId: string) => {
			let task = tasks.get(tweetId);

			if (!task) {
				// No task exists yet - check if we have cached tweet data to recreate it
				const cachedData = tweetCache.get(tweetId);
				if (cachedData) {
					console.log("Recreating task for rescanned tweet:", tweetId);
					spawnFilterTask(cachedData.tweet, { isAd: cachedData.isAd });
					task = tasks.get(tweetId);
				}

				if (!task) {
					// Still no task - tweet data not available
					console.log("No task exist for", tweetId);
					manipulateTweet(tweetId, "highlight-dne");
					return;
				}
			}

			// Check if task is already completed
			try {
				const result = await Promise.race([
					task,
					new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
				]);

				if (result !== null) {
					// Task is already completed
					manipulateTweet(tweetId, filterResultToStyle(result));
				} else {
					// Task is still running, send processing then wait
					manipulateTweet(tweetId, "highlight-processing");
					const filterResult = await task;
					manipulateTweet(tweetId, filterResultToStyle(filterResult));
				}
			} catch (error) {
				console.error("Error processing tweet:", tweetId, error);
				manipulateTweet(tweetId, "highlight-negative"); // Default to showing
			}
		};

		const spawnFilterTask = (
			tweet: Tweet,
			options: {
				isAd?: boolean;
			},
		) => {
			const tweetId = tweet.legacy?.id_str;
			if (!tweetId) {
				console.warn("No tweet id found for", tweet);
				return;
			}

			// Cache tweet data for potential rescanning
			tweetCache.set(tweetId, { tweet, isAd: options.isAd || false });

			if (!tasks.has(tweetId)) {
				const task = (async (): Promise<FilterResult> => {
					try {
						console.log("Filtering tweet:", tweetId, tweet);
						if (options.isAd) {
							console.log("Skipping ad tweet:", tweetId, tweet);
							return { type: "block", reason: "Statically detected Ad" };
						}
						const rules = await getRules();
						const filterResult = await filterService.filter(
							tweetToMessages(tweet),
							rules,
						);
						console.log("Filter result for", tweetId, ":", filterResult);
						return filterResult;
					} catch (error) {
						console.error("Error filtering tweet:", tweetId, error);
						return { type: "pass" };
					}
				})();

				tasks.set(tweetId, task);
			}
		};

		const spawnModuleFilterTask = (module: TimelineModule) => {
			const moduleId = getModuleId(module);
			const tweetIds = getModuleTweetIds(module);
			const moduleTweets = getModuleTweets(module);

			if (tweetIds.length === 0) {
				return;
			}

			// Cache individual tweets from the module for potential rescanning
			moduleTweets.forEach((tweet) => {
				const tweetId = tweet.legacy?.id_str;
				if (tweetId) {
					tweetCache.set(tweetId, { tweet, isAd: false }); // Modules typically don't contain ads
				}
			});

			// Check if any tweet in the module already has a task
			const hasExistingTask = tweetIds.some((id) => tasks.has(id));
			if (hasExistingTask) {
				return;
			}

			const task = (async (): Promise<FilterResult> => {
				try {
					console.log(
						"Filtering module:",
						moduleId,
						"with",
						tweetIds.length,
						"tweets",
					);
					const rules = await getRules();
					const filterResult = await filterService.filter(
						moduleToMessages(module),
						rules,
					);
					console.log("Filter result for module", moduleId, ":", filterResult);
					return filterResult;
				} catch (error) {
					console.error("Error filtering module:", moduleId, error);
					return { type: "pass" };
				}
			})();

			// Map all tweet IDs in the module to the same task
			tweetIds.forEach((tweetId) => {
				tasks.set(tweetId, task);
			});
		};

		// Set up DOM observation for new tweets
		const observer = new MutationObserver(() => {
			scanForTweets();
		});

		// Start observing when DOM is ready
		const startObservation = () => {
			if (document.body) {
				observer.observe(document.body, { childList: true, subtree: true });
				scanForTweets(); // Initial scan
			} else {
				document.addEventListener("DOMContentLoaded", () => {
					observer.observe(document.body, { childList: true, subtree: true });
					scanForTweets();
				});
			}
		};

		// Initialize DOM observation after a short delay to ensure page is ready
		setTimeout(startObservation, 100);

		// Listen for messages from main world
		window.addEventListener("message", (event) => {
			const data = event.data as FPMessage;
			if (!data?.type) {
				return;
			}

			switch (data.type) {
				case "handleResponseData": {
					const { url, data: responseData } = data;
					const timelineData = handleXResponseData(url, responseData);
					if (timelineData) {
						console.log("Processing timeline data:", timelineData);
						timelineData.forEach((dat) => {
							switch (dat.content.__typename) {
								case "TimelineTimelineItem": {
									const tweet = getTweet(dat as TimelineItem);
									if (tweet) {
										spawnFilterTask(tweet, {
											isAd: isAd(dat as TimelineItem),
										});
									} else {
										console.warn("No tweet found in", dat);
									}
									break;
								}
								case "TimelineTimelineModule": {
									const module = dat as TimelineModule;
									spawnModuleFilterTask(module);
									break;
								}
							}
						});
					}
					break;
				}
			}
		});

		console.log("Tweet triaging system ready!");
	},
});
