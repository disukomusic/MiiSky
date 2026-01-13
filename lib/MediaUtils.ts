/**
 * Compresses an input image Blob to stay under a target size (in MB).
 *
 * Strategy:
 * 1) Decode the image into an HTMLImageElement (browser decode pipeline).
 * 2) Resize down to a max dimension (default 2000px) while preserving aspect ratio.
 * 3) Inspect whether the image has transparency (alpha) by sampling pixels.
 * 4) Choose output format:
 *    - If alpha exists AND `preserveTransparency` is true => encode as PNG
 *    - Otherwise => encode as JPEG
 * 5) If JPEG: reduce quality until below `maxSizeMB` (or until hitting min quality)
 * 6) If PNG: PNG ignores quality, so iteratively downscale dimensions until below the limit.
 *
 * Notes / caveats:
 * - This is browser-only code (uses DOM APIs like Image, canvas, atob).
 * - Some formats (e.g., HEIC/HEIF) may decode depending on browser support; if decoding fails,
 *   the promise rejects (currently not caught inside this function).
 * - Transparency detection is a heuristic (sampling) for performance.
 * - PNG output can remain large even after resizing; downscaling loop tries to address that.
 *
 * @param blob The input image data (Blob/File).
 * @param maxSizeMB Target max size in megabytes. Default ~0.95MB.
 * @param opts Optional tuning parameters (dimensions, JPEG quality bounds, downscaling, alpha sampling).
 * @returns A new Blob (JPEG or PNG) that is typically <= maxSizeMB, or best-effort output.
 */
