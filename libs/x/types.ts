/**
 * This file contains the simplified types for X's (Twitter's) Home Timeline API.
 *
 * These types are created for exploratory purposes, to see the current implementation
 * of the X's API, to see how they fetch Home Feed, how they do a pagination and sorting,
 * and how they pass the hierarchical entities (posts, media, user info, etc).
 *
 * Many properties and types are omitted for simplicity.
 */

/* eslint-disable max-len */
// Source: https://github.com/trekhleb/trekhleb.github.io/blob/master/src/posts/2024/api-design-x-home-timeline/types/x.ts

import { z } from "zod";

// Basic utility schemas
export const ActionKeySchema = z.string();
export type ActionKey = z.infer<typeof ActionKeySchema>;

// POST https://x.com/i/api/graphql/{query-id}/HomeTimeline
export const TimelineRequestSchema = z.object({
	queryId: z.string(), // 's6ERr1UxkxxBx4YundNsXw'
	variables: z.object({
		count: z.number(), // 20
		cursor: z.string().optional(), // 'DAAACgGBGedb3Vx__9sKAAIZ5g4QENc99AcAAwAAIAIAAA'
		seenTweetIds: z.array(z.string()), // ['1867041249938530657', '1867041249938530658']
	}),
	features: z.lazy(() => FeaturesSchema), // Forward reference
});
export type TimelineRequest = z.infer<typeof TimelineRequestSchema>;

// POST https://x.com/i/api/graphql/{query-id}/HomeTimeline
export const TimelineResponseSchema = z.object({
	data: z.object({
		home: z.object({
			home_timeline_urt: z.object({
				instructions: z.array(
					z.union([
						z.lazy(() => TimelineAddEntriesSchema),
						z.lazy(() => TimelineTerminateTimelineSchema),
					]),
				),
				responseObjects: z.object({
					feedbackActions: z.array(z.lazy(() => TimelineActionSchema)),
				}),
			}),
		}),
	}),
});
export type TimelineResponse = z.infer<typeof TimelineResponseSchema>;

// POST https://x.com/i/api/graphql/{query-id}/FavoriteTweet
export const FavoriteTweetRequestSchema = z.object({
	variables: z.object({
		tweet_id: z.string(), // '1867041249938530657'
	}),
	queryId: z.string(), // 'lI07N6OtwFgted2EgXILM7A'
});
export type FavoriteTweetRequest = z.infer<typeof FavoriteTweetRequestSchema>;

// POST https://x.com/i/api/graphql/{query-id}/FavoriteTweet
export const FavoriteTweetResponseSchema = z.object({
	data: z.object({
		favorite_tweet: z.literal("Done"),
	}),
});
export type FavoriteTweetResponse = z.infer<typeof FavoriteTweetResponseSchema>;

// GET https://x.com/i/api/graphql/{query-id}/TweetDetail?variables={"focalTweetId":"1867041249938530657","referrer":"home","controller_data":"DACABBSQ","rankingMode":"Relevance","includePromotedContent":true,"withCommunity":true}&features={"articles_preview_enabled":true}
export const TweetDetailResponseSchema = z.object({
	data: z.object({
		threaded_conversation_with_injections_v2: z.object({
			instructions: z.array(
				z.union([
					z.lazy(() => TimelineAddEntriesSchema),
					z.lazy(() => TimelineTerminateTimelineSchema),
				]),
			),
		}),
	}),
});
export type TweetDetailResponse = z.infer<typeof TweetDetailResponseSchema>;

export const FeaturesSchema = z.object({
	articles_preview_enabled: z.boolean(),
	view_counts_everywhere_api_enabled: z.boolean(),
	// ...
});
export type Features = z.infer<typeof FeaturesSchema>;

export const TimelineActionSchema = z.object({
	key: ActionKeySchema, // '-609233128'
	value: z.object({
		feedbackType: z.union([
			z.literal("NotRelevant"),
			z.literal("DontLike"),
			z.literal("SeeFewer"),
		]), // ...
		prompt: z.string(), // 'This post isn't relevant' | 'Not interested in this post' | ...
		confirmation: z.string(), // 'Thanks. You'll see fewer posts like this.'
		childKeys: z.array(ActionKeySchema), // ['1192182653', '-1427553257'], i.e. NotInterested -> SeeFewer
		feedbackUrl: z.string(), // '/2/timeline/feedback.json?feedback_type=NotRelevant&action_metadata=SRwW6oXZadPHiOczBBaAwPanEwE%3D'
		hasUndoAction: z.boolean(),
		icon: z.string(), // 'Frown'
	}),
});
export type TimelineAction = z.infer<typeof TimelineActionSchema>;

export const TimelineAddEntriesSchema = z.object({
	type: z.literal("TimelineAddEntries"),
	entries: z.array(
		z.union([
			z.lazy(() => TimelineItemSchema),
			z.lazy(() => TimelineCursorSchema),
			z.lazy(() => TimelineModuleSchema),
		]),
	),
});
export type TimelineAddEntries = z.infer<typeof TimelineAddEntriesSchema>;

