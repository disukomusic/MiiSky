import React from 'react';
import { Virtuoso } from 'react-virtuoso';
// 1. Import repeatedElement
import { DataProvider, repeatedElement } from '@plasmicapp/host';

export interface VirtualFeedProps {
    className?: string;
    items?: any[];
    children?: React.ReactNode;
    onEndReached?: () => void;
}

export function VirtualFeed({
                                className,
                                items = [],
                                children,
                                onEndReached
                            }: VirtualFeedProps) {

    if (!items || items.length === 0) {
        return <div className={className}>No posts found.</div>;
    }

    return (
        <Virtuoso
            className={className}
            useWindowScroll
            data={items}
            endReached={onEndReached}
            itemContent={(index, item) => (
                <DataProvider name="currentItem" data={item}>
                    <DataProvider name="currentIndex" data={index}>
                        <div style={{ paddingBottom: '16px' }}>
                            {/* 2. Wrap children in repeatedElement */}
                            {repeatedElement(index, children)}
                        </div>
                    </DataProvider>
                </DataProvider>
            )}
        />
    );
}