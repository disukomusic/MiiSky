import React, { useState, useEffect, useImperativeHandle, forwardRef, useCallback, useRef } from 'react';
import { DataProvider } from '@plasmicapp/host';
import { isInPlasmicEditor, useBluesky } from '@/lib/BlueskyAuthProvider';
import { compressImage, coerceToBlob } from '@/lib/MediaUtils';
import { BlueskyProps } from "@/lib/Types";
import { createEmbed } from "@/lib/uriEmbed";
import { updateThreadNode } from "@/lib/UpdateThreadNode";
import { fetchThreadImpl } from "@/lib/Thread";
import { fetchFeedImpl } from "@/lib/Feed";
import { fetchSavedFeedsImpl } from "@/lib/preferences";
import { useActorFetchers } from "@/lib/actorViewUtils";

/* =========================================================================================
 * TYPES & INTERFACES
 * ========================================================================================= */
interface ViewerState {
  like?: string;
  repost?: string;
  [key: string]: unknown;
}

interface PostBase {
  uri: string;
  cid: string;
  likeCount?: number;
  repostCount?: number;
  viewer?: ViewerState;
  [key: string]: unknown;
}

interface FeedItem {
  post: PostBase;
  likers?: { did: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

interface ThreadNode {
  post: PostBase;
  replies?: ThreadNode[];
  likers?: { did: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

/* =========================================================================================
 * PROVIDER COMPONENT
 * ========================================================================================= */
export const BlueskyFeedProvider = forwardRef<unknown, BlueskyProps>((props, ref) => {
  const {
    mode = 'author',
    actor,
    feedUrl,
    searchQuery,
    limit = 20,
    threadUri,
    children
  } = props;

  // --- Bluesky Auth Hook ---
  const { agent, isLoggedIn, currentUser, login, logout } = useBluesky();

  // --- General Feed State ---
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Load More State ---
  const [hasMore, setHasMore] = useState(true);

  // --- Interaction State ---
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [savedFeeds, setSavedFeeds] = useState<unknown[]>([]);

  // --- Thread State (Native Structure) ---
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  // We store the thread in 3 distinct parts for easy rendering:
  const [threadAncestors, setThreadAncestors] = useState<ThreadNode[]>([]); // Parent chain
  const [threadFocused, setThreadFocused] = useState<ThreadNode | null>(null); // The main post
  const [threadReplies, setThreadReplies] = useState<ThreadNode[]>([]); // The children tree

  // --- Actor Profile State ---
  const [actorProfile, setActorProfile] = useState<unknown | null>(null);
  const [actorProfileLoading, setActorProfileLoading] = useState(false);
  const [actorProfileError, setActorProfileError] = useState<string | null>(null);
  const [actorFollowers, setActorFollowers] = useState<unknown[]>([]);
  const [actorFollowing, setActorFollowing] = useState<unknown[]>([]);
  const [actorLists, setActorLists] = useState<unknown[]>([]);

  // --- Actor Fetchers Hook ---
  const { fetchActorFollowers, fetchActorFollowing, fetchActorLists } = useActorFetchers({
    agent,
    actor,
    setActorFollowers,
    setActorFollowing,
    setActorLists,
  });

  /* -----------------------------------------------------------------------------
   * THREAD FETCHING
   * ----------------------------------------------------------------------------- */
  const fetchThread = useCallback(async () => {

    if (!agent) return;
    
    await fetchThreadImpl({
      agent,
      threadUri,
      depth: props.threadDepth ?? 6,
      parentHeight: props.threadParentHeight ?? 80,
      setThreadLoading,
      setThreadError,
      setThreadAncestors,
      setThreadFocused,
      setThreadReplies,
    });
  }, [agent, threadUri, props.threadDepth, props.threadParentHeight]);

  /* -----------------------------------------------------------------------------
   * FEED FETCHING
   * ----------------------------------------------------------------------------- */
  const cursorRef = useRef<string | undefined>(undefined);
  const isFetchingRef = useRef(false);

  const fetchFeed = useCallback(async (loadMore = false) => {
    console.log("fetchFeed called", { loadMore, cursor: cursorRef.current });
    
    if (!agent) return;
    
    if (mode === "thread") {
      await fetchThread();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFeedImpl({
        agent,
        mode,
        actor,
        feedUrl,
        searchQuery,
        limit,
        cursor: loadMore ? cursorRef.current : undefined,
      });

      if (loadMore) {
        setPosts((prev) => [...prev, ...(result.posts as unknown as FeedItem[])]);
      } else {
        setPosts(result.posts as unknown as FeedItem[]);
      }

      cursorRef.current = result.cursor;
      setHasMore(!!result.cursor);
    } catch (e: unknown) {
      console.error("Fetch failed:", e);
      setError(e instanceof Error ? e.message : "Error fetching feed");
    } finally {
      setLoading(false);
    }
  }, [agent, mode, actor, feedUrl, searchQuery, limit, fetchThread]);

  // Reset pagination when key props change
  useEffect(() => {
    cursorRef.current = undefined;
    setHasMore(true);
  }, [mode, actor, feedUrl, searchQuery]);

  // --- ACTOR PROFILE FETCHING ---
  const fetchActorProfile = useCallback(async () => {
    if (mode !== 'author' || !actor || !agent) {
      setActorProfile(null);
      return;
    }

    setActorProfileLoading(true);
    setActorProfileError(null);

    try {
      const res = await agent.getProfile({ actor });
      setActorProfile(res.data);
    } catch (e: unknown) {
      console.error("Failed to fetch actor profile:", e);
      setActorProfileError(e instanceof Error ? e.message : "Error fetching profile");
      setActorProfile(null);
    } finally {
      setActorProfileLoading(false);
    }
  }, [agent, mode, actor]);

  // Trigger fetch on prop changes
  useEffect(() => {
    if (loading) return;
    const isTextInputMode = mode === 'search' || mode === 'author';
    const delay = isTextInputMode ? 500 : 0;

    // Immediate fetch for thread mode to feel snappy
    if (mode === 'thread') {
      fetchThread();
      return;
    }

    const handler = setTimeout(() => fetchFeed(), delay);
    return () => clearTimeout(handler);
  }, [mode, isLoggedIn, searchQuery, actor, limit, feedUrl, threadUri]);

  // Fetch actor profile when in author mode
  useEffect(() => {
    if (mode === 'author' && actor) {
      fetchActorProfile();
    } else {
      setActorProfile(null);
    }
  }, [mode, actor, fetchActorProfile]);

  /* -----------------------------------------------------------------------------
 * PREFERENCES (Saved Feeds)
 * ----------------------------------------------------------------------------- */
  const fetchSavedFeeds = useCallback(async () => {
    // Add `!agent` to the guard clause to satisfy TypeScript
    if (!isLoggedIn || !agent) return;

    try {
      const feeds = await fetchSavedFeedsImpl(agent);
      setSavedFeeds(feeds);
    } catch (e) {
      console.error("Failed to fetch saved feeds:", e);
    }
  }, [agent, isLoggedIn]);

  useEffect(() => {
    // Only fetch if logged in AND the user object exists
    if (isLoggedIn && currentUser) {
      fetchSavedFeeds();
    }
  }, [isLoggedIn, currentUser, fetchSavedFeeds]);

  //Dev mode autologin with user and password props
  useEffect(() => {
    if (isInPlasmicEditor() && props.identifier && props.appPassword && !isLoggedIn) {
      login(props.identifier, props.appPassword);
    }
  }, [props.identifier, props.appPassword, isLoggedIn, login]);


  /* -----------------------------------------------------------------------------
   * ACTIONS FOR PLASMIC
   * ----------------------------------------------------------------------------- */
  useImperativeHandle(ref, () => ({

    // --- Fetchers for Actor View ---
    fetchActorFollowers,
    fetchActorFollowing,
    fetchActorLists,

    // --- Login ---
    login: async (identifier?: string, appPassword?: string) => {
      // Prefer explicit args, fall back to component props
      const id = identifier ?? props.identifier;
      const pw = appPassword ?? props.appPassword;

      if (!id) {
        console.warn("[BlueskyFeedProvider] login called without identifier (handle).");
        return;
      }

      // Delegate to BlueskyAuthProvider.login(id, pw)
      await login(id, pw);
    },

    // --- Logout ---
    logout: async () => {
      await logout();
      setPosts([]);
    },

    // --- Like Post (Handles both Thread and List modes) ---
    likePost: async (uri: string, cid?: string) => {
      if (!agent) return;
      // 1. Identify current state to determine if we are Adding or Removing
      let isAlreadyLiked = false;
      let existingLikeUri: string | undefined;
      let cidToUse = cid;

      // Check Thread State
      if (mode === 'thread') {
        const checkNode = (n: ThreadNode | null | undefined): ThreadNode | null => {
          if (!n) return null;
          if (n.post?.uri === uri) return n;
          if (n.replies) {
            for(const r of n.replies) {
              const found = checkNode(r);
              if(found) return found;
            }
          }
          return null;
        };
        // Check focused, ancestors, or replies
        const node = checkNode(threadFocused)
            || threadAncestors.map(checkNode).find(Boolean)
            || threadReplies.map(checkNode).find(Boolean);

        if (node) {
          existingLikeUri = node.post.viewer?.like;
          cidToUse = cidToUse ?? node.post.cid;
        }
      }
      // Check List State
      else {
        const item = posts.find(p => p.post.uri === uri);
        if (item) {
          existingLikeUri = item.post.viewer?.like;
          cidToUse = cidToUse ?? item.post.cid;
        }
      }

      if (!cidToUse) return; // Can't like without CID
      isAlreadyLiked = !!(existingLikeUri && existingLikeUri !== 'pending');

      // 2. Optimistic Update Function
      const performUpdate = <T extends FeedItem | ThreadNode>(prevItem: T): T => {
        const currentCount = prevItem.post.likeCount || 0;
        return {
          ...prevItem,
          post: {
            ...prevItem.post,
            likeCount: isAlreadyLiked ? Math.max(0, currentCount - 1) : currentCount + 1,
            viewer: {
              ...prevItem.post.viewer,
              like: isAlreadyLiked ? undefined : 'pending',
            }
          }
        };
      };

      // 3. Apply Optimistic Updates
      if (mode === 'thread') {
        setThreadFocused(prev => updateThreadNode(prev, uri, performUpdate));
        setThreadAncestors(prev => updateThreadNode(prev, uri, performUpdate));
        setThreadReplies(prev => updateThreadNode(prev, uri, performUpdate));
      } else {
        setPosts(prev => prev.map(item => item.post.uri === uri ? performUpdate(item) : item));
      }

      // 4. API Call
      try {
        if (isAlreadyLiked) {
          await agent.deleteLike(existingLikeUri!);

          // When unliking, remove the current user from the likers array
          const removeSelf = <T extends FeedItem | ThreadNode>(node: T): T => ({
            ...node,
            likers: (node.likers || []).filter(l => l.did !== currentUser?.did),
            post: { ...node.post, viewer: { ...node.post.viewer, like: undefined } }
          });

          if (mode === 'thread') {
            setThreadFocused(prev => updateThreadNode(prev, uri, removeSelf));
            setThreadAncestors(prev => updateThreadNode(prev, uri, removeSelf));
            setThreadReplies(prev => updateThreadNode(prev, uri, removeSelf));
          } else {
            setPosts(prev => prev.map(item => item.post.uri === uri ? removeSelf(item) : item));
          }
        } else {
          const res = await agent.like(uri, cidToUse);

          // Fetch the latest 5 likers to show avatars
          const likersRes = await agent.getLikes({ uri, limit: 5 });

          const latestLikers = likersRes.data.likes.map(l => l.actor as unknown as { did: string; [key: string]: unknown });

          // Combine both updates: The official Like URI AND the Liker list
          const finalUpdate = <T extends FeedItem | ThreadNode>(node: T): T => ({
            ...node,
            likers: latestLikers,
            post: {
              ...node.post,
              viewer: { ...node.post.viewer, like: res.uri }
            }
          });

          if (mode === 'thread') {
            setThreadFocused(prev => updateThreadNode(prev, uri, finalUpdate));
            setThreadAncestors(prev => updateThreadNode(prev, uri, finalUpdate));
            setThreadReplies(prev => updateThreadNode(prev, uri, finalUpdate));
          } else {
            setPosts(prev => prev.map(item => item.post.uri === uri ? finalUpdate(item) : item));
          }
        }
      } catch (e) {
        console.error("Like failed, reverting", e);
        mode === 'thread' ? fetchThread() : fetchFeed();
      }
    },

    // --- Fetch post liker (users) ---
    fetchPostLikes: async (uri: string, limit: number = 20) => {
      if (!agent || !uri) return;

      try {
        // 1. Fetch the likers from the API
        const res = await agent.getLikes({ uri, limit });

        const actorList = res.data.likes.map(l => l.actor as unknown as { did: string; [key: string]: unknown });

        // 2. Define the update function
        const updateWithLikers = <T extends FeedItem | ThreadNode>(node: T): T => ({
          ...node,
          likers: actorList
        });

        // 3. Apply to whichever state is currently active
        if (mode === 'thread') {
          setThreadFocused(prev => updateThreadNode(prev, uri, updateWithLikers));
          setThreadAncestors(prev => updateThreadNode(prev, uri, updateWithLikers));
          setThreadReplies(prev => updateThreadNode(prev, uri, updateWithLikers));
        } else {
          setPosts(prev => prev.map(item =>
              item.post.uri === uri ? updateWithLikers(item) : item
          ));
        }
      } catch (e) {
        console.error("Failed to load likers for action:", e);
      }
    },

    // --- Repost (Handles both Thread and List modes) ---
    repostPost: async (uri: string, cid: string) => {
      if (!agent) return;
      // 1. Identify current state to determine if we are Adding or Removing
      let isAlreadyReposted = false;
      let existingRepostUri: string | undefined;
      let cidToUse: string | undefined = cid;

      // Check Thread State
      if (mode === 'thread') {
        const checkNode = (n: ThreadNode | null | undefined): ThreadNode | null => {
          if (!n) return null;
          if (n.post?.uri === uri) return n;
          if (n.replies) {
            for (const r of n.replies) {
              const found = checkNode(r);
              if (found) return found;
            }
          }
          return null;
        };

        const node =
            checkNode(threadFocused) ||
            threadAncestors.map(checkNode).find(Boolean) ||
            threadReplies.map(checkNode).find(Boolean);

        if (node) {
          existingRepostUri = node.post.viewer?.repost;
          cidToUse = cidToUse || node.post.cid;
        }
      }
      // Check List State
      else {
        const item = posts.find((p) => p.post.uri === uri);
        if (item) {
          existingRepostUri = item.post.viewer?.repost;
          cidToUse = cidToUse || item.post.cid;
        }
      }

      if (!cidToUse) return; // Can't repost without CID
      isAlreadyReposted = !!(existingRepostUri && existingRepostUri !== 'pending');

      // 2. Optimistic Update Function
      const performUpdate = <T extends FeedItem | ThreadNode>(prevItem: T): T => {
        const currentCount = prevItem.post.repostCount || 0;
        return {
          ...prevItem,
          post: {
            ...prevItem.post,
            repostCount: isAlreadyReposted
                ? Math.max(0, currentCount - 1)
                : currentCount + 1,
            viewer: {
              ...prevItem.post.viewer,
              repost: isAlreadyReposted ? undefined : 'pending',
            },
          },
        };
      };

      // 3. Apply Optimistic Updates
      if (mode === 'thread') {
        setThreadFocused((prev) => updateThreadNode(prev, uri, performUpdate));
        setThreadAncestors((prev) => updateThreadNode(prev, uri, performUpdate));
        setThreadReplies((prev) => updateThreadNode(prev, uri, performUpdate));
      } else {
        setPosts((prev) =>
            prev.map((item) => (item.post.uri === uri ? performUpdate(item) : item))
        );
      }

      // 4. API Call
      try {
        if (isAlreadyReposted) {
          await agent.deleteRepost(existingRepostUri!);

          const clearRepost = <T extends FeedItem | ThreadNode>(node: T): T => ({
            ...node,
            post: {
              ...node.post,
              viewer: { ...node.post.viewer, repost: undefined },
            },
          });

          if (mode === 'thread') {
            setThreadFocused((prev) => updateThreadNode(prev, uri, clearRepost));
            setThreadAncestors((prev) => updateThreadNode(prev, uri, clearRepost));
            setThreadReplies((prev) => updateThreadNode(prev, uri, clearRepost));
          } else {
            setPosts((prev) =>
                prev.map((item) => (item.post.uri === uri ? clearRepost(item) : item))
            );
          }
        } else {
          const res = await agent.repost(uri, cidToUse);

          const finalizeRepost = <T extends FeedItem | ThreadNode>(node: T): T => ({
            ...node,
            post: {
              ...node.post,
              viewer: { ...node.post.viewer, repost: res.uri },
            },
          });

          if (mode === 'thread') {
            setThreadFocused((prev) => updateThreadNode(prev, uri, finalizeRepost));
            setThreadAncestors((prev) => updateThreadNode(prev, uri, finalizeRepost));
            setThreadReplies((prev) => updateThreadNode(prev, uri, finalizeRepost));
          } else {
            setPosts((prev) =>
                prev.map((item) =>
                    item.post.uri === uri ? finalizeRepost(item) : item
                )
            );
          }
        }
      } catch (e) {
        console.error("Repost failed, reverting", e);
        mode === 'thread' ? fetchThread() : fetchFeed();
      }
    },

    // --- Create Post (text, images, quote, reply) ---
    createPost: async (
        text: string,
        images: unknown[] = [],
        quoteUri?: string,
        quoteCid?: string,
        replyParentUri?: string,
        replyParentCid?: string,
        replyRootUri?: string,
        replyRootCid?: string,
    ) => {
      if (!agent) return;
      setPosting(true);
      try {
        const uploadedBlobs: { blob: unknown; alt: string }[] = [];

        if (images.length > 0) {
          for (const img of images.slice(0, 4)) {
            const rawBlob = coerceToBlob(img);

            if (!rawBlob) {
              console.warn("Skipping image: not convertible to Blob/File", img);
              continue;
            }

            console.log("rawBlob", rawBlob.type, rawBlob.size);

            const compressed = await compressImage(rawBlob);

            if (!compressed || compressed.size === 0) {
              console.warn("Skipping image: compression produced empty blob", {
                rawType: rawBlob.type,
                rawSize: rawBlob.size,
              });
              continue;
            }

            const encoding = compressed.type || "image/jpeg";

            const buffer = await compressed.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);

            const { data } = await agent.uploadBlob(uint8Array, { encoding });

            uploadedBlobs.push({ blob: data.blob, alt: "" });
          }
        }

        const embed = createEmbed(uploadedBlobs, quoteUri, quoteCid);
        const record: Record<string, unknown> = {
          $type: "app.bsky.feed.post",
          text: (text || "").trim(),
          createdAt: new Date().toISOString(),
          embed: embed
        };

        if (replyParentUri && replyParentCid) {
          record.reply = {
            root: { uri: replyRootUri || replyParentUri, cid: replyRootCid || replyParentCid },
            parent: { uri: replyParentUri, cid: replyParentCid },
          };
        }

        await agent.post(record);

        // Refresh view
        mode === 'thread' ? fetchThread() : fetchFeed();
      } catch(e: unknown) {
        console.error("Inside createPost error:", e);
        const errMessage = e instanceof Error ? e.message : "Failed to create post";
        setPostError(errMessage);
        throw e;
      } finally {
        setPosting(false);
      }
    },

    // --- Load More Posts ---
    loadMore: async () => {
      if (!hasMore || loading || isFetchingRef.current) return;

      isFetchingRef.current = true;
      await fetchFeed(true);
      isFetchingRef.current = false;
    },

    // --- Load More Actor Data ---
    loadMoreFollowers: () => fetchActorFollowers(undefined, true),
    loadMoreFollowing: () => fetchActorFollowing(undefined, true),
    loadMoreLists: () => fetchActorLists(undefined, true),

  }));

  return (
      <DataProvider
          name="bskyData"
          data={{
            posts, // For Timeline/Feed/Search/Author
            loading: loading || !currentUser,
            error,
            hasMore,
            isLoggedIn,
            currentUser: currentUser || {},
            savedFeeds,

            actorProfile,
            actorProfileLoading,
            actorProfileError,
            actorFollowers,
            actorFollowing,
            actorLists,

            // THREAD SPECIFIC DATA
            threadAncestors,
            threadFocused,
            threadReplies,

            threadLoading,
            threadError,

            // Actions status
            posting,
            postError,
          }}
      >
        {children}
      </DataProvider>
  );
});

BlueskyFeedProvider.displayName = 'BlueskyFeedProvider';