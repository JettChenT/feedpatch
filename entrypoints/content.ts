import { getFilterService } from "@/libs/FilterService";

export default defineContentScript({
  matches: ["*://x.com/*"],
  // world: "MAIN",
  main() {
    console.log("Hello content workers!");
    const scraped = new Set();
    const results = [];
    const filterService = getFilterService();
    const criterias = [
      "Is brainrot (meme/clickbait)",
      "Is spam / self promotion",
    ];

    const extractTweets = () => {
      const articles = document.querySelectorAll("article");

      articles.forEach((article) => {
        const textEl = article.querySelector('div[data-testid="tweetText"]');
        const userEl = article.querySelector('div[dir="ltr"] > span');

        const statGroup = article.querySelector('div[role="group"]');
        if (!statGroup) return;

        let replies = null,
          reposts = null,
          likes = null,
          views = null;

        const statElements = statGroup.querySelectorAll("[aria-label]");
        statElements.forEach((el) => {
          const label = el.getAttribute("aria-label")?.toLowerCase() || "";
          const match = label.match(/([\d.,Kk]+)/);
          const value = match ? match[1].replace(/,/g, "") : null;

          if (label.includes("reply")) replies = value;
          else if (label.includes("repost")) reposts = value;
          else if (label.includes("like")) likes = value;
          else if (label.includes("view")) views = value;
        });

        const text = (textEl as HTMLElement)?.innerText?.trim();
        const username = (userEl as HTMLElement)?.innerText?.trim();
        if (text && username) {
          const triageTweet = async () => {
            (article as HTMLElement).style.backgroundColor = "yellow";
            const passed = await filterService.filter(text, criterias);
            if (passed) {
              (article as HTMLElement).style.backgroundColor = "green";
            } else {
              (article as HTMLElement).style.backgroundColor = "red";
            }
          };
          triageTweet();

          const id = `${username}::${text}`;
          if (!scraped.has(id)) {
            scraped.add(id);
            results.push({ username, text, replies, reposts, likes, views });
            console.log(
              `@${username} — 💬 ${replies} 🔁 ${reposts} ❤️ ${likes} 👁️ ${views}\n> ${text}`,
            );
          }
        }
      });
    };

    extractTweets();

    const observer = new MutationObserver(() => {
      extractTweets();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    console.log("Scraper is live... just keep scrolling!");
    console.log("Use `downloadTweets()` to save as json.");
  },
});
