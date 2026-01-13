
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

    //fix punctuation that renders weird in the font
    const normalizedText = record.text.replace(/[\u2018\u2019\u02BC]/g, "'");
    
    const rt = new RichText({   
        text: normalizedText,
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
                    onClick={() => onTagClick?.(tag)}
                    onKeyDown={(e) =>
                        (e.key === 'Enter' || e.key === ' ') && onTagClick?.(tag)
                    }
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
                <span key={key} style={{ color: '#61C1DF' }}>
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
