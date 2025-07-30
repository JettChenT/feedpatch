export default defineContentScript({
  matches: ["*://x.com/*"],
  world: "MAIN",
  main() {
    console.log("Hello content workers!");
    (() => {
      const scraped = new Set();
      const results = [];

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
            const keywords = ["AI", "LLM", "MCP"];
            if (keywords.some((keyword) => text.includes(keyword))) {
              (article as HTMLElement).style.backgroundColor = "red";
            }

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
    })();
  },
});
