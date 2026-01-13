"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {Agent, AtpAgent} from "@atproto/api";
import { useOAuth } from "@/lib/useOauth";

type BlueskySessionCtx = {
    agent: any;
    isLoggedIn: boolean;
    isDevMode: boolean;
    currentUser: any | null;
    login: (identifier: string, appPassword?: string) => Promise<void>;
    logout: () => Promise<void>;
};

const BlueskyCtx = createContext<BlueskySessionCtx | null>(null);

const CLIENT_ID =
    process.env.NEXT_PUBLIC_ATPROTO_CLIENT_ID || "https://wii.suko.pet/client-metadata.json";

// Detect Plasmic editor environment
export const isInPlasmicEditor = () => {
    if (typeof window === "undefined") return false;
    return (
        window.location.hostname === "studio.plasmic.app" ||
        window.parent !== window ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "localhost"
    );
};

export function BlueskyAuthProvider({ children }: { children: React.ReactNode }) {
    const { agent: oauthAgent, session, isInitializing, signIn, signOut, client } = useOAuth({
        clientId: CLIENT_ID,
        handleResolver: "https://bsky.social",
        responseMode: "query",
        getScope: () => "atproto transition:generic transition:chat.bsky",
    });

    const [currentUser, setCurrentUser] = useState<any | null>(null);
    const [hasFetchedUser, setHasFetchedUser] = useState(false);
    const [devMode, setDevMode] = useState(false);
    const [devAgent, setDevAgent] = useState<Agent | null>(null);

    // Restore dev session on mount
    useEffect(() => {
        if (!isInPlasmicEditor()) return;

        const storedSession = localStorage.getItem("bluesky_dev_session");
        if (storedSession) {
            try {
                const { identifier, password } = JSON.parse(storedSession);
                loginWithAppPassword(identifier, password);
            } catch (e) {
                localStorage.removeItem("bluesky_dev_session");
            }
        }
    }, []);
    
    const loginWithAppPassword = async (identifier: string, password: string) => {
        const agent = new AtpAgent({ service: "https://bsky.social" });
        await agent.login({ identifier, password });

        setDevAgent(agent);
        setDevMode(true);

        // Store for session persistence (only in dev/Plasmic)
        if (isInPlasmicEditor()) {
            localStorage.setItem("bluesky_dev_session", JSON.stringify({ identifier, password }));
        }

        // Fetch profile
        try {
            const profile = await agent.getProfile({ actor: agent.session?.did || identifier });
            setCurrentUser(profile.data);
        } catch (err) {
            console.error("Failed to fetch dev profile:", err);
        }
    };


    const activeAgent = devMode ? devAgent : oauthAgent;
    const isLoggedIn = devMode ? !!devAgent : (!!oauthAgent && !!session && !isInitializing);

    useEffect(() => {
        if (devMode || !oauthAgent || !session || hasFetchedUser) {
            if (!session && !devMode) {
                setCurrentUser(null);
                setHasFetchedUser(false);
            }
            return;
        }

        (async () => {
            try {
                const profile = await oauthAgent.getProfile({ actor: session.did });
                setCurrentUser(profile.data);
                setHasFetchedUser(true);
            } catch (err) {
                console.error("Failed to fetch profile:", err);
            }
        })();
    }, [oauthAgent, session, hasFetchedUser, devMode]);

    const login = async (identifier: string, appPassword?: string) => {
        
        console.log("LOGIN CLICKED: session =", session, "client =", client);
        
        if (appPassword || isInPlasmicEditor()) {
            if (!appPassword) {
                throw new Error("App password required in Plasmic editor");
            }
            await loginWithAppPassword(identifier, appPassword);
            return;
        }

        await signIn(identifier);
    };

    const logout = async () => {
        if (devMode) {
            localStorage.removeItem("bluesky_dev_session");
            setDevAgent(null);
            setDevMode(false);
            setCurrentUser(null);
            return;
        }
        await signOut();
        setCurrentUser(null);
    };

    const value = useMemo(
        () => ({ agent: activeAgent, isLoggedIn, isDevMode: devMode, currentUser, login, logout }),
        [activeAgent, isLoggedIn, devMode, currentUser]
    );

    return <BlueskyCtx.Provider value={value}>{children}</BlueskyCtx.Provider>;
}

export function useBluesky() {
    const ctx = useContext(BlueskyCtx);
    if (!ctx) throw new Error("useBluesky must be used inside BlueskyAuthProvider");
    return ctx;
}
