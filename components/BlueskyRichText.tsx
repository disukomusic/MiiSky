import React from 'react';
import { RichText } from '@atproto/api';

interface BlueskyRichTextProps {
    record: {
        text: string;
        facets?: any[];
    };
    onTagClick?: (tag: string) => void;
    className?: string;
    fontSize?: number;
}

// Helper function to fix the weird font rendering for smart quotes
const fixDisplayQuotes = (text: string | undefined) => {
    if (!text) return '';
    return text.replace(/[\u2018\u2019\u02BC]/g, "'");
};

export const BlueskyRichText: React.FC<BlueskyRichTextProps> = ({
                                                                    record,
                                                                    fontSize = 12,
                                                                    onTagClick,
                                                                    className,
                                                                }) => {
    if (!record) return null;

    // 1. Pass the RAW text to the parser so the byte-offsets for facets stay perfectly aligned
    const rt = new RichText({
        text: record.text,
        facets: record.facets,
    });

    const nodes: React.ReactNode[] = [];
    let i = 0;

    for (const segment of rt.segments()) {
        const key =
            typeof (segment as any).posStart === 'number' &&
            typeof (segment as any).posEnd === 'number'
                ? `${(segment as any).posStart}-${(segment as any).posEnd}`
                : `${i++}`;

        if (segment.isLink()) {
            nodes.push(
                <a
                    key={key}
                    href={segment.link?.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: '#61C1DF', textDecoration: 'underline' }}
                >
                    {fixDisplayQuotes(segment.text)}
                </a>
            );
        } else if (segment.isTag()) {
            const tag = segment.tag?.tag ?? segment.text?.replace(/^#/, '') ?? '';
            nodes.push(
                <span
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                        e.stopPropagation();
                        onTagClick?.(tag);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            onTagClick?.(tag);
                        }
                    }}
                    style={{
                        color: '#61C1DF',
                        cursor: 'pointer',
                        fontWeight: 600,
                    }}
                >
                    {fixDisplayQuotes(segment.text)}
                </span>
            );
        } else if (segment.isMention()) {
            nodes.push(
                <span
                    key={key}
                    style={{ color: '#61C1DF', cursor: 'pointer' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {fixDisplayQuotes(segment.text)}
                </span>
            );
        } else {
            nodes.push(<span key={key}>{fixDisplayQuotes(segment.text)}</span>);
        }
    }

    return (
        <div className={className} style={{ whiteSpace: 'pre-wrap', fontSize }}>
            {nodes}
        </div>
    );
};