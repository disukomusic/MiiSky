import {BlueskyAuthProvider} from '@/lib/BlueskyAuthProvider';

export default function RootLayout({children}: {children: React.ReactNode}) {
    return (
        <html>
        <body>
        <BlueskyAuthProvider>{children}</BlueskyAuthProvider>
        </body>
        </html>
    );
}
