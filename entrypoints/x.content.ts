import { getFilterService } from "@/libs/FilterService";
import { handleXResponseData } from "@/libs/x/ingest";
import { getTweet, tweetToMessages } from "@/libs/x/processing";
import { Tweet } from "@/libs/x/types";

export default defineContentScript({
  matches: ["*://x.com/*"],
  // world: "MAIN",
  async main() {
    const filterService = getFilterService();
    await injectScript("/x-mainworld.js", { keepInDom: true });
    console.log("script injected");
    console.log("Hello content workers!");
    const tweets: Map<string, Tweet> = new Map();
    const tasks: Map<string, Promise<boolean>> = new Map();
    const criterias = [
      "Is spammy / obviously fake or clickbait",
      "About films, tv, or the entertainment industry",
    ];

    const extractTweets = async () => {
      const articles = document.querySelectorAll("article");

      const promises = Array.from(articles).map(async (article) => {
        const uidDiv = article.querySelector('div[data-testid="User-Name"]');
        if (!uidDiv) return;
        const tweetIdUrl = uidDiv.querySelector('a[dir="ltr"]')?.href;
        const tweetid = tweetIdUrl?.split("/").pop();
        if (!tweetid) return;
        // console.log(tweetid);
        const item = tasks.get(tweetid);
        if (item === undefined) {
          return;
        }
        article.style.backgroundColor = "yellow";
        const res = await item;
        if (res) {
          article.style.backgroundColor = "green";
        } else {
          article.style.backgroundColor = "red";
        }
      });

      await Promise.all(promises);
    };

    extractTweets();

    const observer = new MutationObserver(() => {
      extractTweets();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("message", (event) => {
      if (!event.data.type) {
        return;
      }
      switch (event.data.type) {
        case "handleResponseData": {
          let { url, data } = event.data;
          let timelineData = handleXResponseData(url, data);
          if (timelineData) {
            console.log("timeline data", timelineData);
            timelineData.forEach((dat) => {
              const tweet = getTweet(dat);
              const id_str = tweet?.legacy?.id_str;
              console.log("tweet id", id_str);
              if (!id_str) {
                return;
              }
              if (!tasks.has(id_str)) {
                tasks.set(
                  id_str,
                  new Promise(async (resolve, reject) => {
                    console.log("running filter on", tweet);
                    const res = await filterService.filter(
                      tweetToMessages(tweet),
                      criterias,
                    );
                    console.log("resolved", res);
                    resolve(res);
                  }),
                );
              }
            });
          }
        }
      }
    });

    console.log("Scraper is live... just keep scrolling!");
    console.log("Use `downloadTweets()` to save as json.");
  },
});
