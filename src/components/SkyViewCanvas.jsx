import React, { useEffect, useRef, useState } from 'react';
import { getAltAz, stereographicFromAltAz } from '../utils/visibility';

function SkyViewCanvas({
    constellations,           // All constellation data
    filteredConstellations,   // Array of constellation abbrevs to show
    highlightedAbbrev,        // Which constellation to highlight (correct answer)
    tappedFeedback,           // { abbrev, correct } - what was tapped and if correct
    showBoundaries,           // Show boundary polygons
    showLines,                // Show constellation lines
    maxMagnitude,             // Star brightness filter
    backgroundStars = [],     // Background stars from Hipparcos catalog
    backgroundStarOpacity = 100, // Background star opacity (0-100)
    hemisphereFilter = 'both', // Which hemisphere(s) to show: 'north', 'south', or 'both'
    horizonMode = false,      // If true, render the real horizon-oriented sky instead of pole-centered globes
    horizonDate,              // Date object for the horizon observer (required when horizonMode is true)
    horizonLat,               // Observer latitude in degrees (required when horizonMode is true)
    horizonLon,               // Observer longitude in degrees, east-positive (required when horizonMode is true)
    onClick                   // Click handler: (abbrev, x, y) => void
}) {
    const canvasRef = useRef(null);
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile viewport
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const hemisphereSize = 750;  // Each hemisphere circle size (sized so both hemispheres fit in 1500px container)
    const showBothHemispheres = !horizonMode && hemisphereFilter === 'both';
    const edgePadding = 1;      // Padding on outer edges
    const gapBetween = 1;       // Gap between hemispheres

    // Layout changes based on mobile/desktop and number of hemispheres
    const bothWidth = hemisphereSize * 2 + edgePadding * 2 + gapBetween;
    const canvasWidth = showBothHemispheres
        ? (isMobile ? hemisphereSize + edgePadding * 2 : bothWidth)
        : hemisphereSize + edgePadding * 2;  // Single hemisphere

    const canvasHeight = showBothHemispheres
        ? (isMobile ? hemisphereSize * 2 + 80 : hemisphereSize + 50)
        : hemisphereSize + 50;  // Single hemisphere
    const singleHeight = hemisphereSize + 50;  // Height for consistent scaling

    // Convert RA hours to radians
    const raToRad = (raHours) => raHours * 15 * Math.PI / 180;
    const decToRad = (decDeg) => decDeg * Math.PI / 180;

    // Stereographic projection for a specific hemisphere
    // hemisphere: 'north' (Dec +90 center) or 'south' (Dec -90 center)
    // centerX, centerY: canvas coordinates for the hemisphere center
    const projectToHemisphere = (ra, dec, hemisphere, centerX, centerY) => {
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

        return {
            x: centerX + projX,
            y: centerY - projY,
            angularDist: angularDist * 180 / Math.PI,
            visible: angularDist * 180 / Math.PI <= 90
        };
    };

    // Real-horizon zenith-centered stereographic projection (ported from the
    // sibling project's plot.py:44-50 stereographic_from_altaz). Used instead of
    // projectToHemisphere when horizonMode is on, so the chart reflects the
    // actual sky as seen from horizonLat/horizonLon at horizonDate.
    const projectToHorizon = (ra, dec, centerX, centerY) => {
        const { alt, az } = getAltAz(horizonDate, horizonLat, horizonLon, ra, dec);
        const { x: rawX, y: rawY } = stereographicFromAltAz(alt, az);

        // Horizon (alt=0) is the edge of the dome, same edgeR math as projectToHemisphere
        const edgeR = 2.0 * Math.tan((90 * Math.PI / 180) / 2);
        const scale = (hemisphereSize / 2) / edgeR;

        const projX = rawX * scale;
        const projY = rawY * scale;

        return {
            x: centerX + projX,
            y: centerY - projY,
            visible: alt >= 0
        };
    };

    // Dispatches to the horizon or pole-centered projection depending on horizonMode
    const project = (ra, dec, hemisphere, centerX, centerY) =>
        horizonMode ? projectToHorizon(ra, dec, centerX, centerY) : projectToHemisphere(ra, dec, hemisphere, centerX, centerY);

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

        // Determine which hemisphere(s) to check based on current filter
        const hemispheresToCheck = horizonMode
            ? ['horizon']
            : (showBothHemispheres ? ['north', 'south'] : [hemisphereFilter]);

        // Check each constellation's boundary path, but only within hemisphere circles
        let insideAnyHemisphere = false;

        for (const [key, path] of boundaryPathsRef.current.entries()) {
            const hemisphere = key.split('-')[1]; // Extract hemisphere from "Oph-north"

            // Skip if this hemisphere isn't being displayed
            if (!hemispheresToCheck.includes(hemisphere)) continue;

            // Calculate center position for this hemisphere (same logic as rendering)
            let centerX, centerY;

            if (showBothHemispheres) {
                centerX = isMobile
                    ? hemisphereSize / 2 + edgePadding
                    : (hemisphere === 'north'
                        ? hemisphereSize / 2 + edgePadding
                        : edgePadding + hemisphereSize + gapBetween + hemisphereSize / 2);

                centerY = isMobile
                    ? (hemisphere === 'north' ? hemisphereSize / 2 + 30 : hemisphereSize * 1.5 + 70)
                    : hemisphereSize / 2 + 30;
            } else {
                centerX = hemisphereSize / 2 + edgePadding;
                centerY = hemisphereSize / 2 + 30;
            }

            // Check if click is within this hemisphere's circular boundary
            const dx = x - centerX;
            const dy = y - centerY;
            const distFromCenter = Math.sqrt(dx * dx + dy * dy);

            if (distFromCenter > hemisphereSize / 2) {
                continue; // Click is outside this hemisphere's circle
            }

            insideAnyHemisphere = true;

            // Now check if click is inside this constellation's boundary
            if (ctx.isPointInPath(path, x, y)) {
                const abbrev = key.split('-')[0];
                onClick(abbrev, x, y);
                return;
            }
        }

        // Ignore clicks outside the hemisphere circle(s) entirely - not a real guess
        if (!insideAnyHemisphere) return;

        // Inside the sky but no constellation found there
        onClick(null, x, y);
    };

    useEffect(() => {
        if (!canvasRef.current || !constellations) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Clear entire canvas
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw hemisphere labels (positioned based on layout)
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px -apple-system, sans-serif';
        ctx.textAlign = 'center';

        if (horizonMode) {
            const label = horizonDate
                ? `Sky at ${horizonLat.toFixed(1)}°, ${horizonLon.toFixed(1)}° — ${horizonDate.toLocaleString()}`
                : 'Sky at your location';
            ctx.fillText(label, hemisphereSize / 2 + edgePadding, 20);
        } else if (showBothHemispheres) {
            if (isMobile) {
                // Vertical layout - labels above each hemisphere
                ctx.fillText('Northern Hemisphere', hemisphereSize / 2 + edgePadding, 20);
                ctx.fillText('Southern Hemisphere', hemisphereSize / 2 + edgePadding, hemisphereSize + 60);
            } else {
                // Horizontal layout - labels above each hemisphere
                ctx.fillText('Northern Hemisphere', hemisphereSize / 2 + edgePadding, 20);
                ctx.fillText('Southern Hemisphere', edgePadding + hemisphereSize + gapBetween + hemisphereSize / 2, 20);
            }
        } else {
            // Single hemisphere - centered label
            const label = hemisphereFilter === 'north' ? 'Northern Hemisphere' : 'Southern Hemisphere';
            ctx.fillText(label, hemisphereSize / 2 + edgePadding, 20);
        }

        // Clear stored paths and rebuild
        boundaryPathsRef.current.clear();

        // Always render all constellations visually
        const allConstellations = Object.entries(constellations);

        // Create a Set for quick lookup of filtered constellations
        const filteredSet = new Set(filteredConstellations || []);

        // Determine which hemisphere(s) to render
        const hemispheresToShow = horizonMode
            ? ['horizon']
            : (showBothHemispheres ? ['north', 'south'] : [hemisphereFilter]);

        // Draw each hemisphere
        for (const hemisphere of hemispheresToShow) {
            // Calculate center position based on number of hemispheres and layout
            let centerX, centerY;

            if (showBothHemispheres) {
                // Two hemispheres: position based on mobile/desktop
                centerX = isMobile
                    ? hemisphereSize / 2 + edgePadding  // Both centered horizontally
                    : (hemisphere === 'north'
                        ? hemisphereSize / 2 + edgePadding
                        : edgePadding + hemisphereSize + gapBetween + hemisphereSize / 2);

                centerY = isMobile
                    ? (hemisphere === 'north' ? hemisphereSize / 2 + 30 : hemisphereSize * 1.5 + 70)  // Stack vertically
                    : hemisphereSize / 2 + 30;  // Both at same vertical position
            } else {
                // Single hemisphere: always centered
                centerX = hemisphereSize / 2 + edgePadding;
                centerY = hemisphereSize / 2 + 30;
            }

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

                    const pt = project(star.ra, star.dec, hemisphere, centerX, centerY);
                    if (!pt.visible) continue;

                    const { x, y } = pt;
                    const radius = Math.max(0.5, 2.0 * Math.pow(10, -(mag + 1.5) / 10));

                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1.0; // Reset
            }

            // Build Path2D for constellations in this hemisphere
            // All constellations now have boundary as array of polygons: [[[ra,dec],...], ...]
            // Most have 1 polygon, Serpens has 2 (Caput and Cauda)
            for (const [abbrev, data] of allConstellations) {
                if (!data.boundary || data.boundary.length === 0) continue;

                // Create a combined Path2D for all polygon parts
                const combinedPath = new Path2D();
                let anyPartVisible = false;

                for (const polygon of data.boundary) {
                    if (!polygon || polygon.length < 3) continue;

                    // Check if any point in this polygon is visible in this hemisphere
                    const polygonVisible = polygon.some(([ra, dec]) => {
                        const pt = project(ra, dec, hemisphere, centerX, centerY);
                        return pt.visible;
                    });

                    if (!polygonVisible) continue;
                    anyPartVisible = true;

                    // Add this polygon to the combined path
                    const first = project(polygon[0][0], polygon[0][1], hemisphere, centerX, centerY);
                    combinedPath.moveTo(first.x, first.y);

                    for (let i = 1; i < polygon.length; i++) {
                        const pt = project(polygon[i][0], polygon[i][1], hemisphere, centerX, centerY);
                        combinedPath.lineTo(pt.x, pt.y);
                    }
                    combinedPath.closePath();
                }

                if (!anyPartVisible) continue;

                // Store combined path for hit testing
                boundaryPathsRef.current.set(`${abbrev}-${hemisphere}`, combinedPath);

                // Draw the path
                const isHighlighted = abbrev === highlightedAbbrev;
                const isTapped = tappedFeedback && abbrev === tappedFeedback.abbrev;
                const isFeedbackTarget = isHighlighted || isTapped;

                // Always show boundaries for feedback targets, otherwise respect showBoundaries setting
                if (showBoundaries || isFeedbackTarget) {
                    if (isTapped) {
                        // Green if correct, red if wrong
                        const color = tappedFeedback.correct ? 'rgba(16, 185, 129' : 'rgba(239, 68, 68';
                        ctx.fillStyle = color + ', 0.15)';
                        ctx.strokeStyle = color + ', 0.8)';
                        ctx.lineWidth = 2;
                        ctx.fill(combinedPath);
                    } else if (isHighlighted && !tappedFeedback?.correct) {
                        // Blue for correct answer (only show when wrong click)
                        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
                        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
                        ctx.lineWidth = 2;
                        ctx.fill(combinedPath);
                    } else if (showBoundaries) {
                        // Only show neutral boundaries if toggle is on
                        ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)';
                        ctx.lineWidth = 1;
                    }
                    if (isFeedbackTarget || showBoundaries) {
                        ctx.stroke(combinedPath);
                    }
                }
            }

            // Draw constellation lines
            for (const [abbrev, data] of allConstellations) {
                const isHighlighted = abbrev === highlightedAbbrev;
                const isTapped = tappedFeedback && abbrev === tappedFeedback.abbrev;
                const isFeedbackTarget = isHighlighted || isTapped;

                // Always show lines for feedback targets, otherwise respect showLines setting
                if (!showLines && !isFeedbackTarget) continue;

                // Color based on feedback state
                if (isTapped) {
                    ctx.strokeStyle = tappedFeedback.correct ? '#10b981' : '#ef4444';
                    ctx.lineWidth = 2;
                } else if (isHighlighted) {
                    ctx.strokeStyle = '#60a5fa';
                    ctx.lineWidth = 2;
                } else {
                    ctx.strokeStyle = '#475569';
                    ctx.lineWidth = 1;
                }

                const stars = data.stars;

                for (const [idx1, idx2] of data.lines) {
                    if (idx1 < stars.length && idx2 < stars.length) {
                        const star1 = stars[idx1];
                        const star2 = stars[idx2];

                        const p1 = project(star1.ra, star1.dec, hemisphere, centerX, centerY);
                        const p2 = project(star2.ra, star2.dec, hemisphere, centerX, centerY);

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

            // Draw stars
            for (const [abbrev, data] of allConstellations) {
                const isHighlighted = abbrev === highlightedAbbrev;

                for (const star of data.stars) {
                    const mag = star.magnitude || 5;
                    if (mag > maxMagnitude) continue;

                    const pt = project(star.ra, star.dec, hemisphere, centerX, centerY);
                    if (!pt.visible) continue;

                    const { x, y } = pt;
                    const radius = Math.max(0.5, 2 * Math.pow(10, -(mag) / 10));

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

    }, [constellations, filteredConstellations, highlightedAbbrev, tappedFeedback, showBoundaries, showLines, maxMagnitude, backgroundStars, backgroundStarOpacity, isMobile, hemisphereFilter, horizonMode, horizonDate, horizonLat, horizonLon]);

    return (
        <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            onClick={handleClick}
            style={{
                cursor: onClick ? 'crosshair' : 'default',
                maxHeight: `${singleHeight}px`,
                maxWidth: '100%',
                width: 'auto',
                height: 'auto',
                border: 'none'
            }}
        />
    );
}

export default SkyViewCanvas;
