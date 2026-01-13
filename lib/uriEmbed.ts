
import { BskyAgent } from "@atproto/api";

/**
 * Resolve a feed URL / identifier into a canonical AT-URI for a feed generator.
 *
 * Accepts:
 * - Already-canonical AT-URI: "at://did:.../app.bsky.feed.generator/<rkey>"
 * - bsky.app-style URL:      ".../profile/<handle|did>/feed/<rkey>"
 *
 * Returns:
 * - "at://<did>/app.bsky.feed.generator/<rkey>" when resolvable
 * - null when input is empty, unrecognized, or resolution fails
 *
 * Note:
 * - If the identifier in the URL is a handle (not a DID), we resolve it via the agent.
 */
export const resolveFeedUri = async (
    agent: BskyAgent,
    url: string
): Promise<string | null> => {
    if (!url) return null;

    // If it's already an AT-URI, nothing to do.
    if (url.startsWith("at://")) return url;

    // Parse bsky.app-ish feed URLs: /profile/<identifier>/feed/<feedId>
    const match = url.match(/profile\/([^/]+)\/feed\/([^/]+)/);
    if (match) {
        const identifier = match[1]; // handle or DID
        const feedId = match[2];     // record key (rkey)

        try {
            // Convert handle -> DID if needed.
            let did = identifier;
            if (!identifier.startsWith("did:")) {
                const res = await agent.resolveHandle({ handle: identifier });
                did = res.data.did;
            }

            // Feed generators live in the app.bsky.feed.generator collection.
            return `at://${did}/app.bsky.feed.generator/${feedId}`;
        } catch (e) {
            // Handle resolution (or other agent calls) can fail; treat as unresolvable.
            return null;
        }
    }

    // Unrecognized format.
    return null;
};

/**
 * Builds an AT Protocol embed object for a post based on:
 * - uploaded images (optional)
 * - a quote target (optional)
 *
 * Possible outputs:
 * - Images only:         app.bsky.embed.images
 * - Quote only:          app.bsky.embed.record
 * - Quote + images:      app.bsky.embed.recordWithMedia
 * - Neither provided:    undefined (no embed)
 *
 * Note:
 * - `uploadedImages` are expected to include `{ blob, alt? }`
 * - Quote requires BOTH `quoteUri` and `quoteCid` to be valid.
 */
export const createEmbed = (
    uploadedImages: any[],
    quoteUri?: string,
    quoteCid?: string
) => {
    // Image embed (if any images exist)
    const imageEmbed =
        uploadedImages.length > 0
            ? {
                $type: "app.bsky.embed.images",
                images: uploadedImages.map((img) => ({
                    image: img.blob,         // ATProto blob reference
                    alt: img.alt || "",      // accessibility text
                })),
            }
            : null;

    // Quote embed (only if both uri + cid are provided)
    const quoteEmbed =
        quoteUri && quoteCid
            ? {
                $type: "app.bsky.embed.record",
                record: { uri: quoteUri, cid: quoteCid },
            }
            : null;

    // If both exist, wrap quote + media into recordWithMedia.
    if (imageEmbed && quoteEmbed) {
        return {
            $type: "app.bsky.embed.recordWithMedia",
            media: imageEmbed,
            record: quoteEmbed,
        };
    }

    // Otherwise return whichever exists, or undefined when neither exists.
    return imageEmbed || quoteEmbed || undefined;
};
``
