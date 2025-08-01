export type ManipulationStyle = "highlight-positive" | "highlight-negative" | "highlight-processing" | "highlight-dne";

export type FPMessage = {
    type: "handleResponseData";
    url: string;
    data: any;
} | {
    type: "tweetInDom";
    tweetId: string;
} | {
    type: "manipulateTweet";
    tweetId: string;
    style: ManipulationStyle;
}
