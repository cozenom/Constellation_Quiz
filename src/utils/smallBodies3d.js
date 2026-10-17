// The asteroid and comet point cloud of the Solar System layer (AU, origin
// the Sun): tens of thousands to 1.5 million unnamed bodies from JPL's
// Small-Body Database (small_bodies.bin / small_bodies_more.bin, built by
// Star_Data/scripts/build_small_bodies.py; see there for the format).
//
// Each point is a two-body Kepler orbit, solved on the GPU every frame from
// its six elements, so running the clock costs no JavaScript per point
// (the same maths as smallBodies.js does for the named bodies). The belt's
// structure (Kirkwood gaps, Hildas, the Trojan swarms) is not drawn in: it
// comes from the real orbits. Points are grouped by orbit type; each group
// is its own Points object, so it can be coloured and switched off alone.

import * as THREE from 'three';
import { eccentricAnomaly } from './moons.js';
import { GAUSS_K, OBLIQUITY_RAD, julianDate } from './smallBodies.js';

// Group colours (small_bodies.json group ids)
export const SMALL_BODY_GROUP_COLORS = {
    main: '#b9a98f',
    hilda: '#e6a04f',
    trojan: '#7fc97f',
    neo: '#ff6b6b',
    centaur: '#c792ea',
    tno: '#7aa2f7',
    comet: '#67e8f9',
    other: '#9ca3af',
};
// Per tier (default, more): point size (CSS px) and opacity. The "more"
// tier is 1.5 million faint points on top: dimmer, so the belt thickens
// rather than turning solid
const TIER_LOOK = [
    { sizePx: 2, alpha: 0.55 },
    { sizePx: 1.5, alpha: 0.22 },
];
// Dots keep their pixel size and add up, so from far away a group crowds
// into a small patch and burns white. Each group dims as the camera gets
// farther from the Sun than DIM_RADII times its typical orbit (AU): by the
// square of the distance, which keeps its patch's brightness steady.
const TYPICAL_ORBIT_AU = {
    main: 2.7, hilda: 4, trojan: 5.2, neo: 1.5, centaur: 15, tno: 43, comet: 5, other: 3,
};
const DIM_RADII = 2;
// Dimmest a dot gets: fainter ones round to nothing in the 8-bit frame
// (contributions under 1/255), and the patch would vanish instead of glowing
const MIN_ALPHA = 0.008;
// Trojans (1:1) and Hildas (3:2) are held in place by Jupiter, which a
// two-body orbit leaves out: each would drift at its own rate and the
// swarms smear out over decades. They move at Jupiter's mean rate instead
// (times this), so they keep their places relative to it (their slow real
// rocking about those places is left out).
const JUPITER_RATE = 2 * Math.PI / 4332.59;  // rad/day
const RESONANT_RATE = { trojan: 1, hilda: 1.5 };
const FIELDS_PER_POINT = 6;
// Points are only picked while the cloud is at least this visible
const PICK_MIN_FADE = 0.3;

const vertexShader = `
    #define TWO_PI 6.283185307179586
    // position (three.js declares it): ln a, e, i (0..1 over their ranges).
    // Named so attribute 0 is always bound (some drivers are slow without).
    attribute vec3 elementsB;  // node, w, M at epoch (0..1 of a turn)
    uniform vec2 uLogA;        // ln a range (AU)
    uniform float uDays;       // days since the elements' epoch
    uniform float uSize;
    uniform float uMeanMotion; // rad/day; 0: its own (Kepler's third law)
    void main() {
        float a = exp(mix(uLogA.x, uLogA.y, position.x));
        float e = position.y;
        float inc = position.z * 3.141592653589793;
        float node = elementsB.x * TWO_PI;
        float w = elementsB.y * TWO_PI;
        float n = uMeanMotion > 0.0 ? uMeanMotion : ${GAUSS_K} / (a * sqrt(a));
        float M = mod(elementsB.z * TWO_PI + n * uDays, TWO_PI);

        // Kepler's equation M = E - e sin E (Newton)
        float E = e < 0.8 ? M : 3.141592653589793;
        for (int k = 0; k < 20; k++) {
            float dE = (E - e * sin(E) - M) / (1.0 - e * cos(E));
            E -= dE;
            if (abs(dE) < 1e-6) break;
        }
        float px = a * (cos(E) - e);
        float py = a * sqrt(1.0 - e * e) * sin(E);

        // Orbit plane -> ecliptic: turn by w, tilt by i, turn by node
        float cw = cos(w), sw = sin(w), ci = cos(inc), si = sin(inc), cn = cos(node), sn = sin(node);
        float x1 = cw * px - sw * py;
        float y1 = sw * px + cw * py;
        float y2 = ci * y1;
        float x = cn * x1 - sn * y2;
        float y = sn * x1 + cn * y2;
        float z = si * y1;
        // Ecliptic -> equator, then the scene frame (north = +Y)
        float ce = ${Math.cos(OBLIQUITY_RAD).toFixed(9)}, se = ${Math.sin(OBLIQUITY_RAD).toFixed(9)};
        vec3 scenePos = vec3(x, se * y + ce * z, -(ce * y - se * z));

        gl_PointSize = uSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(scenePos, 1.0);
    }
`;