export const compressImage = async (
    blob: Blob,
    maxSizeMB: number = 0.97,
    opts?: {
        /**
         * Maximum width/height (longest side) after the initial resize pass.
         * The image is scaled to fit within this bounding box while preserving aspect ratio.
         * Default: 2000
         */
        maxDimension?: number;

        /**
         * If true, the function tries to preserve transparency.
         * If alpha is detected, output becomes PNG; otherwise JPEG.
         * Default: true
         */
        preserveTransparency?: boolean;

        /**
         * Starting JPEG quality (0..1). Higher means better quality and larger file.
         * Default: 0.82
         */
        jpegQualityStart?: number;

        /**
         * Minimum JPEG quality allowed before giving up and returning whatever we have.
         * Default: 0.5
         */
        jpegQualityMin?: number;

        /**
         * Downscaling multiplier for PNG path (alpha images), applied repeatedly.
         * Example: 0.9 means each step reduces dimensions to 90%.
         * Default: 0.9
         */
        downscaleStep?: number;

        /**
         * Performance knob for alpha detection.
         * We sample every N pixels (in a linear scan) instead of every pixel.
         * Higher => faster but less accurate.
         * Default: 16
         */
        alphaSampleStride?: number;
    }
): Promise<Blob> => {
    const {
        maxDimension = 4096,
        preserveTransparency = true,
        jpegQualityStart = 0.9,
        jpegQualityMin = 0.5,
        downscaleStep = 0.95,
        alphaSampleStride = 16,
    } = opts ?? {};

    /** Convert MB target to byte target. */
    const maxBytes = maxSizeMB * 1024 * 1024;

    if (blob.size <= maxBytes) {
        console.log("Image is under limit, skipping compression entirely.");
        return blob;
    }
    
    /**
     * Helper: Promisified canvas.toBlob().
     * - `quality` is used for lossy formats (e.g. JPEG); ignored by PNG.
     * - Can return null in some edge cases (older browsers, memory issues, etc).
     */
    const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
        new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), type, quality);
        });

    /**
     * Helper: Decode a Blob into an HTMLImageElement.
     * Uses an object URL to avoid base64 overhead.
     * Cleans up the object URL on load/error to prevent memory leaks.
     */
    const loadImage = (b: Blob) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(b);

            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };

            img.onerror = (e) => {
                URL.revokeObjectURL(url);
                reject(e);
            };

            img.src = url;
        });

    /**
     * Helper: Detect whether the drawn image contains transparency.
     *
     * Implementation details:
     * - Reads canvas pixel data (RGBA).
     * - Checks alpha channel values (A) by sampling every N pixels for speed.
     * - If any sampled alpha < 255 => treat as alpha-present.
     *
     * Failure modes:
     * - getImageData can throw for security reasons (tainted canvas),
     *   but since we're drawing from a Blob we created locally, it’s usually safe.
     * - If it throws, we conservatively assume "no alpha" (keeps behavior simple).
     */
    const hasAlpha = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        try {
            const { data } = ctx.getImageData(0, 0, w, h);

            // Check alpha channel every N pixels for speed.
            // data layout: [R,G,B,A, R,G,B,A, ...]
            const stride = Math.max(1, alphaSampleStride);
            for (let i = 3; i < data.length; i += 4 * stride) {
                if (data[i] < 255) return true;
            }
        } catch {
            // If getImageData fails for any reason, assume no alpha.
            // (You could choose the opposite, but that would force PNG more often.)
        }
        return false;
    };

    /**
     * Decode the input image Blob.
     * NOTE: This will reject if the browser cannot decode the format.
     */
    const img = await loadImage(blob);

    /**
     * Compute resize dimensions:
     * - Keep aspect ratio
     * - Only shrink if either side exceeds maxDimension
     */
    let width = img.width;
    let height = img.height;

    const needsInitialResize = blob.size > maxBytes || width > maxDimension || height > maxDimension;

    if (needsInitialResize && (width > maxDimension || height > maxDimension)) {
        if (width > height) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
        } else {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
        }
    }
    
    /**
     * Draw resized image to canvas.
     * Canvas is our staging area for:
     * - alpha inspection
     * - encoding to JPEG/PNG
     * - iterative downscaling (PNG path)
     */
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return blob; // If canvas context isn't available, return original.

    // Draw once without background so we can check for transparency.
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    /**
     * If we care about preserving transparency, sample alpha.
     * If we don't, we skip detection and treat as opaque.
     */
    const alphaPresent = preserveTransparency ? hasAlpha(ctx, width, height) : false;

    /**
     * Decide output MIME type:
     * - Transparent images => PNG (lossless + alpha)
     * - Opaque images => JPEG (smaller for photos / non-alpha)
     */
    const outType = alphaPresent ? "image/png" : "image/jpeg";
    
    /**
     * If we're outputting JPEG, paint a background.
     * JPEG has no alpha; without a background, some pipelines show black or unexpected colors.
     *
     * We use destination-over so it only fills behind existing pixels.
     */
    if (outType === "image/jpeg") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }

    /**
     * 1) JPEG path: adjust quality down until size <= maxBytes,
     * or until we hit the minimum quality threshold.
     */
    if (outType === "image/jpeg") {
        let quality = jpegQualityStart;

        while (true) {
            const out = await canvasToBlob(canvas, outType, quality);
            if (!out) return blob; // Best effort fallback

            // Success condition: small enough OR we won't reduce quality further.
            if (out.size <= maxBytes || quality <= jpegQualityMin) return out;

            // Step quality down in coarse increments.
            quality = Math.max(jpegQualityMin, quality - 0.05);
        }
    }

    /**
     * 2) PNG path (alpha): PNG ignores the "quality" param.
     * If the PNG is too large, we must reduce dimensions.
     */
    let out = await canvasToBlob(canvas, outType);
    if (!out || out.size <= maxBytes) return out ?? blob;

    /**
     * Iterative downscale loop:
     * - Start from the initial resized canvas
     * - Repeatedly shrink by `downscaleStep` until file <= maxBytes
     * - Stop if image becomes too small (MIN_DIM guard)
     */
    let curCanvas = canvas;
    let curW = width;
    let curH = height;

    // Prevent infinite loops / tiny thumbnails.
    const MIN_DIM = 320;

    while (out.size > maxBytes && curW > MIN_DIM && curH > MIN_DIM) {
        curW = Math.round(curW * downscaleStep);
        curH = Math.round(curH * downscaleStep);

        const nextCanvas = document.createElement("canvas");
        nextCanvas.width = curW;
        nextCanvas.height = curH;

        const nextCtx = nextCanvas.getContext("2d");
        if (!nextCtx) return out; // Return best effort output so far

        nextCtx.clearRect(0, 0, curW, curH);
        nextCtx.drawImage(curCanvas, 0, 0, curW, curH);

        curCanvas = nextCanvas;

        // If toBlob returns null, keep the previous `out` as best effort.
        out = (await canvasToBlob(curCanvas, outType)) ?? out;
    }

    // Return best effort result: either fits, or we hit the minimum dimension guard.
    return out;
};

