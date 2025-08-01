import { getFilterService } from "@/libs/FilterService";
import { handleXResponseData } from "@/libs/x/ingest";
import { getTweet, isAd, tweetToMessages, getModuleId, getModuleTweetIds, moduleToMessages } from "@/libs/x/processing";
import type { TimelineItem, TimelineModule, Tweet } from "@/libs/x/types";
import type { FPMessage, ManipulationStyle } from "@/libs/messages";

export default defineContentScript({
	matches: ["*://x.com/*"],
	async main() {
		const filterService = getFilterService();
		await injectScript("/x-mainworld.js", { keepInDom: true });
		console.log("Content script loaded - main triaging hub active");

		// Storage for processing tasks
		const tasks: Map<string, Promise<boolean>> = new Map();

		const criterias = [
			"Is spammy / obviously fake or clickbait",
			"About films, tv, or the entertainment industry",
		];

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
			const task = tasks.get(tweetId);

			if (!task) {
				// No task exists yet, send processing and wait
				console.log("No task exist for", tweetId);
				sendManipulationMessage(tweetId, "highlight-dne");
				return;
			}

			// Check if task is already completed
			try {
				const result = await Promise.race([
					task,
					new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
				]);

				if (result !== null) {
					// Task is already completed
					sendManipulationMessage(
						tweetId,
						result ? "highlight-positive" : "highlight-negative",
					);
				} else {
					// Task is still running, send processing then wait
					sendManipulationMessage(tweetId, "highlight-processing");
					const shouldFilter = await task;
					sendManipulationMessage(
						tweetId,
						shouldFilter ? "highlight-positive" : "highlight-negative",
					);
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

			if (!tasks.has(tweetId)) {
				const task = (async () => {
					try {
						console.log("Filtering tweet:", tweetId, tweet);
						if (options.isAd) {
							console.log("Skipping ad tweet:", tweetId, tweet);
							return false;
						}
						const shouldFilter = await filterService.filter(
							tweetToMessages(tweet),
							criterias,
						);
						console.log("Filter result for", tweetId, ":", shouldFilter);
						return shouldFilter;
					} catch (error) {
						console.error("Error filtering tweet:", tweetId, error);
						return false;
					}
				})();

				tasks.set(tweetId, task);
			}
		};

		const spawnModuleFilterTask = (module: TimelineModule) => {
			const moduleId = getModuleId(module);
			const tweetIds = getModuleTweetIds(module);
			
			if (tweetIds.length === 0) {
				return;
			}

			// Check if any tweet in the module already has a task
			const hasExistingTask = tweetIds.some(id => tasks.has(id));
			if (hasExistingTask) {
				return;
			}

			const task = (async () => {
				try {
					console.log("Filtering module:", moduleId, "with", tweetIds.length, "tweets");
					const shouldFilter = await filterService.filter(
						moduleToMessages(module),
						criterias,
					);
					console.log("Filter result for module", moduleId, ":", shouldFilter);
					return shouldFilter;
				} catch (error) {
					console.error("Error filtering module:", moduleId, error);
					return false;
				}
			})();

			// Map all tweet IDs in the module to the same task
			tweetIds.forEach(tweetId => {
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
