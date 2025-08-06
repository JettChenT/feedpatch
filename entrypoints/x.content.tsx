import { getFilterService } from "@/libs/FilterService";
import { FilterResult } from "@/libs/FilterServiceBase";
import {
	storageDebugConfig,
	storageRuleItems,
	storageXTweetState,
	TweetState,
} from "@/libs/storage";
import { handleXResponseData, TimelineEntry } from "@/libs/x/ingest";
import {
	getModuleTweets,
	getModuleTweetIds,
	getModuleId,
	getTweet,
	tweetToMessages,
	isAd,
    moduleToMessages,
} from "@/libs/x/processing";
import { TimelineItem, TimelineModule } from "@/libs/x/types";
import { onMessage, sendMessage, allowWindowMessaging } from "webext-bridge/content-script";

const getTweetStates = async () => {
	const curStorage = new Map(Object.entries(await storageXTweetState.getValue()));
	return curStorage;
}

const setTweetStates = async (tweetStates: Map<string, TweetState>) => {
	const newValue = Object.fromEntries(tweetStates.entries());
	console.log("setTweetStates", newValue);
	await storageXTweetState.setValue(newValue);
}

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

// DOM tweet processing
const renderTweetMod = async ({
	tweetId,
	tweetState,
	isDebug,
	element,
}: {
	tweetId: string;
	tweetState: TweetState;
	isDebug: boolean;
	element: HTMLElement;
}) => {
	// STEP 1: apply style
	element.style.backgroundColor = "";
	element.style.display = "block";
	if (tweetState.filterResult === undefined) {
		if (isDebug) element.style.backgroundColor = "yellow";
	} else if (tweetState.filterResult.type === "pass") {
		if (isDebug) element.style.backgroundColor = "green";
	} else if (tweetState.filterResult.type === "block") {
		if (isDebug) element.style.backgroundColor = "red";
		else element.style.display = "none";
	}

	// STEP 2: render orb ui
	// TODO
};

type Task = {
	promise: Promise<void>;
    abortController: AbortController;
};

const isFinished = (task: Task) => task.abortController.signal.aborted;


