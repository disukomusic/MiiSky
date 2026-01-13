import type { BskyAgent } from "@atproto/api";
import { normalizePost } from "@/lib/NormalizeUtils";
import { resolveFeedUri } from "./uriEmbed";
import { DISCOVER_FEED_URI } from "./Types";

/**
 * Options used to fetch a list of posts from various Bluesky sources.
 *
 * Notes on key fields:
 * - `mode` decides *which* endpoint is called and what data shape comes back.
 * - `actor` is used only for author feeds (handle or DID).
 * - `feedUrl` can be a human-friendly feed URL/identifier; we resolve it to a feed URI first.
 * - `searchQuery` is used only for search mode.
 * - `limit` is passed through to upstream API calls to cap the number of items returned.
 */
export async function fetchFeedImpl(opts: {
    agent: BskyAgent;

    /**
     * Determines which upstream endpoint we call.
     *
     * Supported modes:
     * - "timeline": Home timeline for the logged-in user (requires session)
     * - "author": Posts from a specific actor (handle/DID), excludes replies
     * - "feed": A custom feed (Discover by default)
     * - "search": Search posts by text query
     * - "thread": Reserved / future use (not handled in this file yet)
     *
     * The `| string` allows callers to experiment with new modes without TS errors,
     * but anything unknown will fall back to the "author" logic (default case).
     */
    mode: "author" | "timeline" | "feed" | "search" | "thread" | string;

    /** Actor (handle or DID). Used by "author" mode. */
    actor?: string;

    /**
     * Custom feed URL/identifier. Used by "feed" mode.
     * If not provided, defaults to `DISCOVER_FEED_URI`.
     */
    feedUrl?: string;

    /** Search query string. Used by "search" mode. */
    searchQuery?: string;

    /** Maximum number of items to fetch from the upstream API. */
    limit: number;
    
    //** Cursor for keeping track of pagination */
    cursor?: string;
    
}): Promise<{posts: any[]; cursor?: string}> {
    const { agent, mode, actor, feedUrl, searchQuery, limit, cursor } = opts;

    /**
     * Raw items returned by whichever upstream endpoint we call.
     *
     * Important: Bluesky endpoints return different shapes:
     * - timeline/feed/author endpoints tend to return objects like `{ post, reason?, reply? ... }`
     * - searchPosts returns an array of *posts* directly, so we wrap each as `{ post }`
     *   to match the feed-item shape expected by `normalizePost()`.
     */
    let data: any[] = [];
    let nextCursor: string | undefined;

    switch (mode) {
        case "timeline": {
            /**
             * Home timeline requires an authenticated session.
             * If no session exists, we simply return an empty list.
             */
            if (agent) {
                const tlRes = await agent.getTimeline({ limit, cursor });
                data = tlRes.data.feed;
                nextCursor = tlRes.data.cursor;
            }
            break;
        }

        case "search": {
            /**
             * Search endpoint returns `posts` (not `feed` items),
             * so we map each post into an object shaped like a feed item: `{ post }`.
             *
             * This keeps your UI rendering consistent after normalization.
             */
            if (searchQuery) {
                const searchRes = await agent.app.bsky.feed.searchPosts({
                    q: searchQuery,
                    limit,
                    cursor,
                });

                data = searchRes.data.posts.map((post: any) => ({ post }));
                nextCursor = searchRes.data.cursor;
            }
            break;
        }

        case "feed": {
            /**
             * Custom feeds often have a "pretty" URL or identifier.
             * `resolveFeedUri()` converts that into the canonical feed URI needed by the API.
             *
             * If callers don't supply `feedUrl`, we default to your discover feed constant.
             */
            const rawUrl = feedUrl || DISCOVER_FEED_URI;

            // Resolve to a valid feed URI (may return null/undefined if invalid/unresolvable).
            const uri = await resolveFeedUri(agent, rawUrl);

            if (uri) {
                const feedRes = await agent.app.bsky.feed.getFeed({ feed: uri, limit, cursor });
                data = feedRes.data.feed;
                nextCursor = feedRes.data.cursor;
            }
            break;
        }

        case "author":
        default: {
            /**
             * Default behavior: fetch an author's feed (posts only).
             *
             * `filter: "posts_no_replies"` ensures the result is cleaner for "profile posts"
             * style views (no reply posts mixed in).
             */
            if (actor) {
                const authorRes = await agent.getAuthorFeed({
                    actor,
                    limit,
                    filter: "posts_no_replies",
                    cursor,
                });

                data = authorRes.data.feed;
                nextCursor = authorRes.data.cursor;
            }
            break;
        }
    }

    /**
     * Normalize list items into your app’s consistent shape.
     *
     * Why this matters:
     * - Different endpoints return different shapes and fields
     * - Normalization lets Plasmic bindings/UI always read the same keys
     * - It’s also a good place to handle missing fields, embeds, author info, etc.
     */
    return {
        posts: data.map((item: any) => normalizePost(item)),
        cursor: nextCursor,
    };
}
