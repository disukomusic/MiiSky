// lib/actorViewUtils.ts
import { useCallback, useRef } from 'react';
import { BskyAgent } from '@atproto/api';

interface UseActorFetchersProps {
    agent: BskyAgent | null;
    actor?: string;
    setActorFollowers: React.Dispatch<React.SetStateAction<any[]>>;
    setActorFollowing: React.Dispatch<React.SetStateAction<any[]>>;
    setActorLists: React.Dispatch<React.SetStateAction<any[]>>;
}


export function useActorFetchers({
                                     agent,
                                     actor,
                                     setActorFollowers,
                                     setActorFollowing,
                                     setActorLists,
                                 }: UseActorFetchersProps) {
    // Cursor refs for pagination
    const followersCursorRef = useRef<string | undefined>(undefined);
    const followingCursorRef = useRef<string | undefined>(undefined);
    const listsCursorRef = useRef<string | undefined>(undefined);

    // Has more flags
    const hasMoreFollowersRef = useRef(true);
    const hasMoreFollowingRef = useRef(true);
    const hasMoreListsRef = useRef(true);

    const fetchActorFollowers = useCallback(async (actorHandle?: string, loadMore = false) => {
        const targetActor = actorHandle || actor;
        if (!agent || !targetActor) return;
        if (loadMore && !hasMoreFollowersRef.current) return;

        try {
            const res = await agent.getFollowers({
                actor: targetActor,
                limit: 15,
                cursor: loadMore ? followersCursorRef.current : undefined,
            });

            // Sort: mutuals (you follow them back) first
            const sorted = res.data.followers.slice().sort((a, b) => {
                const aScore = a.viewer?.following ? 1 : 0;
                const bScore = b.viewer?.following ? 1 : 0;
                return bScore - aScore;
            });

            if (loadMore) {
                setActorFollowers((prev: any[]) => [...prev, ...sorted]);
            } else {
                setActorFollowers(sorted);
            }

            followersCursorRef.current = res.data.cursor;
            hasMoreFollowersRef.current = !!res.data.cursor;
        } catch (e) {
            console.error("Failed to fetch followers:", e);
            if (!loadMore) setActorFollowers([]);
        }
    }, [agent, actor, setActorFollowers]);

    const fetchActorFollowing = useCallback(async (actorHandle?: string, loadMore = false) => {
        const targetActor = actorHandle || actor;
        if (!agent || !targetActor) return;
        if (loadMore && !hasMoreFollowingRef.current) return;

        try {
            const res = await agent.getFollows({
                actor: targetActor,
                limit: 15,
                cursor: loadMore ? followingCursorRef.current : undefined,
            });

            // Sort: mutuals (they follow you back) first
            const sorted = res.data.follows.slice().sort((a, b) => {
                const aScore = a.viewer?.followedBy ? 1 : 0;
                const bScore = b.viewer?.followedBy ? 1 : 0;
                return bScore - aScore;
            });

            if (loadMore) {
                setActorFollowing((prev: any[]) => [...prev, ...sorted]);
            } else {
                setActorFollowing(sorted);
            }

            followingCursorRef.current = res.data.cursor;
            hasMoreFollowingRef.current = !!res.data.cursor;
        } catch (e) {
            console.error("Failed to fetch following:", e);
            if (!loadMore) setActorFollowing([]);
        }
    }, [agent, actor, setActorFollowing]);

    const fetchActorLists = useCallback(async (actorHandle?: string, loadMore = false) => {
        const targetActor = actorHandle || actor;
        if (!agent || !targetActor) return;
        if (loadMore && !hasMoreListsRef.current) return;

        try {
            const res = await agent.app.bsky.graph.getLists({
                actor: targetActor,
                limit: 15,
                cursor: loadMore ? listsCursorRef.current : undefined,
            });

            if (loadMore) {
                setActorLists((prev: any[]) => [...prev, ...res.data.lists]);
            } else {
                setActorLists(res.data.lists);
            }

            listsCursorRef.current = res.data.cursor;
            hasMoreListsRef.current = !!res.data.cursor;
        } catch (e) {
            console.error("Failed to fetch lists:", e);
            if (!loadMore) setActorLists([]);
        }
    }, [agent, actor, setActorLists]);

    // Reset cursors when actor changes
    const resetActorCursors = useCallback(() => {
        followersCursorRef.current = undefined;
        followingCursorRef.current = undefined;
        listsCursorRef.current = undefined;
        hasMoreFollowersRef.current = true;
        hasMoreFollowingRef.current = true;
        hasMoreListsRef.current = true;
    }, []);

    return {
        fetchActorFollowers,
        fetchActorFollowing,
        fetchActorLists,
        resetActorCursors,
        hasMoreFollowers: () => hasMoreFollowersRef.current,
        hasMoreFollowing: () => hasMoreFollowingRef.current,
        hasMoreLists: () => hasMoreListsRef.current,
    };
}