export default defineContentScript({
	matches: ["*://x.com/*"],
	cssInjectionMode: "ui",
	async main(ctx) {
		// MARK: initialization
		const filterService = getFilterService();
		allowWindowMessaging("main");
		await injectScript("/x-mainworld.js", { keepInDom: true });

		// MARK: Handle API Tweets
		const taskMap = new Map<string, Task>();
        const entriesCache = new Map<string, TimelineEntry>();
		const spawnFilter = async (entry: TimelineEntry) => {
			const rules = await storageRuleItems.getValue();
			switch (entry.content.__typename) {
				case "TimelineTimelineItem": {
					const tweet = getTweet(entry as TimelineItem);
					const tweetId = tweet?.rest_id;
					if (!tweetId) return;
					const abortController = new AbortController();
					const curTask = taskMap.get(tweetId);
					if (curTask && !isFinished(curTask)) curTask.abortController.abort();

					const tsk = async () => {
						const filterResult: FilterResult = isAd(entry as TimelineItem)
							? { type: "block", reason: "automatically detected ad" }
							: await filterService.filter(
									tweetToMessages(tweet),
									rules,
								);
						if (abortController.signal.aborted) {
							console.log("Early return: abortController.signal.aborted is true");
							return;
						}
						const curValue = await getTweetStates();
						const curTweetState = curValue.get(tweetId);
						if (!curTweetState) {
							console.log("Early return: no curTweetState for tweetId", tweetId);
							return;
						}
						curValue.set(tweetId, {
							...curTweetState,
							filterResult,
						});
						await setTweetStates(curValue);
                        abortController.abort();
					};
					const promise = tsk();
					taskMap.set(tweetId, {
						promise,
                        abortController
					});
					break;
				}
				case "TimelineTimelineModule": {
					const module = entry as TimelineModule;
					const tweetIds = getModuleTweetIds(module);

					if (tweetIds.length === 0) {
						return;
					}
                    tweetIds.forEach((tweetId) => {
                        const foo = taskMap.get(tweetId);
                        if(foo && !isFinished(foo))foo.abortController.abort();
                    })

                    const abortController = new AbortController();
                    const tsk = async () => {
                        const filterResult = await filterService.filter(
                            moduleToMessages(module),
                            rules,
                        )
                        const curValue = await getTweetStates();
                        if(abortController.signal.aborted)return;
                        for(const tweetId of tweetIds){
                            const gotValue = curValue.get(tweetId);
                            if(!gotValue)continue;
                            curValue.set(tweetId, {
                                ...gotValue,
                                filterResult,
                            })
                        }
                        await setTweetStates(curValue);
                        abortController.abort();
                    }
                    const promise = tsk();
                    const task: Task = {
                        promise,
                        abortController
                    }
                    tweetIds.forEach((tweetId) => {
                        taskMap.set(tweetId, task);
                    })
                    break;
				}
			}
		};

        const initTweetsData = async(entries: TimelineEntry[]) => {
            const curStorage = await getTweetStates();
			console.log("initTweetsData", curStorage);
            let hasUpdates = false;
            
            for(const entry of entries){
                const entryId = entry.entryId;
                entriesCache.set(entryId, entry);
                if(entry.content.__typename === "TimelineTimelineItem"){
                    // Handle individual tweet items
                    const tweet = getTweet(entry as TimelineItem);
                    if(tweet?.rest_id){
                        const tweetId = tweet.rest_id;
                        if(!curStorage.has(tweetId)){
                            curStorage.set(tweetId, {
                                tweetData: tweet,
                                isExpanded: false,
                                filterResult: undefined
                            });
                            hasUpdates = true;
                        }
                    }
                } else if(entry.content.__typename === "TimelineTimelineModule"){
                    // Handle tweet modules (conversations, threads)
                    const module = entry as TimelineModule;
                    const tweetIds = getModuleTweetIds(module);
                    const tweets = getModuleTweets(module);
                    
                    tweetIds.forEach((tweetId, index) => {
                        if(!curStorage.has(tweetId)){
                            curStorage.set(tweetId, {
                                tweetData: tweets[index],
                                isExpanded: false,
                                filterResult: undefined
                            });
                            hasUpdates = true;
                        }
                    });
                }
            }
            
            if(hasUpdates){
				console.log("hasUpdates", curStorage);
				console.log("before", await storageXTweetState.getValue());
                await setTweetStates(curStorage);
				console.log("after", await storageXTweetState.getValue());
            }
        }

		onMessage("handleResponseData", async ({ data }) => {
			const { url, data: responseData } = data;
			const timelineData = handleXResponseData(url, responseData);
			if (!timelineData) return;
            await initTweetsData(timelineData);
			timelineData.forEach(spawnFilter);
		});

        storageRuleItems.watch(async () => {
            for(const entry of entriesCache.values()){
                spawnFilter(entry)
            }
        })

		// MARK: Sync DOM tweets
		const syncTweets = async () => {
			const articles = Array.from(document.querySelectorAll("article"));

			const tweetIdPromises = articles.map(async (article) => {
				const tweetId = await getTweetIdFromArticle(article as HTMLElement);
				return { article, tweetId };
			});

			const results = await Promise.all(tweetIdPromises);
			const tweetStates = await getTweetStates();
			console.log("tweetStates", tweetStates, typeof tweetStates);
			const isDebug = await storageDebugConfig.getValue();

			const renderTweetModPromises = results.map(
				async ({ article, tweetId }) => {
					if (!tweetId) {
						console.warn("no tweet id found for article", article);
						return;
					}
					const tweetState = tweetStates.get(tweetId);
					if (!tweetState) {
						console.warn("no tweet state found for tweet id", tweetId);
						return;
					}
					return renderTweetMod({
						tweetId,
						tweetState,
						isDebug,
						element: article,
					});
				},
			);
			await Promise.all(renderTweetModPromises);
		};

		const observer = new MutationObserver(() => {
			syncTweets();
		});
		observer.observe(document.body, { childList: true, subtree: true });
		syncTweets();
		storageDebugConfig.watch(syncTweets);
		storageXTweetState.watch(syncTweets);
	},
});