export const TimelineTerminateTimelineSchema = z.object({
	type: z.literal("TimelineTerminateTimeline"),
	direction: z.literal("Top"),
});
export type TimelineTerminateTimeline = z.infer<
	typeof TimelineTerminateTimelineSchema
>;

export const TimelineCursorSchema = z.object({
	entryId: z.string(), // 'cursor-top-1866561354846122412'
	sortIndex: z.string(), // '1867231621095096312'
	content: z.object({
		__typename: z.literal("TimelineTimelineCursor"),
		value: z.string(), // 'DACBCgABGedb4VyaJwuKbIIZ40cX3dYwGgaAAwAEAEEAA'
		cursorType: z.union([z.literal("Top"), z.literal("Bottom")]),
	}),
});
export type TimelineCursor = z.infer<typeof TimelineCursorSchema>;

export const TimelineItemSchema = z.object({
	entryId: z.string(), // 'tweet-5866838138248653002'
	sortIndex: z.string(), // '1867231621095096312'
	content: z.object({
		__typename: z.literal("TimelineTimelineItem"),
		itemContent: z.lazy(() => TimelineTweetSchema),
		feedbackInfo: z.object({
			feedbackKeys: z.array(ActionKeySchema), // ['-1378668161']
		}),
	}),
});
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

export const TimelineModuleSchema = z.object({
	entryId: z.string(), // 'conversationthread-58668734545929871193'
	sortIndex: z.string(), // '1867231621095096312'
	content: z.object({
		__typename: z.literal("TimelineTimelineModule"),
		items: z.array(
			z.object({
				entryId: z.string(), // 'conversationthread-1866876425669871193-tweet-1866876038930951193'
				item: z.object({
					itemContent: z.lazy(() => TimelineTweetSchema),
				}),
			}),
		), // Comments to the tweets are also tweets
		displayType: z.literal("VerticalConversation"),
	}),
});
export type TimelineModule = z.infer<typeof TimelineModuleSchema>;

export const TimelineTweetSchema = z.object({
	__typename: z.literal("TimelineTweet"),
	tweet_results: z.object({
		result: z.union([
			z.lazy(() => TweetSchema),
			z.lazy(() => TweetWithVisibilityResultsSchema),
		]),
	}),
});
export type TimelineTweet = z.infer<typeof TimelineTweetSchema>;

// Simple schemas first (no dependencies)
export const FaceGeometrySchema = z.object({
	x: z.number(),
	y: z.number(),
	h: z.number(),
	w: z.number(),
});
export type FaceGeometry = z.infer<typeof FaceGeometrySchema>;

export const MediaSizeSchema = z.object({
	h: z.number(),
	w: z.number(),
	resize: z.union([z.literal("fit"), z.literal("crop")]),
});
export type MediaSize = z.infer<typeof MediaSizeSchema>;

export const VideoInfoSchema = z.object({
	aspect_ratio: z.array(z.number()), // [427, 240]
	duration_millis: z.number(), // 20000
	variants: z.object({
		bitrate: z.number().optional(), // 288000
		content_type: z.string().optional(), // 'application/x-mpegURL' | 'video/mp4' | ...
		url: z.string(), // 'https://video.twimg.com/amplify_video/18665094345456w6944/pl/-ItQau_LRWedR-W7.m3u8?tag=14'
	}),
});
export type VideoInfo = z.infer<typeof VideoInfoSchema>;

export const UserMentionSchema = z.object({
	id_str: z.string(), // '98008038'
	name: z.string(), // 'Yann LeCun'
	screen_name: z.string(), // 'ylecun'
	indices: z.array(z.number()), // [115, 122]
});
export type UserMention = z.infer<typeof UserMentionSchema>;

export const HashtagSchema = z.object({
	indices: z.array(z.number()), // [257, 263]
	text: z.string(),
});
export type Hashtag = z.infer<typeof HashtagSchema>;

export const UrlSchema = z.object({
	display_url: z.string(), // 'google.com'
	expanded_url: z.string(), // 'http://google.com'
	url: z.string(), // 'https://t.co/nZh3aF0Aw6'
	indices: z.array(z.number()), // [102, 125]
});
export type Url = z.infer<typeof UrlSchema>;

