import React, { useEffect, useRef, forwardRef } from 'react';

export interface InfiniteScrollTriggerProps {
    triggerDistance?: number; // Changed to a number for easier use in Plasmic
    onScrollEnter?: () => void;
    loading?: boolean;
    hasMore?: boolean;
    className?: string;
}

export const InfiniteScrollTrigger = forwardRef<HTMLDivElement, InfiniteScrollTriggerProps>(
    ({
         triggerDistance = 200,
         onScrollEnter,
         loading = false,
         hasMore = true,
         className,
         ...props
     }, ref) => {
        const internalTriggerRef = useRef<HTMLDivElement>(null);

        const setRefs = (element: HTMLDivElement) => {
            internalTriggerRef.current = element;
            if (typeof ref === 'function') {
                ref(element);
            } else if (ref) {
                ref.current = element;
            }
        };

        const callbackRef = useRef(onScrollEnter);
        useEffect(() => {
            callbackRef.current = onScrollEnter;
        }, [onScrollEnter]);

        const stateRef = useRef({ loading, hasMore });
        useEffect(() => {
            stateRef.current = { loading, hasMore };
        }, [loading, hasMore]);

        useEffect(() => {
            const element = internalTriggerRef.current;
            if (!element) return;

            const observer = new IntersectionObserver(
                (entries) => {
                    const firstEntry = entries[0];
                    const state = stateRef.current;

                    if (firstEntry.isIntersecting && state.hasMore && !state.loading) {
                        if (callbackRef.current) {
                            callbackRef.current();
                        }
                    }
                },
                // Safely format the number into a valid CSS rootMargin string
                { rootMargin: `${triggerDistance}px` }
            );

            observer.observe(element);
            return () => observer.disconnect();
        }, [triggerDistance]); // Re-runs the observer if you change the distance in Plasmic

        return (
            <div
                ref={setRefs}
                className={className}
                {...props}
                style={{ height: '40px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
                {!hasMore && <span style={{ color: '#888' }}>All caught up!</span>}
                {loading && <span style={{ color: '#888' }}>Loading more posts...</span>}
            </div>
        );
    }
);

InfiniteScrollTrigger.displayName = "InfiniteScrollTrigger";