import type { AppProps } from 'next/app';
import { BlueskyAuthProvider } from '@/lib/BlueskyAuthProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import '../styles/globals.css'

export default function MyApp({ Component, pageProps }: AppProps) {
    // Initialize the client inside the component so it doesn't share cache across SSR requests
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                // Keep data fresh, but don't aggressively refetch on every window focus
                refetchOnWindowFocus: false,
                staleTime: 1000 * 60 * 2, // 2 minutes
            },
        },
    }));

    return (
        <QueryClientProvider client={queryClient}>
            <BlueskyAuthProvider>
                <Component {...pageProps} />
            </BlueskyAuthProvider>
        </QueryClientProvider>
    );
}