import React, { useEffect, useImperativeHandle, forwardRef, useMemo, useState } from 'react';
import { DataProvider } from '@plasmicapp/host';
import { isInPlasmicEditor, useBluesky } from '@/lib/BlueskyAuthProvider';
import { compressImage, coerceToBlob } from '@/lib/MediaUtils';
import { BlueskyProps } from "@/lib/Types";
import { createEmbed } from "@/lib/uriEmbed";
import { fetchThreadImpl } from "@/lib/Thread";
import { fetchFeedImpl } from "@/lib/Feed";
import { fetchSavedFeedsImpl } from "@/lib/preferences";
import { useActorFetchers } from "@/lib/actorViewUtils";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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

  // --- Bluesky Auth & React Query ---
  const { agent, isLoggedIn, currentUser, login, logout } = useBluesky();
  const queryClient = useQueryClient();

  // --- Scroll Restoration ---
  const [scrollTargetUri, setScrollTargetUri] = useState<string | null>(null);

  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    const checkTarget = () => {
      if (typeof window !== 'undefined') {
        const target = sessionStorage.getItem('scrollTarget');
        if (target && target !== scrollTargetUri) {
          setScrollTargetUri(target);
        }
      }
    };
    checkTarget();
    window.addEventListener('popstate', checkTarget);
    return () => window.removeEventListener('popstate', checkTarget);
  }, [scrollTargetUri]);

  // --- 1. Feed Query (Infinite Pagination) ---
  const {
    data: feedData,
    fetchNextPage,
    hasNextPage,
    isFetching: isFeedLoading,
    error: feedError
  } = useInfiniteQuery({
    queryKey: ['feed', mode, actor, feedUrl, searchQuery],
    queryFn: async ({ pageParam }) => {
      if (!agent) throw new Error("Agent not ready");
      return await fetchFeedImpl({
        agent,
        mode,
        actor,
        feedUrl,
        searchQuery,
        limit,
        cursor: pageParam as string | undefined
      });
    },
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
    enabled: !!agent && mode !== 'thread',
  });

  const posts = useMemo(() => feedData?.pages.flatMap(page => page.posts) || [], [feedData]);

  // Clear scroll target once posts load
  useEffect(() => {
    if (scrollTargetUri && posts.length > 0) {
      sessionStorage.removeItem('scrollTarget');
    }
  }, [scrollTargetUri, posts]);

  // --- 2. Thread Query ---
  const {
    data: threadData,
    isFetching: isThreadLoading,
    error: threadError
  } = useQuery({
    queryKey: ['thread', threadUri],
    queryFn: async () => {
      if (!agent || !threadUri) throw new Error("Missing agent or URI");

      let ancestors: any[] = [];
      let focused: any = null;
      let replies: any[] = [];

      await fetchThreadImpl({
        agent,
        threadUri,
        depth: props.threadDepth ?? 6,
        parentHeight: props.threadParentHeight ?? 80,
        setThreadLoading: () => {},
        setThreadError: () => {},
        setThreadAncestors: (data) => ancestors = data,
        setThreadFocused: (data) => focused = data,
        setThreadReplies: (data) => replies = data,
      });

      return { ancestors, focused, replies };
    },
    enabled: !!agent && mode === 'thread' && !!threadUri,
  });

  // --- 3. Actor Profile Query ---
  const { data: actorProfile, isLoading: actorProfileLoading, error: actorProfileError } = useQuery({
    queryKey: ['profile', actor],
    queryFn: async () => {
      const res = await agent!.getProfile({ actor: actor! });
      return res.data;
    },
    enabled: !!agent && mode === 'author' && !!actor,
  });

  // --- 4. Saved Feeds Query ---
  const { data: savedFeeds = [] } = useQuery({
    queryKey: ['savedFeeds', currentUser?.did],
    queryFn: async () => await fetchSavedFeedsImpl(agent!),
    enabled: !!agent && isLoggedIn && !!currentUser,
  });

  // --- Actor Fetchers Hook (Retained for legacy UI compatibility) ---
  const [actorFollowers, setActorFollowers] = useState<unknown[]>([]);
  const [actorFollowing, setActorFollowing] = useState<unknown[]>([]);
  const [actorLists, setActorLists] = useState<unknown[]>([]);

  const { fetchActorFollowers, fetchActorFollowing, fetchActorLists } = useActorFetchers({
    agent,
    actor,
    setActorFollowers,
    setActorFollowing,
    setActorLists,
  });

  // --- 5. Mutations (Actions) ---
  const likeMutation = useMutation({
    mutationFn: async ({ uri, cid, isAlreadyLiked, existingLikeUri }: { uri: string, cid: string, isAlreadyLiked: boolean, existingLikeUri?: string }) => {
      if (isAlreadyLiked && existingLikeUri) {
        return await agent!.deleteLike(existingLikeUri);
      } else {
        return await agent!.like(uri, cid);
      }
    },
    onSuccess: () => {
      // Refresh both feeds and threads on success
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
    }
  });

  const repostMutation = useMutation({
    mutationFn: async ({ uri, cid, isAlreadyReposted, existingRepostUri }: { uri: string, cid: string, isAlreadyReposted: boolean, existingRepostUri?: string }) => {
      if (isAlreadyReposted && existingRepostUri) {
        return await agent!.deleteRepost(existingRepostUri);
      } else {
        return await agent!.repost(uri, cid);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
    }
  });

  const createPostMutation = useMutation({
    mutationFn: async ({
                         text, images = [], quoteUri, quoteCid, replyParentUri, replyParentCid, replyRootUri, replyRootCid
                       }: any) => {
      const uploadedBlobs: { blob: unknown; alt: string }[] = [];

      if (images.length > 0) {
        for (const img of images.slice(0, 4)) {
          const rawBlob = coerceToBlob(img);
          if (!rawBlob) continue;

          const compressed = await compressImage(rawBlob);
          if (!compressed || compressed.size === 0) continue;

          const encoding = compressed.type || "image/jpeg";
          const buffer = await compressed.arrayBuffer();
          const uint8Array = new Uint8Array(buffer);

          const { data } = await agent!.uploadBlob(uint8Array, { encoding });
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

      return await agent!.post(record);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
    }
  });

  // --- Dev Mode Auto-Login ---
  useEffect(() => {
    if (isInPlasmicEditor() && props.identifier && props.appPassword && !isLoggedIn) {
      login(props.identifier, props.appPassword);
    }
  }, [props.identifier, props.appPassword, isLoggedIn, login]);

  // --- Actions for Plasmic ---
  useImperativeHandle(ref, () => ({
    fetchActorFollowers,
    fetchActorFollowing,
    fetchActorLists,

    login: async (identifier?: string, appPassword?: string) => {
      const id = identifier ?? props.identifier;
      const pw = appPassword ?? props.appPassword;
      if (id) await login(id, pw);
    },

    logout: async () => {
      await logout();
      queryClient.clear(); // Wipe cache on logout
    },

    likePost: async (uri: string, cid: string) => {
      if (!agent) return;

      // Determine if liked natively using the current UI state to pass to the mutation
      let existingLikeUri: string | undefined;
      const allItems = mode === 'thread'
          ? [...(threadData?.ancestors || []), threadData?.focused, ...(threadData?.replies || [])].filter(Boolean)
          : posts;

      // Look for the post in our current cached data
      const targetNode = allItems.find((n: any) => n?.post?.uri === uri);
      existingLikeUri = targetNode?.post?.viewer?.like;

      likeMutation.mutate({
        uri,
        cid,
        isAlreadyLiked: !!(existingLikeUri && existingLikeUri !== 'pending'),
        existingLikeUri
      });
    },

    repostPost: async (uri: string, cid: string) => {
      if (!agent) return;

      let existingRepostUri: string | undefined;
      const allItems = mode === 'thread'
          ? [...(threadData?.ancestors || []), threadData?.focused, ...(threadData?.replies || [])].filter(Boolean)
          : posts;

      const targetNode = allItems.find((n: any) => n?.post?.uri === uri);
      existingRepostUri = targetNode?.post?.viewer?.repost;

      repostMutation.mutate({
        uri,
        cid,
        isAlreadyReposted: !!(existingRepostUri && existingRepostUri !== 'pending'),
        existingRepostUri
      });
    },

    createPost: async (text: string, images: unknown[] = [], quoteUri?: string, quoteCid?: string, replyParentUri?: string, replyParentCid?: string, replyRootUri?: string, replyRootCid?: string) => {
      createPostMutation.mutate({ text, images, quoteUri, quoteCid, replyParentUri, replyParentCid, replyRootUri, replyRootCid });
    },

    fetchPostLikes: async (uri: string, limit: number = 20) => {
      // Handled automatically by background refetching in this architecture, but left exposed for Plasmic compatibility
    },

    loadMore: async () => {
      if (hasNextPage && !isFeedLoading) {
        await fetchNextPage();
      }
    },

    loadMoreFollowers: () => fetchActorFollowers(undefined, true),
    loadMoreFollowing: () => fetchActorFollowing(undefined, true),
    loadMoreLists: () => fetchActorLists(undefined, true),
  }));

  return (
      <DataProvider
          name="bskyData"
          data={{
            posts,
            loading: isFeedLoading || (!currentUser && isLoggedIn),
            error: feedError ? String(feedError) : null,
            hasMore: !!hasNextPage,
            isLoggedIn,
            currentUser: currentUser || {},
            savedFeeds,

            actorProfile,
            actorProfileLoading,
            actorProfileError: actorProfileError ? String(actorProfileError) : null,
            actorFollowers,
            actorFollowing,
            actorLists,

            threadAncestors: threadData?.ancestors || [],
            threadFocused: threadData?.focused || null,
            threadReplies: threadData?.replies || [],
            threadLoading: isThreadLoading,
            threadError: threadError ? String(threadError) : null,

            posting: createPostMutation.isPending,
            postError: createPostMutation.error ? String(createPostMutation.error) : null,

            scrollTargetUri,
          }}
      >
        {children}
      </DataProvider>
  );
});

BlueskyFeedProvider.displayName = 'BlueskyFeedProvider';