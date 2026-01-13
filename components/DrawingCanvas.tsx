// components/DrawingCanvas.tsx
import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { DataProvider } from '@plasmicapp/host';

interface DrawingCanvasProps {
    canvasWidth?: number;
    canvasHeight?: number;
    brushSize?: number;
    brushSizeLarge?: number;
    colors?: string[];
    onDrawingSubmit?: (imageBlob: Blob) => void;
    onDrawingChange?: (imageBlob: Blob) => void;
    toolbar?: React.ReactNode;
    colorPalette?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
}

export const DrawingCanvas = forwardRef((props: DrawingCanvasProps, ref) => {
    const {
        canvasWidth = 320,
        canvasHeight = 120,
        brushSize = 2,
        brushSizeLarge = 6,
        colors = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'],
        onDrawingSubmit,
        onDrawingChange,
        toolbar,
        colorPalette,
        children,
        className,
    } = props;

    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const blobRef = useRef<Blob | null>(null); // Store blob in ref to avoid re-renders
    const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [currentColor, setColor] = useState(colors[0] || '#000000');
    const [currentTool, setTool] = useState<'pen' | 'eraser'>('pen');
    const [currentBrushSize, setCurrentBrushSize] = useState<'small' | 'large'>('small');
    const [hasDrawing, setHasDrawing] = useState(false);

    const prevPointRef = useRef<{ x: number; y: number } | null>(null);

    // Initialize canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Disable all browser smoothing
        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }, [canvasWidth, canvasHeight]);
    
    
    const getCanvasCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        if ('touches' in e) {
            const touch = e.touches[0];
            return {
                x: (touch.clientX - rect.left) * scaleX,
                y: (touch.clientY - rect.top) * scaleY,
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }, []);

    const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCanvasCoords(e);
        const size = currentBrushSize === 'large' ? brushSizeLarge : brushSize;

        ctx.fillStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;

        const prev = prevPointRef.current;
        if (!prev) {
            // First stamp for this stroke
            ctx.fillRect(Math.floor(x - size / 2), Math.floor(y - size / 2), size, size);
            prevPointRef.current = { x, y };
            setHasDrawing(true);
            return;
        }

        const dx = x - prev.x;
        const dy = y - prev.y;
        const dist = Math.hypot(dx, dy);

        // Step size: smaller -> more stamps -> denser line
        const step = Math.max(1, size / 2); // try size/3 if you still see gaps
        const steps = Math.ceil(dist / step);

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const xi = prev.x + dx * t;
            const yi = prev.y + dy * t;
            ctx.fillRect(Math.floor(xi - size / 2), Math.floor(yi - size / 2), size, size);
        }

        prevPointRef.current = { x, y };
        setHasDrawing(true);
    }, [isDrawing, currentColor, currentTool, currentBrushSize, brushSize, brushSizeLarge, getCanvasCoords]);


    const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        setIsDrawing(true);
        draw(e);
    }, [draw]);

    
    const stopDrawing = useCallback(() => {
        setIsDrawing(false);
        prevPointRef.current = null;

        const canvas = canvasRef.current;
        if (canvas) {
            canvas.toBlob((blob) => {
                blobRef.current = blob;
                setCurrentBlob(blob); // Store in state for DataProvider
            }, 'image/png');
        }
    }, []);

    // Update blob ref without triggering re-renders
    const updateBlobRef = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.toBlob((blob) => {
            if (blob) {
                blobRef.current = blob;
            }
        }, 'image/png');
    }, []);

    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasDrawing(false);
        blobRef.current = null;
    }, []);

    // Get blob synchronously from ref, or generate if needed
    const getDrawingBlob = useCallback((): Promise<Blob | null> => {
        return new Promise((resolve) => {
            if (blobRef.current) {
                resolve(blobRef.current);
                return;
            }

            const canvas = canvasRef.current;
            if (!canvas) {
                resolve(null);
                return;
            }

            canvas.toBlob((blob) => {
                blobRef.current = blob;
                resolve(blob);
            }, 'image/png');
        });
    }, []);

    const submitDrawing = useCallback(async () => {
        const blob = await getDrawingBlob();
        if (blob && onDrawingSubmit) {
            onDrawingSubmit(blob);
        }
    }, [getDrawingBlob, onDrawingSubmit]);

    useImperativeHandle(ref, () => ({
        submit: submitDrawing,
        clear: clearCanvas,
        setTool,
        setBrushSize: setCurrentBrushSize,
        setColor,
        getBlob: getDrawingBlob, // Expose getter for direct access
    }), [submitDrawing, clearCanvas, getDrawingBlob]);

    const contextData = {
        currentColor,
        currentTool,
        currentBrushSize,
        hasDrawing,
        colors,
        currentBlob,
    };

    return (
        <DataProvider name="drawingCanvas" data={contextData}>
            <div ref={containerRef} className={className}>
                {toolbar}
                <canvas
                    ref={canvasRef}
                    width={canvasWidth}
                    height={canvasHeight}
                    style={{ cursor: 'crosshair', imageRendering: 'pixelated', width: '100%', height: 'auto', touchAction: 'none' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
                {colorPalette}
                {children}
            </div>
        </DataProvider>
    );
});

DrawingCanvas.displayName = 'DrawingCanvas';
