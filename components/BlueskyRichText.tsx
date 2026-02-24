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

export const BlueskyRichText: React.FC<BlueskyRichTextProps> = ({
                                                                    record,
                                                                    fontSize = 12,
                                                                    onTagClick,
                                                                    className,
                                                                }) => {
    if (!record) return null;

    //ATProto facets rely on exact UTF-8 byte offsets from the original text string. Mutating the string breaks them.
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
                    //Stop event bubbling so the parent Post component doesn't trigger
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: '#61C1DF', textDecoration: 'underline' }}
                >
                    {segment.text}
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
                        e.stopPropagation(); // FIX 2: Stop bubbling
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
                    {segment.text}
                </span>
            );
        } else if (segment.isMention()) {
            nodes.push(
                <span
                    key={key}
                    style={{ color: '#61C1DF', cursor: 'pointer' }}
                    // Added stopPropagation here as well, in case you eventually 
                    // add an onMentionClick handler to navigate to user profiles.
                    onClick={(e) => e.stopPropagation()}
                >
                    {segment.text}
                </span>
            );
        } else {
            nodes.push(<span key={key}>{segment.text}</span>);
        }
    }

    return (
        <div className={className} style={{ whiteSpace: 'pre-wrap', fontSize }}>
            {nodes}
        </div>
    );
};