/**
 * Converts a base64 string into a Blob.
 *
 * Accepts:
 * - Raw base64: "iVBORw0KGgoAAA..."
 * - Data URL:   "data:image/png;base64,iVBORw0KGgoAAA..."
 *
 * Note: This uses `atob`, so it is intended for browser environments.
 */
function base64ToBlob(base64: string, mime = "application/octet-stream"): Blob {
    // base64 might be raw ("iVBORw0...") OR a data URL ("data:image/png;base64,iVBORw0...")
    const pure = base64.includes("base64,") ? base64.split("base64,")[1] : base64;

    // Decode base64 to a binary string, then to bytes.
    const byteStr = atob(pure);
    const len = byteStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = byteStr.charCodeAt(i);

    return new Blob([bytes], { type: mime });
}

/**
 * Attempts to coerce a "maybe image" value (from various UI libs / uploaders)
 * into a real Blob/File.
 *
 * Why this exists:
 * Different upload components store the underlying file in different properties:
 * - Direct Blob/File (already good)
 * - Ant Design / rc-upload: originFileObj or file
 * - Other libs: raw/blob
 * - Sometimes: base64 string stored in `contents`
 * - Sometimes: data URL stored in `thumbUrl`
 *
 * This helper makes your media pipeline resilient to those differences.
 *
 * @param img Any value that might contain an image payload
 * @returns A Blob if one can be extracted/constructed, else null
 */
export function coerceToBlob(img: any): Blob | null {
    if (!img) return null;

    // Already a Blob/File (handle both direct and proxy-wrapped)
    if (img instanceof Blob) return img;

    // Check if it looks like a Blob (duck typing for Proxy-wrapped Blobs)
    if (img.size !== undefined && img.type !== undefined && typeof img.slice === 'function') {
        // It's likely a Blob wrapped in a Proxy
        return img as Blob;
    }

    // Ant Design / rc-upload commonly stores the File here:
    if (img.originFileObj instanceof Blob) return img.originFileObj;
    if (img.originFileObj?.size !== undefined && typeof img.originFileObj?.slice === 'function') {
        return img.originFileObj as Blob;
    }

    if (img.file instanceof Blob) return img.file;
    if (img.file?.size !== undefined && typeof img.file?.slice === 'function') {
        return img.file as Blob;
    }

    // Some libs provide `raw` or `blob`.
    if (img.raw instanceof Blob) return img.raw;
    if (img.blob instanceof Blob) return img.blob;

    // Your case: has `contents` base64 string.
    if (typeof img.contents === "string" && img.contents.length > 0) {
        return base64ToBlob(img.contents, img.type || "application/octet-stream");
    }

    // Sometimes a thumbUrl is a data URL.
    if (typeof img.thumbUrl === "string" && img.thumbUrl.startsWith("data:")) {
        const mimeMatch = img.thumbUrl.match(/^data:(.*?);base64,/);
        const mime = mimeMatch?.[1] || img.type || "application/octet-stream";
        return base64ToBlob(img.thumbUrl, mime);
    }

    // Unknown shape; caller can handle null.
    return null;
}
