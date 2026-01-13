
import type {AppProps} from 'next/app';
import {BlueskyAuthProvider} from '@/lib/BlueskyAuthProvider';
import '../styles/globals.css'

export default function MyApp({Component, pageProps}: AppProps) {
    return (
        <BlueskyAuthProvider>
            <Component {...pageProps} />
        </BlueskyAuthProvider>
    );
}
