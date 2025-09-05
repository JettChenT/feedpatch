import { getFilterService } from "@/libs/FilterService";
import type { FilterResult } from "@/libs/FilterServiceBase";
import {
	storageDebugConfig,
	storageRuleItems,
	storageXTweetState,
	type TweetState,
} from "@/libs/storage";
import { handleXResponseData, type TimelineEntry } from "@/libs/x/ingest";
import {
	getModuleTweets,
	getModuleTweetIds,
	getTweet,
	tweetToMessages,
	isAd,
    moduleToMessages,
} from "@/libs/x/processing";
import type { TimelineItem, TimelineModule } from "@/libs/x/types";
import { onMessage, sendMessage, allowWindowMessaging} from "webext-bridge/content-script";
import type { ContentScriptContext, ShadowRootContentScriptUi } from "#imports";
import ReactDOM from 'react-dom/client'
import FPXOrb from "@/components/XWidget";
import AsyncLock from 'async-lock';

// Lock for all tweetState mutations to prevent race conditions
const tweetStateLock = new AsyncLock();

const getTweetStates = async () => {
	const curStorage = new Map(Object.entries(await storageXTweetState.getValue()));
	return curStorage;
}

const setTweetStates = async (tweetStates: Map<string, TweetState>) => {
	const newValue = Object.fromEntries(tweetStates.entries());
	console.debug("setTweetStates", newValue);
	await storageXTweetState.setValue(newValue);
}

// Safe mutation functions that respect the async lock
const updateTweetState = async (tweetId: string, update: Partial<TweetState>) => {
	await tweetStateLock.acquire('tweetState', async () => {
		const curStorage = await getTweetStates();
		const curState = curStorage.get(tweetId);
		if (!curState) return;
		curStorage.set(tweetId, { ...curState, ...update });
		await setTweetStates(curStorage);
	});
}

const updateMultipleTweetStates = async (updates: Map<string, Partial<TweetState>>) => {
	await tweetStateLock.acquire('tweetState', async () => {
		const curStorage = await getTweetStates();
		let hasChanges = false;
		
		for (const [tweetId, update] of updates.entries()) {
			const curState = curStorage.get(tweetId);
			if (curState) {
				curStorage.set(tweetId, { ...curState, ...update });
				hasChanges = true;
			}
		}
		
		if (hasChanges) {
			await setTweetStates(curStorage);
		}
	});
}

const initializeTweetStates = async (initialStates: Map<string, TweetState>) => {
	await tweetStateLock.acquire('tweetState', async () => {
		const curStorage = await getTweetStates();
		let hasUpdates = false;
		
		for (const [tweetId, state] of initialStates.entries()) {
			if (!curStorage.has(tweetId)) {
				curStorage.set(tweetId, state);
				hasUpdates = true;
			}
		}
		
		if (hasUpdates) {
			console.debug("initializeTweetStates", curStorage);
			await setTweetStates(curStorage);
		}
	});
}

const setFilterResult = async (tweetId: string, filterResult: FilterResult) => {
	await updateTweetState(tweetId, { filterResult });
}

const clearFilterResult = async (tweetId: string) => {
	await updateTweetState(tweetId, { filterResult: undefined });
}

const clearMultipleFilterResults = async (tweetIds: string[]) => {
	const updates = new Map<string, Partial<TweetState>>();
	tweetIds.forEach(tweetId => {
		updates.set(tweetId, { filterResult: undefined });
	});
	await updateMultipleTweetStates(updates);
}

