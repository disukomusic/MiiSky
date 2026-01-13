
import type { BskyAgent } from "@atproto/api";
import { normalizePost } from "@/lib/NormalizeUtils";
/**
 * Fetches a Bluesky post thread and breaks it into three UI-friendly buckets:
 *
 * 1) `threadAncestors`: parent chain above the focused post (oldest -> newest)
 * 2) `threadFocused`: the currently focused/root post you navigated to
 * 3) `threadReplies`: the reply tree beneath the focused post (normalized)
 *
 * This function is written to plug directly into a React state model where
 * the caller provides state setters. This is especially convenient when your
 * UI layer (e.g., Plasmic) expects stable keys to bind to.
 *
 * Thread endpoint behavior (conceptual):
 * - `getPostThread` returns a "thread view" node with:
 *   - `.post` (the post view)
 *   - `.parent` (another thread node pointing upward)
 *   - `.replies` (array of thread nodes pointing downward)
 * - Some nodes may be missing/blocked/not-found and lack `.post.uri`.
 */
export async function fetchThreadImpl(opts: {
    agent: BskyAgent;

    /**
     * AT-URI of the post to focus the thread on.
     * Example: at://did:plc:.../app.bsky.feed.post/3xxxx
     */
    threadUri?: string;

    /**
     * How deep to fetch replies beneath the focused post.
     * Higher values return more nested replies (more data, slower).
     */
    depth: number;

    /**
     * How many ancestor levels (parents) to fetch above the focused post.
     * Higher values return more context above the post (more data, slower).
     */
    parentHeight: number;

    /** Setter for a "loading" flag used by the UI during network calls. */
    setThreadLoading: (v: boolean) => void;

    /** Setter for an error string to display to the user (or null if no error). */
    setThreadError: (v: string | null) => void;

    /**
     * Setter for the array of normalized ancestor nodes.
     * Expected ordering: top -> down (oldest ancestor first, nearest parent last).
     */
    setThreadAncestors: (v: any[]) => void;

    /** Setter for the normalized focused post node (the one identified by threadUri). */
    setThreadFocused: (v: any) => void;

    /** Setter for the array of normalized reply nodes (children under focused post). */
    setThreadReplies: (v: any[]) => void;
}) {
    const {
        agent,
        threadUri,
        depth,
        parentHeight,
        setThreadLoading,
        setThreadError,
        setThreadAncestors,
        setThreadFocused,
        setThreadReplies,
    } = opts;

    /**
     * If there's no URI, there’s nothing to fetch.
     * Caller can decide whether to set an error; we simply no-op.
     */
    if (!threadUri) return;

    // Immediately reflect loading state in the UI.
    setThreadLoading(true);

    // Clear any previous error before we start a new request.
    setThreadError(null);

    try {
        /**
         * Fetch the thread from the Bluesky agent.
         * - `uri` is the focused post
         * - `depth` controls reply depth
         * - `parentHeight` controls ancestor height
         */
        const res = await agent.getPostThread({
            uri: threadUri,
            depth,
            parentHeight,
        });

        /**
         * `res.data.thread` is the root "thread view node" for the focused post.
         * It includes:
         * - `.post` (post view)
         * - `.parent` chain (ancestors)
         * - `.replies` tree (descendants)
         */
        const root = res.data.thread;

        // -------------------------------------------------------------------------
        // 1) Handle blocked / not found / missing post
        // -------------------------------------------------------------------------

        /**
         * Some thread responses may not include a real post object if:
         * - the post is deleted
         * - the viewer is blocked / cannot view it
         * - moderation rules hide it
         *
         * We treat "missing post.uri" as an invalid thread root.
         */
        if (!root?.post?.uri) {
            setThreadError("Post not found or blocked");
            setThreadAncestors([]);
            setThreadFocused(null);
            setThreadReplies([]);
            return;
        }

        // -------------------------------------------------------------------------
        // 2) Build ancestors list by walking "up" the parent chain
        // -------------------------------------------------------------------------

        /**
         * `root.parent` points to the immediate parent thread node (the post being replied to),
         * and that node may have its own `.parent`, etc.
         *
         * We walk upward and collect nodes in an array.
         */
        const ancestorsRaw: any[] = [];
        let current = root.parent;

        while (current) {
            // Only push nodes that actually contain a post view.
            if (current.post) ancestorsRaw.push(current);

            // Move upward to the next parent.
            current = current.parent;
        }

        /**
         * The loop collects ancestors from nearest parent -> oldest ancestor.
         * For UI rendering, we typically want oldest -> newest so the thread reads top-down.
         *
         * Example (collected): [parent, grandparent, greatGrandparent]
         * After reverse:       [greatGrandparent, grandparent, parent]
         */
        const ancestors = ancestorsRaw.reverse().map(normalizePost);

        // -------------------------------------------------------------------------
        // 3) Normalize the focused/root node
        // -------------------------------------------------------------------------

        /**
         * Normalize the focused post thread node into your app’s standard shape.
         * This ensures consistent keys for Plasmic bindings regardless of endpoint shape.
         */
        const focused = normalizePost(root);

        // -------------------------------------------------------------------------
        // 4) Normalize replies (children) beneath the focused post
        // -------------------------------------------------------------------------

        /**
         * `root.replies` is an array of thread nodes.
         * Each reply node may itself contain `.replies` (nested).
         *
         * normalizePost() is expected to preserve `replies` recursively if present.
         */
        const replies = (root.replies || [])
            .map((r: any) => normalizePost(r))
            .filter(Boolean);

        // Update caller state in one pass after we've built all 3 buckets.
        setThreadAncestors(ancestors);
        setThreadFocused(focused);
        setThreadReplies(replies);
    } catch (e: any) {
        /**
         * Network errors, auth errors, or API errors land here.
         * We log to console for dev visibility and set a user-facing message.
         */
        console.error("Thread fetch failed:", e);
        setThreadError(e?.message ?? "Failed to fetch thread");
    } finally {
        /**
         * Always clear loading state (success OR failure).
         * This prevents the UI from getting stuck in a loading spinner.
         */
        setThreadLoading(false);
    }
}