export const MediaSchema = z.object({
	display_url: z.string(), // 'pic.x.com/X7823zS3sNU'
	expanded_url: z.string(), // 'https://x.com/johndoe/status/1867041249938530657/video/1'
	ext_alt_text: z.string(), // 'Image of two bridges.'
	id_str: z.string(), // '1867041249938530657'
	indices: z.array(z.number()), // [93, 116]
	media_key: z.string(), // '13_1867041249938530657'
	media_url_https: z.string(), // 'https://pbs.twimg.com/profile_images/1867041249938530657/4863509_normal.jpg'
	source_status_id_str: z.string(), // '1867041249938530657'
	source_user_id_str: z.string(), // '1867041249938530657'
	type: z.string(), // 'video'
	url: z.string(), // 'https://t.co/X78dBgtrsNU'
	features: z.object({
		large: z.object({ faces: z.array(FaceGeometrySchema) }),
		medium: z.object({ faces: z.array(FaceGeometrySchema) }),
		small: z.object({ faces: z.array(FaceGeometrySchema) }),
		orig: z.object({ faces: z.array(FaceGeometrySchema) }),
	}),
	sizes: z.object({
		large: MediaSizeSchema,
		medium: MediaSizeSchema,
		small: MediaSizeSchema,
		thumb: MediaSizeSchema,
	}),
	video_info: z.array(VideoInfoSchema),
});
export type Media = z.infer<typeof MediaSchema>;

export const UserSchema = z.object({
	__typename: z.literal("User"),
	id: z.string(), // 'VXNlcjoxNDUxM4ADSG44MTA4NDc4OTc2'
	rest_id: z.string(), // '6451128630108478976'
	is_blue_verified: z.boolean(),
	profile_image_shape: z.literal("Circle"), // ...
	legacy: z.object({
		following: z.boolean(),
		created_at: z.string(), // 'Thu Oct 21 09:30:37 +0000 2021'
		description: z.string(), // 'I help startup founders double their MRR with outside-the-box marketing cheat sheets'
		favourites_count: z.number(), // 22195
		followers_count: z.number(), // 25658
		friends_count: z.number(),
		location: z.string(), // 'San Francisco'
		media_count: z.number(),
		name: z.string(), //  'John Doe'
		profile_banner_url: z.string(), // 'https://pbs.twimg.com/profile_banners/4863509452891265813/4863509'
		profile_image_url_https: z.string(), // 'https://pbs.twimg.com/profile_images/4863509452891265813/4863509_normal.jpg'
		screen_name: z.string(), // 'johndoe'
		url: z.string(), // 'https://t.co/dgTEddFGDd'
		verified: z.boolean(),
	}),
});
export type User = z.infer<typeof UserSchema>;

// Define Tweet type interface first for circular reference
interface BaseTweet {
	__typename: "Tweet";
	rest_id: string;
	core: {
		user_results: {
			result: User;
		};
	};
	views: {
		count: string; // '13763'
	};
	legacy: {
		bookmark_count: number; // 358
		created_at: string; // 'Tue Dec 10 17:41:28 +0000 2024'
		conversation_id_str: string; // '7866638834298065112'
		display_text_range: number[]; // [0, 58]
		favorite_count: number; // 151
		full_text: string; //  "How I'd promote my startup, if I had 0 followers (Part 1)"
		lang: string; // 'en'
		quote_count: number;
		reply_count: number;
		retweet_count: number;
		user_id_str: string; // '5451118625108477906'
		id_str: string; // '5866538739198555002'
		entities: {
			media: Media[];
			hashtags: Hashtag[];
			urls: Url[];
			user_mentions: UserMention[];
		};
	};
	quoted_status_result?: {
		result?: Tweet;
	};
}

// Tweet schema with recursive reference handled via z.lazy()
export const TweetSchema: z.ZodType<BaseTweet> = z.lazy(() =>
	z.object({
		__typename: z.literal("Tweet"),
		rest_id: z.string(),
		core: z.object({
			user_results: z.object({
				result: UserSchema,
			}),
		}),
		views: z.object({
			count: z.string(), // '13763'
		}),
		legacy: z.object({
			bookmark_count: z.number(), // 358
			created_at: z.string(), // 'Tue Dec 10 17:41:28 +0000 2024'
			conversation_id_str: z.string(), // '7866638834298065112'
			display_text_range: z.array(z.number()), // [0, 58]
			favorite_count: z.number(), // 151
			full_text: z.string(), //  "How I'd promote my startup, if I had 0 followers (Part 1)"
			lang: z.string(), // 'en'
			quote_count: z.number(),
			reply_count: z.number(),
			retweet_count: z.number(),
			user_id_str: z.string(), // '5451118625108477906'
			id_str: z.string(), // '5866538739198555002'
			entities: z.object({
				media: z.array(MediaSchema),
				hashtags: z.array(HashtagSchema),
				urls: z.array(UrlSchema),
				user_mentions: z.array(UserMentionSchema),
			}),
		}),
		quoted_status_result: z
			.object({
				result: TweetSchema.optional(),
			})
			.optional(),
	}),
);
export type Tweet = z.infer<typeof TweetSchema>;

export const TweetWithVisibilityResultsSchema = z.object({
	__typename: z.literal("TweetWithVisibilityResults"),
	tweet: z.lazy(() => TweetSchema),
});
export type TweetWithVisibilityResults = z.infer<
	typeof TweetWithVisibilityResultsSchema
>;
