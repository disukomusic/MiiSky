import React, { useMemo } from 'react';
import { DataProvider } from '@plasmicapp/host';
import { AtpAgent } from '@atproto/api';
import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { fetchFeedImpl } from '@/lib/Feed';
import { BlueskyProps } from "@/lib/Types";

/* =========================================================================================
 * DEMO PROVIDER COMPONENT (Unauthenticated)
 * ========================================================================================= */
export const DemoFeedProvider = (props: BlueskyProps) => {
    const {
        mode = 'author',
        actor,
        feedUrl,
        searchQuery,
        limit = 20,
        children
    } = props;

    // 1. Create a public, read-only agent. 
    // Pointing to public.api.bsky.app allows fetching without logging in.
    const agent = useMemo(() => {
        return new AtpAgent({ service: 'https://public.api.bsky.app' });
    }, []);

    // 2. Fetch data using your existing Feed.ts logic
    type FeedPage = { posts: any[]; cursor?: string };
    const feedQueryKey = ['demo-feed', mode, actor, feedUrl, searchQuery] as const;

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetching,
        error
    } = useInfiniteQuery<FeedPage, Error, InfiniteData<FeedPage, string | undefined>, typeof feedQueryKey, string | undefined>({
        queryKey: feedQueryKey,
        initialPageParam: undefined,
        queryFn: async ({ pageParam }) => {
            // The 'timeline' mode fetches the logged-in user's home feed.
            // This will fail without auth, so we block it explicitly here.
            if (mode === 'timeline') {
                throw new Error("Timeline mode requires authentication. Please use 'author', 'feed', or 'search' for the demo.");
            }

            return await fetchFeedImpl({
                agent: agent as any, // Cast if your fetchFeedImpl expects BskyAgent specifically
                mode,
                actor,
                feedUrl,
                searchQuery,
                limit,
                cursor: pageParam
            });
        },
        getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    });

    const posts = useMemo(() => data?.pages.flatMap((page) => page.posts) || [], [data]);

    // 3. Expose the data to Plasmic
    return (
        <DataProvider
            name="bskyData"
            data={{
                posts,
                loading: isFetching,
                error: error ? String(error) : null,
                hasMore: hasNextPage,
                isLoggedIn: false, // Explicitly false for the demo

                // We provide a stubbed loadMore function so pagination still works
                loadMore: async () => {
                    if (hasNextPage && !isFetching) {
                        await fetchNextPage();
                    }
                },

                // Provide empty states for auth-dependent fields to prevent UI errors
                currentUser: {},
                savedFeeds: [],
                threadAncestors: [],
                threadFocused: null,
                threadReplies: [],
                actorProfile: null,
            }}
        >
            {children}
        </DataProvider>
    );
};

DemoFeedProvider.displayName = 'DemoFeedProvider';