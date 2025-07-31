import { TimelineItem, Tweet } from "./types";
import { ModelMessage } from "ai";

export const getTweet = (item: TimelineItem) =>
  item.content.itemContent.tweet_results.result;

export const tweetToMessages = (tweet: Tweet) => {
  const screenName = tweet.core.user_results.result.legacy.screen_name;
  const tweetText = tweet.legacy.full_text;
  const result: ModelMessage[] = [];
  result.push({
    role: "user",
    content: `Tweet by ${screenName}: \n ${tweetText}`,
  });
  if (tweet.legacy.entities?.media) {
    for (const media of tweet.legacy.entities.media) {
      result.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Media ${media.type} -- ${media.ext_alt_text}`,
          },
          {
            type: "image",
            image: new URL(media.media_url_https),
          },
        ],
      });
    }
  }
  return result;
};
