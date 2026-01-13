import * as React from 'react';

// 1. Define the actions you want to expose
export interface AutoScrollRef {
    scrollTo: () => void;
}

export interface AutoScrollDivProps {
    behavior?: ScrollBehavior;
    block?: 'start' | 'center' | 'end';
    offset?: number;
    className?: string;
    children?: React.ReactNode;
    disabled?: boolean;
    /** If true, scrolls automatically when the page loads. */
    scrollOnMount?: boolean;
}

// 2. Wrap in forwardRef
export const AutoScrollDiv = React.forwardRef<AutoScrollRef, AutoScrollDivProps>(({
                                                                                      behavior = 'smooth',
                                                                                      block = 'start',
                                                                                      offset = 0,
                                                                                      className,
                                                                                      children,
                                                                                      disabled = false,
                                                                                      scrollOnMount = true,
                                                                                  }, ref) => {
    const domRef = React.useRef<HTMLDivElement>(null);

    // 3. Extract the scroll logic into a reusable function
    const performScroll = React.useCallback(() => {
        const element = domRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const viewportHeight = window.innerHeight;

        let targetY = 0;

        if (block === 'start') {
            targetY = rect.top + scrollTop;
        } else if (block === 'center') {
            targetY = rect.top + scrollTop - (viewportHeight / 2) + (rect.height / 2);
        } else if (block === 'end') {
            targetY = rect.top + scrollTop - viewportHeight + rect.height;
        }

        window.scrollTo({
            top: targetY + offset,
            behavior: behavior,
        });
    }, [behavior, block, offset]);

    // 4. Expose the 'scrollTo' method to Plasmic
    React.useImperativeHandle(ref, () => ({
        scrollTo: performScroll
    }));

    // 5. Handle the automatic "on load" scroll
    React.useEffect(() => {
        if (disabled || !scrollOnMount) return;

        // Small delay to allow layout to settle
        const timer = setTimeout(() => {
            performScroll();
        }, 200);

        return () => clearTimeout(timer);
    }, [disabled, scrollOnMount, performScroll]);

    return (
        <div ref={domRef} className={className}>
            {children}
        </div>
    );
});

AutoScrollDiv.displayName = 'AutoScrollDiv';