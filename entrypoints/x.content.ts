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
import { storageRuleItems, type Rule } from "@/libs/storage";

export default defineContentScript({
	matches: ["*://x.com/*"],
	async main() {
		const filterService = getFilterService();
		await injectScript("/x-mainworld.js", { keepInDom: true });
		console.log("Content script loaded - main triaging hub active");

		// Storage for processing tasks
		const tasks: Map<string, Promise<FilterResult>> = new Map();
		// Storage for tweet data (for rescanning when rules change)
		const tweetCache: Map<string, { tweet: Tweet; isAd: boolean }> = new Map();

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

			// Re-process all currently visible tweets
			const message: FPMessage = {
				type: "requestRescan",
			};
			window.postMessage(message);
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

		const filterResultToStyle = (result: FilterResult): ManipulationStyle => {
			return result.type === "block"
				? "highlight-negative"
				: "highlight-positive";
		};

		const sendManipulationMessage = (
			tweetId: string,
			style: ManipulationStyle,
		) => {
			const message: FPMessage = {
				type: "manipulateTweet",
				tweetId,
				style,
			};
			window.postMessage(message);
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
					sendManipulationMessage(tweetId, "highlight-dne");
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
					sendManipulationMessage(tweetId, filterResultToStyle(result));
				} else {
					// Task is still running, send processing then wait
					sendManipulationMessage(tweetId, "highlight-processing");
					const filterResult = await task;
					sendManipulationMessage(tweetId, filterResultToStyle(filterResult));
				}
			} catch (error) {
				console.error("Error processing tweet:", tweetId, error);
				sendManipulationMessage(tweetId, "highlight-negative"); // Default to showing
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

		// Listen for messages from main world
		window.addEventListener("message", (event) => {
			const data = event.data as FPMessage;
			if (!data?.type) {
				return;
			}

			switch (data.type) {
				case "tweetInDom": {
					console.debug("Tweet discovered in DOM:", data.tweetId);
					handleTweetInDom(data.tweetId);
					break;
				}

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
