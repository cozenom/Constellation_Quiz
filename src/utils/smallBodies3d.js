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

// meta: small_bodies.json. Returns
//   addTier(tierIndex, Uint16Array): draw a tier's points (0 default, 1 more)
//   hasTier(tierIndex), update(date), setFade(f), setCameraDistance(au), setVisible(on),
//   setGroupVisible(groupId, on), setTierVisible(tierIndex, on), setHaze(on),
//   dispose()
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
    const applyVisibility = () => {
        for (const o of objects) o.points.visible = !hiddenGroups.has(o.groupId) && !hiddenTiers.has(o.tier);
    };

    const addTier = (tier, data) => {
        if (objects.some(o => o.tier === tier)) return;
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
        setFade: (f) => { shared.uFade.value = f; },
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
        dispose: () => {
            scene.remove(group);
            for (const { points } of objects) {
                points.geometry.dispose();
                points.material.dispose();
            }
        },
    };
}