const fragmentShader = `
    uniform vec3 uColor;
    uniform float uAlpha;
    uniform float uDim;
    uniform float uFade;
    uniform float uLinear;
    void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float alpha = (1.0 - smoothstep(0.6, 1.0, r)) * max(uAlpha * uDim, ${MIN_ALPHA}) * uFade;
        if (alpha < 0.001) discard;
        vec3 color = mix(uColor, pow(uColor, vec3(2.2)), uLinear);  // like the planet dots
        gl_FragColor = vec4(color, alpha);
    }
`;

// The vertex shader's maths in JS (doubles), for picking and orbit lines
const COS_EPS = Math.cos(OBLIQUITY_RAD), SIN_EPS = Math.sin(OBLIQUITY_RAD);
// Point k of a tier's rows -> its elements (AU, radians)
function decode(rows, k, logA) {
    const r = k * FIELDS_PER_POINT;
    return {
        a: Math.exp(logA[0] + (logA[1] - logA[0]) * rows[r] / 65535),
        e: rows[r + 1] / 65535,
        inc: rows[r + 2] / 65535 * Math.PI,
        node: rows[r + 3] / 65535 * 2 * Math.PI,
        w: rows[r + 4] / 65535 * 2 * Math.PI,
        M0: rows[r + 5] / 65535 * 2 * Math.PI,
    };
}
// The point at eccentric anomaly E on an orbit -> out[o..o+2] (AU, scene frame)
function placeOnOrbit(el, E, out, o) {
    const px = el.a * (Math.cos(E) - el.e), py = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const cw = Math.cos(el.w), sw = Math.sin(el.w), ci = Math.cos(el.inc), si = Math.sin(el.inc);
    const cn = Math.cos(el.node), sn = Math.sin(el.node);
    const x1 = cw * px - sw * py, y1 = sw * px + cw * py, y2 = ci * y1;
    const x = cn * x1 - sn * y2, y = sn * x1 + cn * y2, z = si * y1;
    out[o] = x;
    out[o + 1] = SIN_EPS * y + COS_EPS * z;
    out[o + 2] = -(COS_EPS * y - SIN_EPS * z);
}
// Point k at `days` since the epoch
function pointPosition(rows, k, logA, meanMotion, days, out, o) {
    const el = decode(rows, k, logA);
    const n = meanMotion || GAUSS_K / (el.a * Math.sqrt(el.a));
    const M = (((el.M0 + n * days) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    placeOnOrbit(el, eccentricAnomaly(M, el.e), out, o);
}
// Orbit lines: points per orbit, evenly spaced in eccentric anomaly (fine
// both near the Sun and far out, as for the named bodies)
const ORBIT_LINE_POINTS = 64;
const ORBIT_LINE_OPACITY = 0.1;
// Comet orbits are coloured by family, from the period (years)
export const COMET_FAMILIES = [
    { name: 'Jupiter-family', maxYears: 20, color: '#67e8f9' },
    { name: 'Halley-type', maxYears: 200, color: '#c4b5fd' },
    { name: 'Long-period', maxYears: Infinity, color: '#fbbf24' },
];
const familyColors = COMET_FAMILIES.map(f => new THREE.Color(f.color));
// A line colour per orbit: comets by family, the rest their group's
function orbitColor(groupId, el) {
    if (groupId !== 'comet') return new THREE.Color(SMALL_BODY_GROUP_COLORS[groupId]);
    const years = el.a ** 1.5;  // Kepler's third law (AU, years)
    return familyColors[COMET_FAMILIES.findIndex(f => years < f.maxYears)];
}

// meta: small_bodies.json. Returns
//   addTier(tierIndex, Uint16Array): draw a tier's points (0 default, 1 more)
//   hasTier(tierIndex), update(date), setFade(f), setCameraDistance(au), setVisible(on),
//   setGroupVisible(groupId, on), setTierVisible(tierIndex, on), setHaze(on),
//   setGroupOrbits(groupId, on): draw every orbit of a group (default tier)
//   pick(camera, width, height, x, y, radiusPx) -> {index, groupId, position} | null
//     (the default tier's point nearest a screen point; index into its rows
//     and small_bodies_names.json), dispose()
export function buildSmallBodyCloud(scene, meta, pixelRatio) {
    const group = new THREE.Group();
    scene.add(group);
    const logA = meta.encoding.ranges[meta.encoding.fields.indexOf('log_a')];
    // Shared by every group's material
    const shared = {
        uLogA: { value: new THREE.Vector2(logA[0], logA[1]) },
        uDays: { value: 0 },
        uFade: { value: 1 },
        uLinear: { value: 0 },
    };
    const objects = [];  // {points, tier, groupId}
    const hiddenGroups = new Set();
    const hiddenTiers = new Set();
    const orbitsWanted = new Set();  // group ids whose orbit lines are asked for
    let orbitLines = null;           // see setGroupOrbits
    const applyVisibility = () => {
        for (const o of objects) o.points.visible = !hiddenGroups.has(o.groupId) && !hiddenTiers.has(o.tier);
        for (const [id, lines] of orbitLines ?? []) lines.visible = orbitsWanted.has(id) && !hiddenGroups.has(id);
    };

    // Hover picking: the default tier's positions, worked out in JS when
    // first needed and kept until the time changes
    let pickRows = null;
    let pickCache = null;  // {days, positions: Float32Array}
    const pickPositions = () => {
        const days = shared.uDays.value;
        if (pickCache?.days === days) return pickCache.positions;
        const positions = pickCache?.positions ?? new Float32Array(meta.tiers[0].count * 3);
        let start = 0;
        meta.groups.forEach(({ id }, g) => {
            const count = meta.tiers[0].group_counts[g];
            const meanMotion = (RESONANT_RATE[id] ?? 0) * JUPITER_RATE;
            for (let k = start; k < start + count; k++) pointPosition(pickRows, k, logA, meanMotion, days, positions, k * 3);
            start += count;
        });
        pickCache = { days, positions };
        return positions;
    };
    const viewProjection = new THREE.Matrix4();
    const pick = (camera, width, height, mx, my, radiusPx) => {
        if (!pickRows || !group.visible || shared.uFade.value < PICK_MIN_FADE) return null;
        const positions = pickPositions();
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        const m = viewProjection.elements;
        let best = null;
        let bestDist = radiusPx;
        let start = 0;
        meta.groups.forEach(({ id }, g) => {
            const count = meta.tiers[0].group_counts[g];
            if (!hiddenGroups.has(id)) {
                for (let k = start; k < start + count; k++) {
                    const x = positions[k * 3], y = positions[k * 3 + 1], z = positions[k * 3 + 2];
                    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
                    if (w <= 0) continue;  // behind the camera
                    const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) / 2 * width;
                    const sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) / 2 * height;
                    const d = Math.hypot(sx - mx, sy - my);
                    if (d < bestDist) {
                        bestDist = d;
                        best = { index: k, groupId: id };
                    }
                }
            }
            start += count;
        });
        if (best) best.position = Array.from(positions.subarray(best.index * 3, best.index * 3 + 3));
        return best;
    };

    // Orbit lines of whole groups (default tier), built when first asked
    // for: two-body orbits never change shape, so once is enough
    orbitLines = new Map();  // group id -> LineSegments
    let fadeNow = 1;
    const setGroupOrbits = (id, on) => {
        if (on) orbitsWanted.add(id);
        else orbitsWanted.delete(id);
        if (on && !orbitLines.has(id) && pickRows) {
            const g = meta.groups.findIndex(x => x.id === id);
            const start = meta.tiers[0].group_counts.slice(0, g).reduce((n, c) => n + c, 0);
            const count = meta.tiers[0].group_counts[g];
            const positions = new Float32Array(count * ORBIT_LINE_POINTS * 2 * 3);
            const colors = new Float32Array(positions.length);
            const p = new Float64Array(3), q = new Float64Array(3);
            let o = 0;
            for (let k = start; k < start + count; k++) {
                const el = decode(pickRows, k, logA);
                const { r, g: green, b } = orbitColor(id, el);
                placeOnOrbit(el, 0, p, 0);
                for (let i = 1; i <= ORBIT_LINE_POINTS; i++) {
                    placeOnOrbit(el, 2 * Math.PI * i / ORBIT_LINE_POINTS, q, 0);
                    positions.set(p, o);
                    positions.set(q, o + 3);
                    colors.set([r, green, b, r, green, b], o);
                    o += 6;
                    p.set(q);
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
                vertexColors: true, transparent: true, opacity: ORBIT_LINE_OPACITY * fadeNow,
                depthWrite: false, blending: THREE.AdditiveBlending,
            }));
            lines.frustumCulled = false;
            group.add(lines);
            orbitLines.set(id, lines);
        }
        applyVisibility();
    };

    const addTier = (tier, data) => {
        if (objects.some(o => o.tier === tier)) return;
        if (tier === 0) pickRows = data;
        const { group_counts: counts } = meta.tiers[tier];
        const look = TIER_LOOK[tier];
        let start = 0;
        meta.groups.forEach(({ id }, k) => {
            const count = counts[k];
            if (!count) return;
            // A view into the file's buffer, no copy
            const rows = data.subarray(start * FIELDS_PER_POINT, (start + count) * FIELDS_PER_POINT);
            start += count;
            const buffer = new THREE.InterleavedBuffer(rows, FIELDS_PER_POINT);
            const geometry = new THREE.BufferGeometry();
            // Not positions: elements, placed by the shader (see vertexShader)
            geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0, true));
            geometry.setAttribute('elementsB', new THREE.InterleavedBufferAttribute(buffer, 3, 3, true));
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    ...shared,
                    uSize: { value: look.sizePx * pixelRatio },
                    uAlpha: { value: look.alpha },
                    uDim: { value: 1 },
                    uMeanMotion: { value: (RESONANT_RATE[id] ?? 0) * JUPITER_RATE },
                    // Raw hex values, like the planet dots (no colour management)
                    uColor: { value: new THREE.Color().setHex(new THREE.Color(SMALL_BODY_GROUP_COLORS[id]).getHex(), THREE.LinearSRGBColorSpace) },
                },
                vertexShader,
                fragmentShader,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const points = new THREE.Points(geometry, material);
            points.frustumCulled = false;  // its bounds would be the elements', not the points'
            group.add(points);
            objects.push({ points, tier, groupId: id });
        });
        applyVisibility();
    };

    return {
        addTier,
        hasTier: (tier) => objects.some(o => o.tier === tier),
        // Days since the epoch as a 32-bit float: ~1 minute steps a century out, plenty here
        update: (date) => { shared.uDays.value = julianDate(date) - meta.epoch_jd; },
        setFade: (f) => {
            shared.uFade.value = f;
            fadeNow = f;
            for (const lines of orbitLines.values()) lines.material.opacity = ORBIT_LINE_OPACITY * f;
        },
        // Dim crowded groups (see TYPICAL_ORBIT_AU). Call each frame with
        // the camera's distance from the Sun (AU).
        setCameraDistance: (au) => {
            for (const { points, groupId } of objects) {
                const ratio = DIM_RADII * TYPICAL_ORBIT_AU[groupId] / Math.max(au, 1e-9);
                points.material.uniforms.uDim.value = Math.min(1, ratio * ratio);
            }
        },
        setVisible: (on) => { group.visible = on; },
        setGroupVisible: (id, on) => {
            if (on) hiddenGroups.delete(id);
            else hiddenGroups.add(id);
            applyVisibility();
        },
        setTierVisible: (tier, on) => {
            if (on) hiddenTiers.delete(tier);
            else hiddenTiers.add(tier);
            applyVisibility();
        },
        setHaze: (on) => { shared.uLinear.value = on ? 1 : 0; },
        pick,
        setGroupOrbits,
        dispose: () => {
            for (const lines of orbitLines.values()) {
                lines.geometry.dispose();
                lines.material.dispose();
            }
            scene.remove(group);
            for (const { points } of objects) {
                points.geometry.dispose();
                points.material.dispose();
            }
        },
    };
}
