/**
 * Supported "feed modes" for Bluesky data provider / UI.
 *
 * These modes typically correspond to different upstream API calls:
 * - "timeline": the logged-in user's home timeline
 * - "author": posts from a specific actor (profile feed)
 * - "feed": a custom feed generator (e.g., Discover / What's Hot)
 * - "search": search results for a text query
 * - "thread": a focused post thread view (ancestors + replies)
 *
 * Keeping this as a union type is useful for:
 * - safer branching (switch(mode))
 * - auto-complete in editors
 * - preventing invalid strings in Plasmic props / state
 */
export type FeedMode = "author" | "timeline" | "feed" | "search" | "thread";

/**
 * Props consumed by your Bluesky provider component (or loader wrapper).
 *
 * Design goals:
 * - Allow the same provider to power multiple views (timeline/author/feed/search/thread)
 * - Provide optional auth credentials for login flows (app password)
 * - Keep thread-specific parameters grouped and optional
 * - Make the provider compatible with Plasmic by having a single prop object
 */
export interface BlueskyProps {
    /**
     * Determines which data fetching path to use.
     * (Example: timeline vs author feed vs search vs thread view.)
     */
    mode: FeedMode;

    /**
     * Actor identifier for profile/author feeds.
     * Typically a handle (e.g., "alice.bsky.social") or a DID ("did:plc:...").
     * Used primarily when `mode === "author"`.
     */
    actor?: string;

    /**
     * Custom feed generator identifier or URL.
     * Used when `mode === "feed"`.
     * If omitted, code usually falls back to DISCOVER_FEED_URI.
     */
    feedUrl?: string;

    /**
     * Search query string.
     * Used when `mode === "search"`.
     */
    searchQuery?: string;

    /**
     * Max number of items to request from upstream APIs.
     * Optional so callers can rely on a default in the provider if desired.
     */
    limit?: number;

    /**
     * Optional identifier for analytics/debugging/memoization.
     * Useful in Plasmic setups where multiple provider instances might exist.
     */
    identifier?: string;

    /**
     *  Bluesky "App Password" used for login/auth flows.
     *
     * ⚠️ Security note:
     * This should be handled carefully (do not log it; avoid persisting it unnecessarily).
     */
    appPassword?: string;

    /**
     * Child content rendered within the provider (e.g., Plasmic root component).
     * The provider typically injects data via context to these children.
     */
    children: any;

    /**
     * Whether the provider should attempt authenticated requests / login behavior.
     * When false, provider may operate in "public" mode (limited endpoints).
     */
    auth: boolean;

    /**
     * AT-URI for the post to load in thread mode.
     * Example: at://did:plc:.../app.bsky.feed.post/3xxxx
     * Used when `mode === "thread"`.
     */
    threadUri?: string;

    /**
     * Reply depth for thread fetching (how deep to fetch nested replies).
     * Used when `mode === "thread"`.
     */
    threadDepth?: number;

    /**
     * Parent height for thread fetching (how many ancestors to fetch above the post).
     * Used when `mode === "thread"`.
     */
    threadParentHeight?: number;
}

/**
 * Default Discover / "What's Hot" feed generator URI.
 *
 * This is an AT-URI referencing a feed generator record on the network:
 * - did:plc:... identifies the feed generator owner
 * - app.bsky.feed.generator is the collection type
 * - "whats-hot" is the record key (rkey)
 *
 * Used as a fallback when `feedUrl` is not provided.
 */
export const DISCOVER_FEED_URI =
    "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
