import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useBluesky } from "@/lib/BlueskyAuthProvider";

export default function OAuthCallback() {
    const router = useRouter();
    const { isLoggedIn } = useBluesky();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check for OAuth error in URL params
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get("error");

        if (oauthError) {
            setError(params.get("error_description") || oauthError);
            return;
        }

        // If logged in, redirect to main page
        if (isLoggedIn) {
            router.replace("/");
        }
    }, [isLoggedIn, router]);

    if (error) {
        return (
            <div style={{ padding: 24 }}>
                <h1>Login Failed</h1>
                <p>{error}</p>
                <a href="/">Return to app</a>
            </div>
        );
    }

    return (
        <div style={{ padding: 24 }}>
            <h1>Signing you in…</h1>
            <p>Processing authentication...</p>
            <a href="/">If this doesn't redirect automatically, click here.</a>
        </div>
    );
}
