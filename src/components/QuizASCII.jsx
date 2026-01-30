import React, { useMemo } from 'react';

function QuizASCII({ constellation, showLines, maxMagnitude = 6, rotationAngle = 0, backgroundStars = [] }) {
    const ascii = useMemo(() => {
        const { stars, lines } = constellation;
        const width = 70;
        const height = 45;

        // Create character grid
        const grid = Array(height).fill().map(() => Array(width).fill(' '));

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
            processedBackgroundStars.forEach(star => {
                const mag = star.mag || 5;
                if (mag > maxMagnitude) return;

                const x = Math.round(star.x * (width - 1));
                const y = Math.round((1 - star.y) * (height - 1));

                let symbol;
                if (mag < 1.0) symbol = '⬤';
                else if (mag < 2.5) symbol = '●';
                else if (mag < 4.0) symbol = '○';
                else symbol = '∘';

                if (x >= 0 && x < width && y >= 0 && y < height) {
                    grid[y][x] = symbol;
                }
            });
        }

        // Bresenham line drawing algorithm
        const drawLine = (x1, y1, x2, y2) => {
            const dx = Math.abs(x2 - x1);
            const dy = Math.abs(y2 - y1);
            const sx = x1 < x2 ? 1 : -1;
            const sy = y1 < y2 ? 1 : -1;
            let err = dx - dy;

            while (true) {
                if (x1 >= 0 && x1 < width && y1 >= 0 && y1 < height) {
                    if (grid[y1][x1] === ' ') {
                        grid[y1][x1] = '·';
                    }
                }

                if (x1 === x2 && y1 === y2) break;

                const e2 = 2 * err;
                if (e2 > -dy) {
                    err -= dy;
                    x1 += sx;
                }
                if (e2 < dx) {
                    err += dx;
                    y1 += sy;
                }
            }
        };

        // Draw lines first (if enabled)
        if (showLines && lines) {
            lines.forEach(([idx1, idx2]) => {
                if (idx1 < processedStars.length && idx2 < processedStars.length) {
                    const star1 = processedStars[idx1];
                    const star2 = processedStars[idx2];

                    const x1 = Math.round(star1.x * (width - 1));
                    const y1 = Math.round((1 - star1.y) * (height - 1));
                    const x2 = Math.round(star2.x * (width - 1));
                    const y2 = Math.round((1 - star2.y) * (height - 1));
                    drawLine(x1, y1, x2, y2);
                }
            });
        }

        // Draw stars on top (filtered by magnitude)
        processedStars.forEach(star => {
            const mag = star.magnitude || 5;

            // Skip stars dimmer than the filter threshold
            if (mag > maxMagnitude) return;

            const x = Math.round(star.x * (width - 1));
            const y = Math.round((1 - star.y) * (height - 1));

            // Symbol based on magnitude
            let symbol;
            if (mag < 1.0) symbol = '⬤';
            else if (mag < 2.5) symbol = '●';
            else if (mag < 4.0) symbol = '○';
            else symbol = '∘';

            if (x >= 0 && x < width && y >= 0 && y < height) {
                grid[y][x] = symbol;
            }
        });

        // Convert grid to string
        return grid.map(row => row.join('')).join('\n');
    }, [constellation, showLines, maxMagnitude, rotationAngle, backgroundStars]);

    return (
        <div className="ascii-container">
            <div className="ascii-art">{ascii}</div>
        </div>
    );
}

export default QuizASCII;
