import { getFilterService } from "@/libs/FilterService";
import { handleXResponseData } from "@/libs/x/ingest";
import { getTweet, tweetToMessages } from "@/libs/x/processing";
import { Tweet } from "@/libs/x/types";
import type { FPMessage } from "@/libs/messages";

export default defineContentScript({
  matches: ["*://x.com/*"],
  async main() {
    await injectScript("/x-mainworld.js", { keepInDom: true });
    const filterService = getFilterService();
    console.log("Content script loaded - main triaging hub active");
    
    // Storage for processing tasks
    const tasks: Map<string, Promise<boolean>> = new Map();
    
    const criterias = [
      "Is spammy / obviously fake or clickbait",
      "About films, tv, or the entertainment industry",
    ];

    const sendManipulationMessage = (tweetId: string, style: "highlight-positive" | "highlight-negative" | "highlight-processing") => {
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
        sendManipulationMessage(tweetId, "highlight-processing");
        return;
      }

      // Check if task is already completed
      try {
        const result = await Promise.race([
          task,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 0))
        ]);
        
        if (result !== null) {
          // Task is already completed
          sendManipulationMessage(tweetId, result ? "highlight-positive" : "highlight-negative");
        } else {
          // Task is still running, send processing then wait
          sendManipulationMessage(tweetId, "highlight-processing");
          const shouldFilter = await task;
          sendManipulationMessage(tweetId, shouldFilter ? "highlight-positive" : "highlight-negative");
        }
      } catch (error) {
        console.error("Error processing tweet:", tweetId, error);
        sendManipulationMessage(tweetId, "highlight-negative"); // Default to showing
      }
    };

    const spawnFilterTask = (tweet: Tweet) => {
      const tweetId = tweet.legacy?.id_str;
      if (!tweetId) {
        return;
      }

      if (!tasks.has(tweetId)) {
        const task = (async () => {
          try {
            console.log("Filtering tweet:", tweetId);
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

    // Listen for messages from main world
    window.addEventListener("message", (event) => {
      const data = event.data as FPMessage;
      if (!data?.type) {
        return;
      }

      switch (data.type) {
        case "tweetInDom": {
          console.log("Tweet discovered in DOM:", data.tweetId);
          handleTweetInDom(data.tweetId);
          break;
        }
        
        case "handleResponseData": {
          const { url, data: responseData } = data;
          const timelineData = handleXResponseData(url, responseData);
          if (timelineData) {
            console.log("Processing timeline data:", timelineData.length, "items");
            timelineData.forEach((dat) => {
              const tweet = getTweet(dat);
              if (tweet) {
                spawnFilterTask(tweet);
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
