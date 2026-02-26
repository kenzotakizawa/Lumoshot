import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from 'fabric';

interface RulerProps {
    fabricCanvas: React.RefObject<Canvas | null>;
    zoomLevel: number;
    wrapperRef: React.RefObject<HTMLDivElement | null>;
}

const Ruler: React.FC<RulerProps> = ({ fabricCanvas, zoomLevel, wrapperRef }) => {
    const horizontalRef = useRef<HTMLCanvasElement>(null);
    const verticalRef = useRef<HTMLCanvasElement>(null);
    const [mousePos, setMousePos] = useState({ x: -1, y: -1 });
    const scrollPos = useRef({ x: 0, y: 0 });

    const MARK_SHORT = 4;
    const MARK_LONG = 8;
    const NUM_STEP = 100;

    useEffect(() => {
        const renderRulers = () => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;

            const hCtx = horizontalRef.current?.getContext('2d');
            const vCtx = verticalRef.current?.getContext('2d');
            if (!hCtx || !vCtx) return;

            const vpt = canvas.viewportTransform;
            if (!vpt) return;

            // Use native wrapper scroll for panning
            const panX = -scrollPos.current.x;
            const panY = -scrollPos.current.y;

            const hCanvas = horizontalRef.current!;
            const vCanvas = verticalRef.current!;

            // Size matching CSS
            const width = hCanvas.parentElement?.clientWidth || 2000;
            const height = vCanvas.parentElement?.clientHeight || 2000;

            // Set internal resolution
            const scale = window.devicePixelRatio || 1;
            hCanvas.width = width * scale;
            hCanvas.height = 20 * scale;
            vCanvas.width = 20 * scale;
            vCanvas.height = height * scale;

            hCtx.scale(scale, scale);
            vCtx.scale(scale, scale);

            // Setup styling
            const strokeColor = 'rgba(0,0,0,0.3)';
            const textColor = 'rgba(0,0,0,0.5)';
            const font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';

            hCtx.clearRect(0, 0, width, 20);
            vCtx.clearRect(0, 0, 20, height);

            hCtx.strokeStyle = strokeColor;
            hCtx.fillStyle = textColor;
            hCtx.font = font;
            hCtx.textBaseline = 'middle';
            hCtx.textAlign = 'center';

            vCtx.strokeStyle = strokeColor;
            vCtx.fillStyle = textColor;
            vCtx.font = font;
            vCtx.textBaseline = 'middle';
            vCtx.textAlign = 'center';

            // Calculate start and end points in canvas coordinates
            const startX = -panX / zoomLevel;
            const endX = startX + width / zoomLevel;
            const startY = -panY / zoomLevel;
            const endY = startY + height / zoomLevel;

            // Draw Horizontal Ruler
            hCtx.beginPath();
            // Start rendering slightly before startX to avoid clipping edges
            for (let x = Math.floor(startX / 10) * 10 - 100; x <= endX + 100; x += 10) {
                const screenX = x * zoomLevel + panX;
                if (screenX < -50 || screenX > width + 50) continue; // Skip offscreen

                const isMajor = x % NUM_STEP === 0;
                const isMid = x % 50 === 0 && !isMajor;

                let markLen = MARK_SHORT;
                if (isMajor) markLen = 14;
                else if (isMid) markLen = MARK_LONG;

                hCtx.moveTo(screenX, 20);
                hCtx.lineTo(screenX, 20 - markLen);

                if (isMajor) {
                    hCtx.fillText(x.toString(), screenX + 2, 8);
                }
            }
            hCtx.stroke();

            // Draw Vertical Ruler
            vCtx.beginPath();
            for (let y = Math.floor(startY / 10) * 10 - 100; y <= endY + 100; y += 10) {
                const screenY = y * zoomLevel + panY;
                if (screenY < -50 || screenY > height + 50) continue; // Skip offscreen

                const isMajor = y % NUM_STEP === 0;
                const isMid = y % 50 === 0 && !isMajor;

                let markLen = MARK_SHORT;
                if (isMajor) markLen = 14;
                else if (isMid) markLen = MARK_LONG;

                vCtx.moveTo(20, screenY);
                vCtx.lineTo(20 - markLen, screenY);

                if (isMajor) {
                    vCtx.save();
                    vCtx.translate(8, screenY + 2);
                    vCtx.rotate(-Math.PI / 2);
                    vCtx.fillText(y.toString(), 0, 0);
                    vCtx.restore();
                }
            }
            vCtx.stroke();

            // Draw Tracker
            if (mousePos.x >= 0 && mousePos.y >= 0) {
                // Adjust tracker for scroll position
                const trackerX = mousePos.x + panX;
                const trackerY = mousePos.y + panY;

                // Horizontal Tracker
                hCtx.fillStyle = 'rgba(239, 68, 68, 0.7)'; // Red-500 equivalent
                hCtx.fillRect(trackerX - 1, 0, 2, 20);

                // Vertical Tracker
                vCtx.fillStyle = 'rgba(239, 68, 68, 0.7)';
                vCtx.fillRect(0, trackerY - 1, 20, 2);
            }
        };

        renderRulers();

        // Bind events if canvas exists
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        const onMouseMove = (e: any) => {
            const pointer = canvas.getScenePoint(e.e); // absolute pointer
            const vpt = canvas.viewportTransform;
            if (vpt) {
                setMousePos({
                    x: pointer.x * zoomLevel + vpt[4],
                    y: pointer.y * zoomLevel + vpt[5]
                });
            }
        };

        const onMouseLeave = () => setMousePos({ x: -1, y: -1 });
        const onCanvasChange = () => renderRulers();

        const handleScroll = (e: Event) => {
            const target = e.target as HTMLDivElement;
            scrollPos.current = { x: target.scrollLeft, y: target.scrollTop };
            renderRulers();
        };

        const wrapper = wrapperRef.current;
        if (wrapper) {
            wrapper.addEventListener('scroll', handleScroll);
        }

        // Wrap resize observer to handle window resizes
        const ro = new ResizeObserver(() => renderRulers());
        if (horizontalRef.current?.parentElement) {
            ro.observe(horizontalRef.current.parentElement);
        }

        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:out', onMouseLeave);
        canvas.on('mouse:wheel', onCanvasChange);
        canvas.on('object:moving', onCanvasChange);
        canvas.on('object:scaling', onCanvasChange);

        return () => {
            if (wrapper) {
                wrapper.removeEventListener('scroll', handleScroll);
            }
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:out', onMouseLeave);
            canvas.off('mouse:wheel', onCanvasChange);
            canvas.off('object:moving', onCanvasChange);
            canvas.off('object:scaling', onCanvasChange);
            ro.disconnect();
        };

    }, [fabricCanvas, zoomLevel, mousePos.x, mousePos.y, wrapperRef]);
    // Usually you don't want mousePos in dep array if taking a lot of renders, 
    // but the canvas drawing is fast enough. An alternative is drawing tracker separately via refs.

    return (
        <>
            <div style={{
                position: 'absolute',
                top: 0,
                left: '20px', // offset for corner
                right: 0,
                height: '20px',
                backgroundColor: '#ffffff',
                borderBottom: '1px solid #e5e7eb',
                zIndex: 40,
                overflow: 'hidden'
            }}>
                <canvas ref={horizontalRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>

            <div style={{
                position: 'absolute',
                top: '20px', // offset for corner
                left: 0,
                bottom: 0,
                width: '20px',
                backgroundColor: '#ffffff',
                borderRight: '1px solid #e5e7eb',
                zIndex: 40,
                overflow: 'hidden'
            }}>
                <canvas ref={verticalRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>

            {/* Corner box */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '20px',
                height: '20px',
                backgroundColor: '#f9fafb',
                borderRight: '1px solid #e5e7eb',
                borderBottom: '1px solid #e5e7eb',
                zIndex: 41
            }} />
        </>
    );
};

export default Ruler;
