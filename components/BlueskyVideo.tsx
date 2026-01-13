import React, { useEffect, useRef } from 'react';

export const BlueskyVideo = ({ playlistUrl, thumbnail }: { playlistUrl?: string, thumbnail?: string }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !playlistUrl) return;

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = playlistUrl;
        }
        else {
            import('hls.js').then((HlsModule) => {
                const Hls = HlsModule.default;
                if (Hls.isSupported()) {
                    const hls = new Hls();
                    hls.loadSource(playlistUrl);
                    hls.attachMedia(video);
                }
            }).catch(err => {
                console.error("Failed to load hls.js", err);
            });
        }
    }, [playlistUrl]);

    if (!playlistUrl) return null;

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '8px', 
            overflow: 'hidden',
            border: '2px solid #979797' 
        }}>
            <video
                ref={videoRef}
                poster={thumbnail}
                controls
                style={{
                    width: '100%',
                    borderRadius: '6px', 
                    aspectRatio: '16/9',
                    backgroundColor: '#111',
                    display: 'block',
                    objectFit: 'cover'
                }}
            />
        </div>
    );
};