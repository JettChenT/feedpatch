import type { TimelineItem, TimelineModule, Tweet } from "./types";
import type { ModelMessage } from "ai";

export const getTweet = (item: TimelineItem) => {
  if(!item.content?.itemContent?.tweet_results?.result){
    return;
  }
  switch (item.content.itemContent.tweet_results.result.__typename){
    case "Tweet": {
      return item.content.itemContent.tweet_results.result;
    }
    case "TweetWithVisibilityResults": {
      return item.content.itemContent.tweet_results.result.tweet;
    }
  }
}

export const isAd = (item: TimelineItem) => 
  item.entryId.startsWith("promoted-tweet-")


export const tweetToMessages = (tweet: Tweet, maxDepth: number = 1) => {
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
  if(tweet.quoted_status_result?.result && maxDepth > 0){
    const quoted_tweet = tweet.quoted_status_result.result;
    result.push({
      role: "user",
      content: `Quoted tweet by ${quoted_tweet.core.user_results.result.legacy.screen_name}`,
    }, ...tweetToMessages(quoted_tweet, maxDepth - 1));
  }
  return result;
};

export const getModuleTweets = (module: TimelineModule): Tweet[] => {
  console.log("getModuleTweets input:", module);
  if (!module.content.items) {
    console.log("getModuleTweets output: []");
    return [];
  }
  const tweets = module.content.items
    .filter((item) => item.entryId.startsWith("home-conversation-"))
    .map((item) => item.item?.itemContent?.tweet_results.result)
    .filter((tweet): tweet is Tweet => Boolean(tweet));
  console.log("getModuleTweets output:", tweets);
  return tweets;
};

export const getModuleId = (module: TimelineModule): string => {
  return module.entryId;
};

export const getModuleTweetIds = (module: TimelineModule): string[] => {
  const tweets = getModuleTweets(module);
  return tweets.map((tweet) => tweet.rest_id);
};

export const moduleToMessages = (module: TimelineModule): ModelMessage[] => {
  const tweets = getModuleTweets(module);
  const result: ModelMessage[] = [];
  
  // Add context about the module
  result.push({
    role: "user",
    content: `Timeline module containing ${tweets.length} related tweets:`,
  });
  
  // Add each tweet in the module
  tweets.forEach((tweet, index) => {
    const tweetMessages = tweetToMessages(tweet);
    // Add tweet index for context
    result.push({
      role: "user", 
      content: `--- Tweet ${index + 1} of ${tweets.length} ---`,
    });
    result.push(...tweetMessages);
  });
  
  return result;
};
