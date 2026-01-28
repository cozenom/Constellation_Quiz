import React, { useEffect, useRef } from 'react';

function SkyViewCanvas({
    constellations,           // All constellation data
    filteredConstellations,   // Array of constellation abbrevs to show
    highlightedAbbrev,        // Which constellation to highlight
    showBoundaries,           // Show boundary polygons
    showLines,                // Show constellation lines
    maxMagnitude,             // Star brightness filter
    backgroundStars = [],     // Background stars from Hipparcos catalog
    backgroundStarOpacity = 100, // Background star opacity (0-100)
    onClick                   // Click handler: (abbrev, x, y) => void
}) {
    const canvasRef = useRef(null);
    const hemisphereSize = 700;  // Each hemisphere circle size
    const canvasWidth = hemisphereSize * 2 + 40;  // Two hemispheres + gap
    const canvasHeight = hemisphereSize + 60;  // Plus labels

    // Convert RA hours to radians
    const raToRad = (raHours) => raHours * 15 * Math.PI / 180;
    const decToRad = (decDeg) => decDeg * Math.PI / 180;

    // Stereographic projection for a specific hemisphere
    // hemisphere: 'north' (Dec +90 center) or 'south' (Dec -90 center)
    const projectToHemisphere = (ra, dec, hemisphere) => {
        const centerDec = hemisphere === 'north' ? 90 : -90;
        const centerDecRad = decToRad(centerDec);
        const raRad = raToRad(ra);
        const decRad = decToRad(dec);

        // Compute angular distance from pole
        const cosDist = Math.sin(centerDecRad) * Math.sin(decRad) +
                       Math.cos(centerDecRad) * Math.cos(decRad);  // cos(dRA) = 1 at poles
        const angularDist = Math.acos(Math.max(-1, Math.min(1, cosDist)));

        // For polar projection, position angle is just RA
        // North: RA increases clockwise when looking down from north
        // South: RA increases counter-clockwise when looking up from south
        const posAngle = hemisphere === 'north' ? -raRad : raRad;

        // Stereographic projection: 90° from center maps to edge
        const viewRadiusRad = 90 * Math.PI / 180;
        const r = 2.0 * Math.tan(angularDist / 2);
        const edgeR = 2.0 * Math.tan(viewRadiusRad / 2);
        const scale = (hemisphereSize / 2) / edgeR;

        const projX = r * Math.sin(posAngle) * scale;
        const projY = r * Math.cos(posAngle) * scale;

        // Calculate canvas position based on hemisphere
        const centerX = hemisphere === 'north' ? hemisphereSize / 2 + 10 : hemisphereSize * 1.5 + 30;
        const centerY = hemisphereSize / 2 + 40;

        return {
            x: centerX + projX,
            y: centerY - projY,
            angularDist: angularDist * 180 / Math.PI,
            visible: angularDist * 180 / Math.PI <= 90
        };
    };

    // Check which hemisphere a constellation belongs to (by center dec)
    const getHemisphere = (dec) => dec >= 0 ? 'north' : 'south';

    // Store boundary paths for hit testing (keyed by "abbrev-hemisphere")
    const boundaryPathsRef = useRef(new Map());

    // Handle canvas click using Canvas API isPointInPath
    const handleClick = (e) => {
        if (!onClick) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        // Get click position and scale to internal canvas coordinates
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Check each constellation's boundary path
        for (const [key, path] of boundaryPathsRef.current.entries()) {
            if (ctx.isPointInPath(path, x, y)) {
                const abbrev = key.split('-')[0];
                onClick(abbrev, x, y);
                return;
            }
        }

        // No constellation found
        onClick(null, x, y);
    };

    useEffect(() => {
        if (!canvasRef.current || !constellations) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Clear entire canvas
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw hemisphere labels
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Northern Hemisphere', hemisphereSize / 2 + 10, 25);
        ctx.fillText('Southern Hemisphere', hemisphereSize * 1.5 + 30, 25);

        // Clear stored paths and rebuild
        boundaryPathsRef.current.clear();

        // Always render all constellations visually
        const allConstellations = Object.entries(constellations);

        // Create a Set for quick lookup of filtered constellations
        const filteredSet = new Set(filteredConstellations || []);

        // Draw each hemisphere
        for (const hemisphere of ['north', 'south']) {
            const centerX = hemisphere === 'north' ? hemisphereSize / 2 + 10 : hemisphereSize * 1.5 + 30;
            const centerY = hemisphereSize / 2 + 40;

            // Apply circular clipping for this hemisphere
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, hemisphereSize / 2, 0, Math.PI * 2);
            ctx.clip();

            // Fill with background
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(centerX - hemisphereSize / 2, centerY - hemisphereSize / 2, hemisphereSize, hemisphereSize);

            // Draw background stars with opacity
            if (backgroundStars && backgroundStars.length > 0 && backgroundStarOpacity > 0) {
                ctx.globalAlpha = backgroundStarOpacity / 100;
                for (const star of backgroundStars) {
                    const mag = star.magnitude || 5;
                    if (mag > maxMagnitude) continue;

                    const pt = projectToHemisphere(star.ra, star.dec, hemisphere);
                    if (!pt.visible) continue;

                    const { x, y } = pt;
                    const radius = Math.max(0.3, 2.0 * Math.pow(10, -(mag + 1.5) / 6.5));

                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1.0; // Reset
            }

            // Build Path2D for constellations in this hemisphere
            for (const [abbrev, data] of allConstellations) {
                if (!data.boundary || data.boundary.length < 3) continue;

                // Check if any boundary point is visible in this hemisphere
                const anyVisible = data.boundary.some(([ra, dec]) => {
                    const pt = projectToHemisphere(ra, dec, hemisphere);
                    return pt.visible;
                });
                if (!anyVisible) continue;

                // Create Path2D for this constellation in this hemisphere
                const path = new Path2D();
                const first = projectToHemisphere(data.boundary[0][0], data.boundary[0][1], hemisphere);
                path.moveTo(first.x, first.y);

                for (let i = 1; i < data.boundary.length; i++) {
                    const pt = projectToHemisphere(data.boundary[i][0], data.boundary[i][1], hemisphere);
                    path.lineTo(pt.x, pt.y);
                }
                path.closePath();

                // Store for hit testing ONLY if constellation is in filtered set
                if (filteredSet.size === 0 || filteredSet.has(abbrev)) {
                    boundaryPathsRef.current.set(`${abbrev}-${hemisphere}`, path);
                }

                // Draw the path (only if showBoundaries)
                if (showBoundaries) {
                    const isHighlighted = abbrev === highlightedAbbrev;
                    if (isHighlighted) {
                        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
                        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
                        ctx.lineWidth = 2;
                        ctx.fill(path);
                    } else {
                        ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)';
                        ctx.lineWidth = 1;
                    }
                    ctx.stroke(path);
                }
            }

            // Draw constellation lines
            if (showLines) {
                for (const [abbrev, data] of allConstellations) {
                    const isHighlighted = abbrev === highlightedAbbrev;
                    ctx.strokeStyle = isHighlighted ? '#60a5fa' : '#475569';
                    ctx.lineWidth = isHighlighted ? 2 : 1;

                    const stars = data.stars;

                    for (const [idx1, idx2] of data.lines) {
                        if (idx1 < stars.length && idx2 < stars.length) {
                            const star1 = stars[idx1];
                            const star2 = stars[idx2];

                            const p1 = projectToHemisphere(star1.ra, star1.dec, hemisphere);
                            const p2 = projectToHemisphere(star2.ra, star2.dec, hemisphere);

                            // Draw if at least one point is visible (clipping handles the rest)
                            if (p1.visible || p2.visible) {
                                ctx.beginPath();
                                ctx.moveTo(p1.x, p1.y);
                                ctx.lineTo(p2.x, p2.y);
                                ctx.stroke();
                            }
                        }
                    }
                }
            }

            // Draw stars
            for (const [abbrev, data] of allConstellations) {
                const isHighlighted = abbrev === highlightedAbbrev;

                for (const star of data.stars) {
                    const mag = star.magnitude || 5;
                    if (mag > maxMagnitude) continue;

                    const pt = projectToHemisphere(star.ra, star.dec, hemisphere);
                    if (!pt.visible) continue;

                    const { x, y } = pt;
                    const radius = Math.max(0.5, 3.5 * Math.pow(10, -(mag + 1.5) / 6.5));

                    // Glow for bright stars
                    if (mag < 2.5) {
                        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
                        gradient.addColorStop(0, isHighlighted ? 'rgba(96, 165, 250, 0.8)' : 'rgba(255, 255, 255, 0.8)');
                        gradient.addColorStop(0.5, isHighlighted ? 'rgba(96, 165, 250, 0.3)' : 'rgba(255, 255, 255, 0.3)');
                        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.fillStyle = isHighlighted ? '#60a5fa' : '#ffffff';
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Restore context (removes clipping)
            ctx.restore();

            // Draw circular border
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(centerX, centerY, hemisphereSize / 2 - 1, 0, Math.PI * 2);
            ctx.stroke();
        }

    }, [constellations, filteredConstellations, highlightedAbbrev, showBoundaries, showLines, maxMagnitude, backgroundStars, backgroundStarOpacity]);

    return (
        <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            onClick={handleClick}
            style={{
                cursor: onClick ? 'crosshair' : 'default',
                width: '100%',
                maxWidth: `${canvasWidth}px`,
                height: 'auto',
                border: 'none'
            }}
        />
    );
}

export default SkyViewCanvas;