const setMultipleFilterResults = async (tweetIds: string[], filterResult: FilterResult) => {
	const updates = new Map<string, Partial<TweetState>>();
	tweetIds.forEach(tweetId => {
		updates.set(tweetId, { filterResult });
	});
	await updateMultipleTweetStates(updates);
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
const uiMap = new Map<string, ShadowRootContentScriptUi<ReactDOM.Root>>();
const renderLock = new AsyncLock();

// Props comparison system to prevent infinite re-renders
type TweetRenderProps = {
	tweetId: string;
	tweetState: TweetState;
	isDebug: boolean;
};

const tweetPropsMap = new Map<string, TweetRenderProps>();

const arePropsEqual = (prev: TweetRenderProps | undefined, next: TweetRenderProps): boolean => {
	if (!prev) return false;
	
	return (
		prev.tweetId === next.tweetId &&
		prev.isDebug === next.isDebug &&
		JSON.stringify(prev.tweetState) === JSON.stringify(next.tweetState)
	);
};

const cleanupTweetUI = (tweetId: string) => {
	const ui = uiMap.get(tweetId);
	if(ui)ui.remove();
	uiMap.delete(tweetId);
};

const renderTweetModInternal = async ({
	tweetId,
	tweetState,
	isDebug,
	element,
	ctx
}: {
	tweetId: string;
	tweetState: TweetState;
	isDebug: boolean;
	element: HTMLElement;
	ctx: ContentScriptContext;
}) => {
	// STEP 1: apply style
	element.setAttribute("data-fp", "true");
	element.style.backgroundColor = "";
	element.style.display = "block";
	if (tweetState.filterResult === undefined) {
		if (isDebug) element.style.backgroundColor = "rgba(255, 235, 59, 0.18)";
	} else if (tweetState.filterResult.type === "pass") {
		if (isDebug) element.style.backgroundColor = "rgba(76, 175, 80, 0.16)";
	} else if (tweetState.filterResult.type === "block") {
		if (isDebug) element.style.backgroundColor = "rgba(244, 67, 54, 0.14)";
		else element.style.display = "none";
	}

	// STEP 2: render orb ui
	const anchor = element.querySelector('button[aria-label="Grok actions"]')?.parentElement?.parentElement;
	if(!anchor){
		console.warn("no anchor found for tweet", tweetId, element);
		return;
	}
	cleanupTweetUI(tweetId);
	const ui = await createShadowRootUi(ctx, {
		name: "fp-orb",
		position: "inline",
		anchor,
		append: "first",
		onMount(uiContainer) {
			const app = document.createElement('div');
			uiContainer.append(app);
			const root = ReactDOM.createRoot(app);
			root.render(<FPXOrb _tweetId={tweetId} tweetState={tweetState} _isDebug={isDebug} />);
			return root;
		}
	})
	ui.mount();
	uiMap.set(tweetId, ui);
	console.log("renderTweetMod", tweetId);
};

const renderTweetMod = async (params: {
	tweetId: string;
	tweetState: TweetState;
	isDebug: boolean;
	element: HTMLElement;
	ctx: ContentScriptContext;
}) => {
	await renderLock.acquire(`tweet-${params.tweetId}`, async () => {
		const { tweetId, tweetState, isDebug } = params;
		
		// Create current props object
		const currentProps: TweetRenderProps = {
			tweetId,
			tweetState,
			isDebug,
		};
		
		// Check if props have changed
		const previousProps = tweetPropsMap.get(tweetId);
		const propsEqual = arePropsEqual(previousProps, currentProps);
		const isTagged = params.element.hasAttribute("data-fp");
		const shouldRender = !propsEqual || !isTagged;
		
		if (!shouldRender) {
			// console.log("Skipping render for tweet", tweetId, "- props unchanged");
			return;
		}
		
		// Store current props for next comparison
		tweetPropsMap.set(tweetId, currentProps);
		
		console.log("Rendering tweet", tweetId, {
			shouldRender,
			propsEqual,
			isTagged,
			previousProps,
			currentProps,
		});
		await renderTweetModInternal(params);
		return;
	});
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

		const getDOMTweets = async () => {
			const articles = Array.from(document.querySelectorAll("article"));

			const tweetIdPromises = articles.map(async (article) => {
				const tweetId = await getTweetIdFromArticle(article as HTMLElement);
				return { article, tweetId };
			});

			const results = await Promise.all(tweetIdPromises);
			return results;
		}

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
					await clearFilterResult(tweetId);

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
						
						await setFilterResult(tweetId, filterResult);
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
					await clearMultipleFilterResults(tweetIds);
                    
                    const tsk = async () => {
                        const filterResult = await filterService.filter(
                            moduleToMessages(module),
                            rules,
                        )
                        if(abortController.signal.aborted)return;
                        
                        await setMultipleFilterResults(tweetIds, filterResult);
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
            const initialStates = new Map<string, TweetState>();
            
            for(const entry of entries){
                const entryId = entry.entryId;
                entriesCache.set(entryId, entry);
                if(entry.content.__typename === "TimelineTimelineItem"){
                    // Handle individual tweet items
                    const tweet = getTweet(entry as TimelineItem);
                    if(tweet?.rest_id){
                        const tweetId = tweet.rest_id;
                        initialStates.set(tweetId, {
                            tweetData: tweet,
                            isExpanded: false,
                            filterResult: undefined
                        });
                    }
                } else if(entry.content.__typename === "TimelineTimelineModule"){
                    // Handle tweet modules (conversations, threads)
                    const module = entry as TimelineModule;
                    const tweetIds = getModuleTweetIds(module);
                    const tweets = getModuleTweets(module);
                    
                    tweetIds.forEach((tweetId, index) => {
                        initialStates.set(tweetId, {
                            tweetData: tweets[index],
                            isExpanded: false,
                            filterResult: undefined
                        });
                    });
                }
            }
            
            if(initialStates.size > 0){
                await initializeTweetStates(initialStates);
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
			console.log("storage: storageRuleItems changed, syncing tweets");
			const domTweets = await getDOMTweets();
			const needClearTweets: string[] = [];
            for(const entry of domTweets){
				if(!entry.tweetId) continue;
				const cached = entriesCache.get(entry.tweetId);
				if(!cached) continue;
				switch(cached.content.__typename){
					case "TimelineTimelineItem":{
						needClearTweets.push(entry.tweetId);
						break;
					}
					case "TimelineTimelineModule":{
						needClearTweets.push(...cached.content.items.map((item) => item.entryId));
						break;
					}
				}
            }
			await clearMultipleFilterResults(needClearTweets);
			console.log("storage: cleared tweets, now spawning filters");
			for(const entry of domTweets){
				if(!entry.tweetId) continue;
				const cached = entriesCache.get(entry.tweetId);
				if(!cached) continue;
				spawnFilter(cached);
			}
        })

		// MARK: Sync DOM tweets
		const syncTweets = async () => {
			const tweetStates = await getTweetStates();
			console.debug("tweetStates", tweetStates, typeof tweetStates);
			const isDebug = await storageDebugConfig.getValue();

			const domTweets = await getDOMTweets();
			const renderTweetModPromises = domTweets.map(
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
						ctx,
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
