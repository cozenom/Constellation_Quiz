import { useEffect, useRef } from 'react';

const SOLO_STAR_COUNT = 460;
const GROUP_COUNT = 5;

function createStar(w, h) {
    return {
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.4 + 0.3,
        opacity: Math.random() * 0.55 + 0.25,
        speed: Math.random() * 0.12 + 0.04,
    };
}

function makeGroup(keys, constellationData, w, startAtTop = false) {
    // Pick a random valid constellation
    const shuffled = [...keys].sort(() => Math.random() - 0.5);
    let c;
    let key;
    for (const k of shuffled) {
        if (constellationData[k].stars?.length >= 3) { c = constellationData[k]; key = k; break; }
    }
    if (!c) return null;

    const xs = c.stars.map(s => s.x);
    const ys = c.stars.map(s => s.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const scale = Math.min(0.9 / spanX, 0.9 / spanY);
    const ox = (1 - spanX * scale) / 2;
    const oy = (1 - spanY * scale) / 2;

    const size = 100 + Math.random() * 100;
    const speed = Math.random() * 0.08 + 0.03;

    const offsets = c.stars.map(s => ({
        dx: ((s.x - minX) * scale + ox - 0.5) * size,
        dy: -((s.y - minY) * scale + oy - 0.5) * size,
        size: Math.max(0.6, 1.8 - (s.magnitude ?? 4) * 0.18),
        opacity: Math.random() * 0.35 + 0.25,
    }));

    const dyMin = Math.min(...offsets.map(o => o.dy));
    const dyMax = Math.max(...offsets.map(o => o.dy));

    const h = window.innerHeight;
    const cy = startAtTop ? -dyMax - 2 : Math.random() * h;

    return { cx: Math.random() * w, cy, speed, offsets, dyMin, dyMax };
}

function buildGroups(constellationData, w, h) {
    if (!constellationData) return [];
    const keys = Object.keys(constellationData);
    const groups = [];
    for (let i = 0; i < GROUP_COUNT; i++) {
        const g = makeGroup(keys, constellationData, w, false);
        if (g) groups.push(g);
    }
    return groups;
}

function StarField({ constellationData }) {
    const canvasRef = useRef(null);
    const stateRef = useRef({ stars: [], groups: [] });

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animId;

        const keys = constellationData ? Object.keys(constellationData) : [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            stateRef.current.stars = Array.from(
                { length: SOLO_STAR_COUNT },
                () => createStar(canvas.width, canvas.height)
            );
            stateRef.current.groups = buildGroups(
                constellationData, canvas.width, canvas.height
            );
        };

        resize();
        window.addEventListener('resize', resize);

        const draw = () => {
            const { stars, groups } = stateRef.current;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Drifting solo stars
            for (const s of stars) {
                s.y += s.speed;
                if (s.y > canvas.height + 2) {
                    s.y = -2;
                    s.x = Math.random() * canvas.width;
                }
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${s.opacity})`;
                ctx.fill();

                if (s.size > 1.1) {
                    const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 3);
                    grd.addColorStop(0, `rgba(180,210,255,${s.opacity * 0.4})`);
                    grd.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, s.size * 3, 0, Math.PI * 2);
                    ctx.fillStyle = grd;
                    ctx.fill();
                }
            }

            // Constellation groups drifting as units
            for (let i = 0; i < groups.length; i++) {
                const g = groups[i];
                g.cy += g.speed;
                if (g.cy + g.dyMin > canvas.height + 2) {
                    const next = makeGroup(keys, constellationData, canvas.width, true);
                    if (next) { groups[i] = next; continue; }
                }

                for (const o of g.offsets) {
                    const x = g.cx + o.dx;
                    const y = g.cy + o.dy;
                    ctx.beginPath();
                    ctx.arc(x, y, o.size, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255,255,255,${o.opacity})`;
                    ctx.fill();
                }
            }

            animId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
        };
    }, [constellationData]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                maxWidth: 'none',
                margin: 0,
                background: 'transparent',
                borderRadius: 0,
                border: 'none',
                pointerEvents: 'none',
                zIndex: -1,
            }}
        />
    );
}

export default StarField;
