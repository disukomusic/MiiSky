/**
 * Attempts to "flatten" a Bluesky embed into a quoted post record (if present).
 *
 * What this is for:
 * Bluesky embeds can represent quoted posts in a few shapes:
 * - app.bsky.embed.record#view               (simple quote)
 * - app.bsky.embed.recordWithMedia#view      (quote + media; quote record is nested)
 *
 * This helper returns the *post record view* object that contains `author`,
 * or null if the embed doesn't represent a quote.
 *
 * Notes:
 * - The return value is intentionally a "record view" (the thing with `author`).
 * - If the embed has a record but not an author, it’s likely not a post quote view.
 */
export const flattenEmbed = (embed: any) => {
    if (!embed) return null;

    // In many embed shapes, the quoted content lives at embed.record.
    // In recordWithMedia, the record is nested one extra level: embed.record.record
    let record = embed.record;

    if (embed.$type === "app.bsky.embed.recordWithMedia#view") {
        record = embed.record.record;
    }

    if (!record) return null;

    // If the record has an author, it’s a top-level quote record view.
    if (record.author) return record;

    // Some shapes nest the record view one more level deep (defensive handling).
    if (record.record?.author) return record.record;

    // Not a quote (or an unsupported/unknown shape).
    return null;
};

/**
 * Extracts an array of displayable images from an embed.
 *
 * Supported patterns:
 * - embed.images                          (standard image embed view)
 * - embed.media.images                    (recordWithMedia where media is images)
 * - embed.external.thumb                  (external link preview with thumbnail)
 *
 * Returns:
 * - A normalized list of "image-like" objects that the UI can render.
 * - Empty array if no usable images exist.
 *
 * Note:
 * - External embeds don’t provide the same fields as image embeds,
 *   so we synthesize `fullsize`, `thumb`, and `alt` from the preview data.
 */
export const getDisplayImages = (embed: any) => {
    if (!embed) return [];

    // Standard image embed: { images: [...] }
    if (Array.isArray(embed.images)) return embed.images;

    // recordWithMedia: { media: { images: [...] } }
    if (embed.media && Array.isArray(embed.media.images)) return embed.media.images;

    // External link preview thumbnail (treated as a single display image)
    if (embed.external?.thumb) {
        return [
            {
                fullsize: embed.external.thumb,
                thumb: embed.external.thumb,
                alt: embed.external.title,
            },
        ];
    }

    return [];
};

/**
 * Extracts a displayable video payload from an embed (if present).
 *
 * Supported patterns:
 * - app.bsky.embed.video#view                   (direct video embed)
 * - recordWithMedia where embed.media is video  (quoted record with attached video)
 *
 * Returns:
 * - A small object containing fields your UI is likely to use (playlist, thumbnail, alt, cid)
 * - null if no video is present.
 */
export const getDisplayVideo = (embed: any) => {
    if (!embed) return null;

    // Direct video embed
    if (embed.$type === "app.bsky.embed.video#view") {
        return {
            playlist: embed.playlist,
            thumbnail: embed.thumbnail,
            alt: embed.alt,
            cid: embed.cid,
        };
    }

    // recordWithMedia where the "media" portion is a video embed
    if (
        embed.$type === "app.bsky.embed.recordWithMedia#view" &&
        embed.media?.$type === "app.bsky.embed.video#view"
    ) {
        return {
            playlist: embed.media.playlist,
            thumbnail: embed.media.thumbnail,
            alt: embed.media.alt,
            cid: embed.media.cid,
        };
    }

    return null;
};

/**
 * Main normalizer: converts a raw Bluesky API node into a consistent shape
 * your UI can bind to (especially useful for Plasmic).
 *
 * Inputs this can handle:
 * - Feed item nodes shaped like { post, reason?, reply?, ... }
 * - Post view objects shaped like { uri, author, record, ... } (already a post)
 * - Thread nodes that contain .replies and/or .reply.parent trees
 *
 * Output shape (high level):
 * - post: the underlying post view
 * - repostedBy: actor who reposted (if this node represents a repost)
 * - parent: normalized parent post (if provided via node.reply.parent)
 * - quote: flattened quoted post record (if embed contains a quote)
 * - displayImages / displayVideo / externalLink: ready-to-render media info
 * - replies: normalized children (if this node contains replies)
 * - likers: placeholder array for future enrichment
 *
 * Important:
 * - This function is recursive for parent/replies.
 * - It returns null if the node doesn’t resolve to a post with a URI.
 */
export const normalizePost = (node: any) => {
    /**
     * Some endpoints wrap the post under `node.post` (feed items),
     * while others return the post object directly (thread/post view).
     * This line supports both.
     */
    const post = node?.post ? node.post : node;

    // If we can't identify the post, fail gracefully.
    if (!post?.uri) return null;

    // Most media/quote data is carried via embeds on the post view.
    const embed = post.embed;

    /**
     * Reposts in feed endpoints include a `reason` object describing why
     * the post is in the feed. If that reason type is "reasonRepost",
     * then this item is a repost of someone else's post.
     */
    const isRepost = node?.reason?.$type === "app.bsky.feed.defs#reasonRepost";
    const repostedBy = isRepost ? node.reason.by : null;

    return {
        /** The underlying post view (raw-ish, but consistent for UI access). */
        post,

        /** Actor who reposted this item (null if not a repost). */
        repostedBy,
        
        /** Timestamp when this was reposted (from reason.indexedAt), null if not a repost */
        repostTime: isRepost ? node.reason.indexedAt : null,

        /** Timestamp when this reply was created (from post.record.reply context) */
        replyTime: post.record?.reply ? post.record.createdAt : null,

        /** Timestamp when the quote post was created (the quoting post's createdAt) */
        quoteTime: flattenEmbed(embed) ? post.record?.createdAt : null,
        
        /**
         * Parent post (if this node came from a thread/reply context).
         * - node.reply.parent appears on some thread/feed shapes.
         * - We normalize recursively so the parent has the same shape as this node.
         */
        parent: node.reply?.parent ? normalizePost(node.reply.parent) : null,

        /**
         * Quote/embedded post record (if the embed represents a quote).
         * flattenEmbed() handles both simple quote and recordWithMedia nesting.
         */
        quote: flattenEmbed(embed),

        /** Array of image objects suitable for rendering (can be empty). */
        displayImages: getDisplayImages(embed),

        /** Video payload if present, else null. */
        displayVideo: getDisplayVideo(embed),

        /**
         * External link data (only when embed is specifically an external view).
         * UI can render title/description/thumb/etc.
         */
        externalLink:
            embed?.$type === "app.bsky.embed.external#view" ? embed.external : null,

        /**
         * Keep children/replies attached if we are normalizing a tree node.
         * This is typical in thread mode; `node.replies` is an array of reply nodes.
         * - We normalize each reply recursively
         * - filter(Boolean) removes nulls from any malformed nodes
         */
        replies: node.replies ? node.replies.map(normalizePost).filter(Boolean) : [],

        /**
         * Placeholder for future enrichment:
         * You can later populate this with profiles of users who liked the post
         * (or just counts), without changing UI bindings.
         */
        likers: [],
    };
};
