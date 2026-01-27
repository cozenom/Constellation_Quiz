import React, { useEffect, useRef } from 'react';

function ConstellationCanvas({ constellation, showLines, maxMagnitude = 6, rotationAngle = 0, backgroundStars = [], backgroundStarOpacity = 100 }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width = 500;
        const height = canvas.height = 500;

        // Clear canvas
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        const { stars, lines } = constellation;

        // Process coordinates with rotation and bounds fitting (ALWAYS for consistent scaling)
        let processedStars = stars.map(s => ({ ...s }));
        let processedBackgroundStars = backgroundStars ? backgroundStars.map(s => ({ ...s })) : [];

        // Calculate constellation center
        const centerX = stars.reduce((sum, s) => sum + s.x, 0) / stars.length;
        const centerY = stars.reduce((sum, s) => sum + s.y, 0) / stars.length;
        const angleRad = rotationAngle * Math.PI / 180;

        // Rotate all coordinates (constellation stars)
        processedStars = stars.map(star => {
            const dx = star.x - centerX;
            const dy = star.y - centerY;
            const rotatedX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
            const rotatedY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
            return {
                ...star,
                x: rotatedX + centerX,
                y: rotatedY + centerY
            };
        });

        // Rotate background stars around same center
        if (backgroundStars && backgroundStars.length > 0) {
            processedBackgroundStars = backgroundStars.map(star => {
                const dx = star.x - centerX;
                const dy = star.y - centerY;
                const rotatedX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
                const rotatedY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
                return {
                    ...star,
                    x: rotatedX + centerX,
                    y: rotatedY + centerY
                };
            });
        }

        // Find bounding box of rotated constellation
        const minX = Math.min(...processedStars.map(s => s.x));
        const maxX = Math.max(...processedStars.map(s => s.x));
        const minY = Math.min(...processedStars.map(s => s.y));
        const maxY = Math.max(...processedStars.map(s => s.y));

        // Calculate scale to fit within 0-1 range with 10% padding
        const spanX = maxX - minX;
        const spanY = maxY - minY;
        const scale = Math.min(0.9 / spanX, 0.9 / spanY);

        // Normalize and center constellation stars
        processedStars = processedStars.map(star => {
            const scaledX = (star.x - minX) * scale;
            const scaledY = (star.y - minY) * scale;
            const offsetX = (1 - spanX * scale) / 2;
            const offsetY = (1 - spanY * scale) / 2;
            return {
                ...star,
                x: scaledX + offsetX,
                y: scaledY + offsetY
            };
        });

        // Apply same normalization to background stars
        if (backgroundStars && backgroundStars.length > 0) {
            processedBackgroundStars = processedBackgroundStars.map(star => {
                const scaledX = (star.x - minX) * scale;
                const scaledY = (star.y - minY) * scale;
                const offsetX = (1 - spanX * scale) / 2;
                const offsetY = (1 - spanY * scale) / 2;
                return {
                    ...star,
                    x: scaledX + offsetX,
                    y: scaledY + offsetY
                };
            });
        }

        // Draw background stars first (behind constellation)
        if (processedBackgroundStars.length > 0) {
            ctx.globalAlpha = backgroundStarOpacity / 100;

            processedBackgroundStars.forEach(star => {
                const mag = star.mag || 5;
                if (mag > maxMagnitude) return;

                const x = star.x * width;
                const y = (1 - star.y) * height;

                // Skip stars outside visible canvas area
                if (x < -10 || x > width + 10 || y < -10 || y > height + 10) return;

                const radius = Math.max(0.5, 6 * Math.pow(10, -(mag + 1.5) / 6.5));

                // Glow effect for bright stars
                if (mag < 2.5) {
                    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
                    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Draw star
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.globalAlpha = 1.0;
        }

        // Draw lines first (if enabled)
        if (showLines && lines) {
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1.5;

            lines.forEach(([idx1, idx2]) => {
                if (idx1 < processedStars.length && idx2 < processedStars.length) {
                    const star1 = processedStars[idx1];
                    const star2 = processedStars[idx2];
                    const x1 = star1.x * width;
                    const y1 = (1 - star1.y) * height;
                    const x2 = star2.x * width;
                    const y2 = (1 - star2.y) * height;

                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            });
        }

        // Draw stars (filtered by magnitude)
        processedStars.forEach(star => {
            const mag = star.magnitude || 5;

            // Skip stars dimmer than the filter threshold
            if (mag > maxMagnitude) return;

            const x = star.x * width;
            const y = (1 - star.y) * height;

            // Logarithmic size based on magnitude (more astronomically accurate)
            const radius = Math.max(0.5, 6 * Math.pow(10, -(mag + 1.5) / 6.5));

            // Glow effect for bright stars
            if (mag < 2.5) {
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                gradient.addColorStop(0.5, 'rgba(147, 197, 253, 0.3)');
                gradient.addColorStop(1, 'rgba(147, 197, 253, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
                ctx.fill();
            }

            // Star itself
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        });

    }, [constellation, showLines, maxMagnitude, rotationAngle, backgroundStars, backgroundStarOpacity]);

    return <canvas ref={canvasRef} width="500" height="500" />;
}

export default ConstellationCanvas;
