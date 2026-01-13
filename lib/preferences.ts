import type { BskyAgent } from "@atproto/api";

/**
 * Fetch the user's saved/pinned custom feeds (feed generators) from Bluesky preferences.
 *
 * What this does (high level):
 * 1) Requires an authenticated agent session (preferences are user-specific).
 * 2) Reads actor preferences via `app.bsky.actor.getPreferences()`.
 * 3) Extracts saved feed URIs from:
 *    - Newer preference shape: `savedFeedsPrefV2`
 *    - Legacy fallback shape: `savedFeedsPref`
 * 4) Deduplicates URIs (saved + pinned can overlap).
 * 5) Fetches feed generator metadata via `app.bsky.feed.getFeedGenerators`.
 * 6) Returns an array of feed objects (with `uri` included for convenience).
 *
 * Why the V2 vs legacy logic exists:
 * Bluesky preferences have evolved over time. Some accounts or servers may still
 * return the older `$type` shapes, so we support both to be robust.
 *
 * @param agent Authenticated BskyAgent instance.
 * @returns List of feed generator metadata objects (or [] if none / not logged in).
 */
export async function fetchSavedFeedsImpl(agent: BskyAgent): Promise<any[]> {
    /**
     * Guard: without a session we can't access user preferences.
     * Returning [] keeps callers simple (no special error handling).
     */
    if (!agent) return [];

    /**
     * Fetch all preference records for the current user.
     * Response contains a heterogeneous list of preference objects with `$type`.
     */
    const prefsRes = await agent.app.bsky.actor.getPreferences();
    const prefs = prefsRes.data.preferences;

    /**
     * Collect feed generator URIs (at://... references to feed generators).
     * We’ll dedupe later because the same URI can appear in multiple lists.
     */
    let feedUris: string[] = [];

    // ---------------------------------------------------------------------------
    // 1) Newer pref shape: app.bsky.actor.defs#savedFeedsPrefV2
    // ---------------------------------------------------------------------------

    /**
     * In V2, saved feed references are typically stored as "items" that can include
     * different types (e.g., feeds, lists, etc).
     *
     * We specifically extract items where:
     * - item.type === "feed"
     * - item.value is the feed generator URI
     */
    const v2 = prefs.find(
        (p: any) => p?.$type === "app.bsky.actor.defs#savedFeedsPrefV2"
    );

    if (v2 && Array.isArray((v2 as any).items)) {
        (v2 as any).items.forEach((item: any) => {
            if (item?.type === "feed" && item?.value) feedUris.push(item.value);
        });
    }

    // ---------------------------------------------------------------------------
    // 2) Legacy pref shape fallback: app.bsky.actor.defs#savedFeedsPref
    // ---------------------------------------------------------------------------

    /**
     * If V2 isn't present (or contains no feeds), fall back to the legacy shape.
     * Legacy preferences store arrays of URIs in two buckets:
     * - saved: feeds the user saved
     * - pinned: feeds the user pinned (often a subset, but not guaranteed)
     */
    if (feedUris.length === 0) {
        const legacy = prefs.find(
            (p: any) => p?.$type === "app.bsky.actor.defs#savedFeedsPref"
        );

        if (legacy) {
            feedUris.push(...(((legacy as any).saved as string[]) || []));
            feedUris.push(...(((legacy as any).pinned as string[]) || []));
        }
    }

    /**
     * Dedupe URIs:
     * - "saved" and "pinned" can overlap
     * - repeated entries could exist due to preference merges or server quirks
     */
    feedUris = [...new Set(feedUris)];

    // If nothing found, avoid making the metadata request.
    if (feedUris.length === 0) return [];

    /**
     * Fetch feed generator metadata for all collected URIs.
     * This gives display names, avatar, creator, description, etc.
     */
    const metadataRes = await agent.app.bsky.feed.getFeedGenerators({
        feeds: feedUris,
    });

    /**
     * Return objects shaped for UI convenience.
     * Note: `f` already includes `uri`, but spreading ensures we keep it even if
     * upstream shape changes; also allows adding extra derived fields later.
     */
    return metadataRes.data.feeds.map((f: any) => ({ uri: f.uri, ...f }));
}
