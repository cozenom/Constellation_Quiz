import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { addLayerPasses, createLayer, renderLayers, syncLayerCamera, syncLayerPasses } from '../utils/layers3d';
import { buildSolarSystem, ECLIPTIC_NORTH } from '../utils/solarSystem3d';
import {
    AU_PER_LY,
    KM_PER_AU,
    LY_PER_PARSEC,
    buildLineStarInfo,
    buildSearchIndex,
    buildStarBuffers,
    bvToColor,
    constellationFocus,
    constellationLinePositions,
    formatBayer,
    scaleBarAngle,
    scaleBarDistance,
    starRecord,
} from '../utils/universe3d';
import PlanetInfoCard from './PlanetInfoCard';
import StarInfoCard from './StarInfoCard';
import Universe3DSearch from './Universe3DSearch';
import './Universe3D.css';

const SUN_ABS_MAG = 4.83;
const SUN_BV = 0.65;

// Stars fainter than this (seen from the camera) can't be picked or labelled
const PICK_MAG_LIMIT = 7.0;
// Named stars brighter than this get a label; the selected constellation's
// named stars are always labelled
const LABEL_MAG_LIMIT = 2.5;
const FLIGHT_SECONDS = 1.6;

// Free look orbits a target this close in front of the camera, so dragging
// turns the view instead of moving around the scene. 1e-11 ly is ~95 km:
// the camera stays inside Earth and the Moon shifts by under 0.02 deg.
// (0.001 ly was ~63 AU, which swung the camera past Neptune.)
const FREE_LOOK_RADIUS = 1e-11;
// Closest the camera may get to an orbit target that is a star or a
// constellation (ly). Planets use a multiple of their radius instead.
const ORBIT_MIN_DISTANCE = 0.01;
const EARTH_RADIUS_LY = 6378 / KM_PER_AU / AU_PER_LY;
// Planet labels and picking only while the solar system is at least this visible
const BODY_MIN_FADE = 0.3;
const DEFAULT_FOV = 60;
const MIN_FOV = 5;
const MAX_FOV = 100;

// Points shader: each star stores its absolute magnitude, and the apparent
// magnitude is recomputed from the camera distance every frame. From Earth
// this reproduces the real sky; flying closer makes a star brighter.
// Stars brighter than mag ~2 get a larger sprite with a wide halo (vGlow).
// With haze on, colours are blended in linear light and run through bloom
// + sRGB output, so the faint halos of thousands of stars add up to a glow.
// uMaxSize caps the sprite; the Sun gets a bigger cap so it still gets
// brighter from Neptune to Mercury. The 1e-9 pc clamp (~0.0002 AU) only
// guards log(0); the camera never gets that close to a star centre.
const starVertexShader = `
    attribute float absMag;
    attribute vec3 color;
    uniform float uPixelRatio;
    uniform float uLinear;
    uniform float uMaxSize;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vGlow;

    void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float distPc = max(length(mvPosition.xyz) / ${LY_PER_PARSEC}, 1e-9);
        float mag = absMag + 5.0 * log(distPc) / log(10.0) - 5.0;

        vGlow = clamp((2.0 - mag) / 5.0, 0.0, 1.0);
        float size = clamp(2.0 + (6.5 - mag) * 1.3, 1.5, uMaxSize) * (1.0 + vGlow * 2.0);
        gl_PointSize = size * uPixelRatio;
        vAlpha = smoothstep(7.5, 5.0, mag);
        vColor = mix(color, pow(color, vec3(2.2)), uLinear);  // sRGB tint -> linear for haze
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const starFragmentShader = `
    varying vec3 vColor;
    varying float vAlpha;
    varying float vGlow;

    void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        // Sprite grows with vGlow, so tighten the core to keep it the same size
        float coreScale = (1.0 + vGlow * 2.0) * (1.0 + vGlow * 2.0);
        float core = exp(-r * r * 8.0 * coreScale);
        float halo = 0.35 * exp(-r * r * 2.5 * coreScale) + vGlow * 0.3 * exp(-r * r * 4.0);
        float alpha = (core + halo) * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
    }
`;

// Fixed-size ring drawn around the hovered / selected star
const ringVertexShader = `
    uniform float uSize;
    void main() {
        gl_PointSize = uSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const ringFragmentShader = `
    uniform vec3 uColor;
    uniform float uOpacity;
    void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float alpha = smoothstep(0.72, 0.8, r) * (1.0 - smoothstep(0.9, 0.98, r)) * uOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
    }
`;

function makeStarPoints(positions, colors, absMags, pixelRatio, maxSize = 24) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('absMag', new THREE.BufferAttribute(absMags, 1));
    const material = new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: { value: pixelRatio }, uLinear: { value: 0 }, uMaxSize: { value: maxSize } },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geometry, material);
}

function makeRing(color, opacity, sizePx) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uSize: { value: sizePx },
            // Raw hex values, like the star shader (no colour management)
            uColor: { value: new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace) },
            uOpacity: { value: opacity },
        },
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const ring = new THREE.Points(geometry, material);
    ring.renderOrder = 10;
    ring.visible = false;
    ring.frustumCulled = false;
    return ring;
}

// Ring geometry sits at its own origin; the ring is placed by object
// position (JS doubles), so it works in any layer. xyz null hides it.
function placeRing(ring, xyz) {
    ring.visible = xyz !== null;
    if (xyz) ring.position.set(xyz[0], xyz[1], xyz[2]);
}

function makeLines(flatPositions, color, opacity) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(flatPositions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    return new THREE.LineSegments(geometry, material);
}

function disposeObject(obj) {
    if (!obj) return;
    obj.geometry.dispose();
    obj.material.dispose();
}

// A distance in ly, in km / AU / ly to suit
function formatLength(ly) {
    const au = ly * AU_PER_LY;
    if (au < 0.01) return `${Number((au * KM_PER_AU).toPrecision(3)).toLocaleString()} km`;
    if (ly < 0.05) return `${au < 10 ? au.toFixed(2) : Math.round(au).toLocaleString()} AU`;
    if (ly < 10) return `${ly.toFixed(2)} ly`;
    return `${Math.round(ly).toLocaleString()} ly`;
}

// Readout: how far the centre point (orbit target) is from the Sun, so it
// stays put while rotating. In free look the centre is just in front of
// the camera, so this is where you are. Positions in ly from the Sun.
function formatDistance(target, earthPosition) {
    if (target.distanceTo(earthPosition) < EARTH_RADIUS_LY) return 'Earth';
    return `${formatLength(target.length())} from the Sun`;
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function Universe3D({ constellationData, stars3d, planetFacts, onBack }) {
    const [selectedAbbrev, setSelectedAbbrev] = useState('Ori');
    const [showLines, setShowLines] = useState(true);
    const [showAllLines, setShowAllLines] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [showPlanets, setShowPlanets] = useState(true);
    const [showOrbits, setShowOrbits] = useState(true);
    // At most one of these is set: a star index, or a solar system body id
    const [selectedStar, setSelectedStar] = useState(null);
    const [selectedBody, setSelectedBody] = useState(null);
    // On phones the options panel starts collapsed so it doesn't cover the sky
    const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 767);
    // Starts in free look: standing on Earth, looking at the sky
    const [viewMode, setViewMode] = useState('free');  // 'orbit' | 'free'
    // Bloom haze: on by default except on touch devices (heavy for phone GPUs)
    const [showHaze, setShowHaze] = useState(() => !window.matchMedia('(pointer: coarse)').matches);
    const skipModeReset = useRef(false);
    const mountRef = useRef(null);
    const labelsRef = useRef(null);
    const tooltipRef = useRef(null);
    const distanceRef = useRef(null);
    const scaleBarRef = useRef(null);
    const scaleLabelRef = useRef(null);
    const sceneRef = useRef(null);  // three.js objects + helpers, set up once
    const optionsRef = useRef({});  // current toggles, read by the render loop

    const starBuffers = useMemo(() => (stars3d ? buildStarBuffers(stars3d) : null), [stars3d]);
    const lineStarInfo = useMemo(() => buildLineStarInfo(constellationData), [constellationData]);
    const searchItems = useMemo(
        () => (starBuffers ? buildSearchIndex(constellationData, starBuffers, lineStarInfo, planetFacts) : []),
        [constellationData, starBuffers, lineStarInfo, planetFacts]
    );

    const sortedAbbrevs = useMemo(
        () => Object.keys(constellationData).sort((a, b) =>
            constellationData[a].name.localeCompare(constellationData[b].name)),
        [constellationData]
    );

    const selectedHips = useMemo(
        () => new Set(constellationData[selectedAbbrev].stars.map(s => Number(s.hip))),
        [constellationData, selectedAbbrev]
    );

    optionsRef.current = { showLines, showAllLines, showLabels, showPlanets, selectedAbbrev, selectedHips };

    const selectStar = (index) => {
        setSelectedBody(null);
        setSelectedStar(index);
    };
    const selectBody = (id) => {
        setSelectedStar(null);
        setSelectedBody(id);
    };

    // Set up renderer, scene, camera, stars, picking and labels once
    useEffect(() => {
        if (!starBuffers) return;
        const mount = mountRef.current;
        const labelsEl = labelsRef.current;
        const tooltip = tooltipRef.current;
        const pixelRatio = Math.min(window.devicePixelRatio, 2);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(pixelRatio);
        renderer.setClearColor(0x02040a);
        mount.appendChild(renderer.domElement);

        // Master camera: ly from the Sun, driven by OrbitControls, never
        // rendered. Each layer derives its own camera from it (utils/layers3d).
        const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.0001, 1e6);
        camera.up.set(0, 1, 0);  // celestial north

        // Far -> near. The Earth layer (km) comes with satellites.
        const starLayer = createLayer({ name: 'universe', unit: 1, near: 0.0001, far: 1e6 });
        const solarLayer = createLayer({ name: 'solar system', unit: 1 / AU_PER_LY, near: 1e-7, far: 1e5 });
        const layers = [starLayer, solarLayer];
        const scene = starLayer.scene;
        const starCamera = starLayer.camera;  // for picking and labels
        const solarCamera = solarLayer.camera;
        const syncCameras = () => layers.forEach(layer => syncLayerCamera(layer, camera));

        // Planets at today's positions (a clock comes later). Without
        // planets.json the layer stays empty and Earth stays at the Sun.
        const solar = planetFacts ? buildSolarSystem(solarLayer.scene, planetFacts, pixelRatio) : null;
        solar?.update(new Date());
        const earthPosition = new THREE.Vector3();
        if (solar?.byId.has('Earth')) earthPosition.copy(solar.byId.get('Earth').position).divideScalar(AU_PER_LY);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.5;
        controls.minDistance = ORBIT_MIN_DISTANCE;
        controls.maxDistance = 50000;
        // Start at Earth looking at the selected constellation
        camera.position.copy(earthPosition);
        controls.target.set(...constellationFocus(
            constellationData[optionsRef.current.selectedAbbrev], starBuffers
        ));

        const stars = makeStarPoints(starBuffers.positions, starBuffers.colors, starBuffers.absMags, pixelRatio);
        scene.add(stars);

        // The Sun, so you can find home after flying away
        const sun = makeStarPoints(
            new Float32Array([0, 0, 0]),
            new Float32Array(bvToColor(SUN_BV)),
            new Float32Array([SUN_ABS_MAG]),
            pixelRatio,
            40
        );
        scene.add(sun);

        // One hover/selected ring pair per layer
        const hoverRing = makeRing(0xcbd5e1, 0.6, 26 * pixelRatio);
        const selectedRing = makeRing(0xfacc15, 0.9, 30 * pixelRatio);
        scene.add(hoverRing, selectedRing);
        const bodyHoverRing = makeRing(0xcbd5e1, 0.6, 26 * pixelRatio);
        const bodySelectedRing = makeRing(0xfacc15, 0.9, 30 * pixelRatio);
        solarLayer.scene.add(bodyHoverRing, bodySelectedRing);

        // Haze: bloom post-processing, used when s.haze is on
        const composer = new EffectComposer(renderer);
        const layerPasses = addLayerPasses(composer, layers);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.4, 0.6);
        composer.addPass(bloomPass);
        composer.addPass(new OutputPass());

        const s = {
            scene, camera, controls, selectedRing, bodySelectedRing, solar,
            selectedLines: null, allLines: null, flight: null, mode: 'orbit', haze: false,
            // Earth in ly from the Sun; everything Earth-relative reads this
            earthPosition,
        };
        // A body's position in ly from the Sun, as an array
        s.bodyPositionLy = (id) => solar.byId.get(id).position.toArray().map(v => v / AU_PER_LY);
        s.setHaze = (on) => {
            s.haze = on;
            solar?.setHaze(on);
            stars.material.uniforms.uLinear.value = on ? 1 : 0;
            sun.material.uniforms.uLinear.value = on ? 1 : 0;
        };
        sceneRef.current = s;

        // Free look: scroll / pinch change the field of view (OrbitControls zoom
        // is off). Drag speed scales with the FOV so the sky stays under the cursor.
        s.setFov = (fov) => {
            camera.fov = THREE.MathUtils.clamp(fov, MIN_FOV, MAX_FOV);
            camera.updateProjectionMatrix();
            if (s.mode === 'free') controls.rotateSpeed = -0.2 * camera.fov / DEFAULT_FOV;
        };
        const onWheel = (e) => {
            if (s.mode !== 'free') return;
            e.preventDefault();
            s.setFov(camera.fov * Math.exp(e.deltaY * 0.001));
        };
        let pinchDistance = null;
        const touchDistance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        const onTouchStart = (e) => {
            pinchDistance = e.touches.length === 2 ? touchDistance(e.touches) : null;
        };
        const onTouchMove = (e) => {
            if (s.mode !== 'free' || e.touches.length !== 2 || !pinchDistance) return;
            const d = touchDistance(e.touches);
            s.setFov(camera.fov * pinchDistance / d);
            pinchDistance = d;
        };
        renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
        renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
        renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });

        // ---------- Camera flights ----------
        // Positions are in ly from the Sun (master camera space).
        // minDistance: how close the user may then zoom to the new target;
        // defaults to the current mode's. OrbitControls enforces it every
        // frame, so during the flight it is the smaller of old and new.
        s.defaultMinDistance = () => (s.mode === 'free' ? FREE_LOOK_RADIUS / 2 : ORBIT_MIN_DISTANCE);
        s.flyTo = (toPosition, toTarget, minDistance = s.defaultMinDistance()) => {
            const toPos = new THREE.Vector3(...toPosition);
            const toTgt = new THREE.Vector3(...toTarget);
            controls.minDistance = Math.min(controls.minDistance, minDistance);
            s.flight = {
                fromTarget: controls.target.clone(),
                toTarget: toTgt,
                fromOffset: camera.position.clone().sub(controls.target),
                toOffset: toPos.clone().sub(toTgt),
                pivot: toPos,
                minDistance,
                start: performance.now(),
            };
        };
        // Any drag/zoom by the user cancels a flight in progress
        controls.addEventListener('start', () => { s.flight = null; });

        // Move from a to b by swinging around a pivot: direction slerped,
        // distance interpolated in log space, so a flight covering many
        // orders of magnitude spends equal time at each scale. An end on
        // the pivot (log(0)) is treated as minR away in the other end's
        // direction; both ends on it is a straight line.
        const relA = new THREE.Vector3();
        const relB = new THREE.Vector3();
        const identity = new THREE.Quaternion();
        const fullRotation = new THREE.Quaternion();
        const rotation = new THREE.Quaternion();
        const swing = (out, a, b, k, pivot, minR) => {
            relA.subVectors(a, pivot);
            relB.subVectors(b, pivot);
            let r0 = relA.length();
            let r1 = relB.length();
            if (r0 < 1e-12 && r1 < 1e-12) return out.lerpVectors(a, b, k);
            if (r0 < 1e-12) {
                relA.copy(relB);
                r0 = Math.min(minR, r1);
                relA.setLength(r0);
            }
            if (r1 < 1e-12) {
                relB.copy(relA);
                r1 = Math.min(minR, r0);
                relB.setLength(r1);
            }
            relA.divideScalar(r0);
            relB.divideScalar(r1);
            fullRotation.setFromUnitVectors(relA, relB);
            rotation.slerpQuaternions(identity, fullRotation, k);
            return out.copy(relA).applyQuaternion(rotation)
                .multiplyScalar(r0 * Math.pow(r1 / r0, k))
                .add(pivot);
        };

        // The target swings around the flight's end camera position, so
        // switching between constellations on opposite sides of the sky
        // doesn't pass near the camera. The camera follows as target +
        // offset, the offset swinging the same way: when the camera starts
        // and ends at the same place (Earth) both swing together and it
        // stays exactly put; flying to a star or planet, the distance to it
        // shrinks smoothly in log space instead of a straight line that is
        // far out most of the time.
        const origin = new THREE.Vector3();
        const offset = new THREE.Vector3();
        const updateFlight = (now) => {
            const f = s.flight;
            if (!f) return;
            const t = Math.min(1, (now - f.start) / (FLIGHT_SECONDS * 1000));
            const k = easeInOutCubic(t);
            // A target starting on the pivot (e.g. orbiting Earth, flying
            // back to the Earth view) starts 1% of the camera distance out,
            // so the view barely jumps on the first frame
            const minR = Math.max(0.01 * Math.min(f.fromOffset.length(), f.toOffset.length()), 1e-12);
            swing(controls.target, f.fromTarget, f.toTarget, k, f.pivot, minR);
            swing(offset, f.fromOffset, f.toOffset, k, origin, minR);
            camera.position.copy(controls.target).add(offset);

            if (t === 1) {
                controls.target.copy(f.toTarget);
                camera.position.copy(f.toTarget).add(f.toOffset);
                controls.minDistance = f.minDistance;
                s.flight = null;
            }
        };

        // ---------- Screen-space star picking ----------
        const { positions, absMags, count } = starBuffers;
        const viewProjection = new THREE.Matrix4();

        // Visible stars near a screen point; prefers closer and brighter ones
        const pickStar = (clientX, clientY, radiusPx) => {
            const rect = renderer.domElement.getBoundingClientRect();
            const mx = clientX - rect.left;
            const my = clientY - rect.top;
            // The view may have moved since the last frame
            syncLayerCamera(starLayer, camera);
            viewProjection.multiplyMatrices(starCamera.projectionMatrix, starCamera.matrixWorldInverse);
            const e = viewProjection.elements;
            const cam = starCamera.position;
            let best = null;
            let bestScore = Infinity;
            for (let i = 0; i < count; i++) {
                const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
                const w = e[3] * x + e[7] * y + e[11] * z + e[15];
                if (w <= 0) continue;  // behind the camera
                const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w + 1) / 2 * rect.width;
                const sy = (1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w) / 2 * rect.height;
                const d = Math.hypot(sx - mx, sy - my);
                if (d > radiusPx) continue;
                const distPc = Math.max(Math.hypot(x - cam.x, y - cam.y, z - cam.z) / LY_PER_PARSEC, 1e-4);
                const mag = absMags[i] + 5 * Math.log10(distPc) - 5;
                if (mag > PICK_MAG_LIMIT) continue;
                const score = d + mag * 2;
                if (score < bestScore) {
                    bestScore = score;
                    best = i;
                }
            }
            return best;
        };

        const starLabel = (index) => {
            const rec = starRecord(starBuffers, index);
            return rec.name || formatBayer(lineStarInfo.get(rec.hip)?.bayer) || `HIP ${rec.hip}`;
        };

        // ---------- Solar system bodies: screen positions + picking ----------
        // How visible the solar system is (0..1), set each frame
        let solarFade = 0;
        const bodyProjected = new THREE.Vector3();
        // Screen position and drawn radius (px) of a body, or null when it is
        // off screen, behind the camera, or the camera is inside it
        const bodyOnScreen = (body, width, height) => {
            const dist = body.position.distanceTo(solarCamera.position);
            if (dist < body.radiusAu * 1.5) return null;
            bodyProjected.copy(body.position).project(solarCamera);
            if (bodyProjected.z > 1 || Math.abs(bodyProjected.x) > 1.05 || Math.abs(bodyProjected.y) > 1.05) return null;
            const radiusPx = body.radiusAu / dist * (height / 2) / Math.tan(THREE.MathUtils.degToRad(solarCamera.fov) / 2);
            return { x: (bodyProjected.x + 1) / 2 * width, y: (1 - bodyProjected.y) / 2 * height, radiusPx };
        };
        const bodiesActive = () => solar && solarLayer.visible && solarFade >= BODY_MIN_FADE;

        // Nearest body (by screen distance) whose dot or disc is under the point
        const pickBody = (clientX, clientY, radiusPx) => {
            if (!bodiesActive()) return null;
            const rect = renderer.domElement.getBoundingClientRect();
            const mx = clientX - rect.left;
            const my = clientY - rect.top;
            syncLayerCamera(solarLayer, camera);
            let best = null;
            let bestDist = Infinity;
            for (const body of solar.bodies) {
                const p = bodyOnScreen(body, rect.width, rect.height);
                if (!p) continue;
                const d = Math.hypot(p.x - mx, p.y - my);
                if (d <= Math.max(p.radiusPx, 0) + radiusPx && d < bestDist) {
                    bestDist = d;
                    best = body.id;
                }
            }
            return best;
        };

        // Planets win over stars: they're drawn on top
        const pickAny = (clientX, clientY, radiusPx) => {
            const id = pickBody(clientX, clientY, radiusPx);
            if (id !== null) return { type: 'body', id };
            const index = pickStar(clientX, clientY, radiusPx);
            return index === null ? null : { type: 'star', index };
        };

        const showHover = (hit) => {
            placeRing(hoverRing, hit?.type === 'star' ? positions.subarray(hit.index * 3, hit.index * 3 + 3) : null);
            placeRing(bodyHoverRing, hit?.type === 'body' ? solar.byId.get(hit.id).position.toArray() : null);
        };

        // Click (not drag) selects a star or planet; empty space clears the selection
        let downAt = null;
        const onPointerDown = (e) => {
            downAt = { x: e.clientX, y: e.clientY };
            // Hide the hover state while dragging; it is stale once the view moves
            showHover(null);
            tooltip.style.display = 'none';
        };
        const onPointerUp = (e) => {
            if (!downAt || e.button !== 0) return;
            const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
            downAt = null;
            if (moved > 5) return;
            const hit = pickAny(e.clientX, e.clientY, e.pointerType === 'touch' ? 24 : 14);
            setSelectedStar(hit?.type === 'star' ? hit.index : null);
            setSelectedBody(hit?.type === 'body' ? hit.id : null);
        };
        // Hover: ring + name tooltip (mouse only, throttled to one pick per frame)
        let hoverRequest = null;
        const onPointerMove = (e) => {
            if (e.pointerType !== 'mouse' || e.buttons !== 0 || hoverRequest) return;
            hoverRequest = requestAnimationFrame(() => {
                hoverRequest = null;
                const hit = pickAny(e.clientX, e.clientY, 12);
                showHover(hit);
                renderer.domElement.style.cursor = hit === null ? '' : 'pointer';
                if (hit === null) {
                    tooltip.style.display = 'none';
                } else {
                    tooltip.textContent = hit.type === 'star' ? starLabel(hit.index) : solar.byId.get(hit.id).name;
                    tooltip.style.display = 'block';
                    tooltip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
                }
            });
        };
        const onPointerLeave = () => {
            showHover(null);
            tooltip.style.display = 'none';
        };
        const canvas = renderer.domElement;
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerleave', onPointerLeave);

        // ---------- Labels (HTML overlay, positioned every frame) ----------
        const makeLabelEl = (text, className) => {
            const el = document.createElement('div');
            el.className = className;
            el.textContent = text;
            el.style.display = 'none';
            labelsEl.appendChild(el);
            return el;
        };
        const starLabels = [];
        for (let i = 0; i < count; i++) {
            const rec = starRecord(starBuffers, i);
            if (rec.name) starLabels.push({ index: i, hip: rec.hip, el: makeLabelEl(rec.name, 'universe-3d-label'), shown: false });
        }
        const constellationLabels = Object.values(constellationData).map(c => ({
            abbrev: c.abbrev,
            position: new THREE.Vector3(...constellationFocus(c, starBuffers)),
            el: makeLabelEl(c.name, 'universe-3d-label universe-3d-label-constellation'),
            shown: false,
        }));
        // Sun first, Moon last: a label overlapping an earlier one is hidden
        const bodyLabels = (solar?.bodies ?? []).map(body => ({
            body,
            el: makeLabelEl(body.name, 'universe-3d-label universe-3d-label-planet'),
            shown: false,
        }));
        const placedLabels = [];

        const projected = new THREE.Vector3();
        const toScreen = (position, width, height) => {
            projected.copy(position).project(starCamera);
            if (projected.z > 1 || Math.abs(projected.x) > 1.05 || Math.abs(projected.y) > 1.05) return null;
            return [(projected.x + 1) / 2 * width, (1 - projected.y) / 2 * height];
        };
        const setLabel = (label, screenPos, dx, dy) => {
            const show = screenPos !== null;
            if (show !== label.shown) {
                label.el.style.display = show ? 'block' : 'none';
                label.shown = show;
            }
            if (show) label.el.style.transform = `translate(${screenPos[0] + dx}px, ${screenPos[1] + dy}px)`;
        };
        const starPosition = new THREE.Vector3();

        const updateLabels = () => {
            const opts = optionsRef.current;
            const { clientWidth: width, clientHeight: height } = mount;
            for (const label of starLabels) {
                let screenPos = null;
                if (opts.showLabels) {
                    starPosition.fromArray(positions, label.index * 3);
                    const distPc = Math.max(starPosition.distanceTo(starCamera.position) / LY_PER_PARSEC, 1e-4);
                    const mag = absMags[label.index] + 5 * Math.log10(distPc) - 5;
                    const inFigure = opts.selectedHips.has(label.hip);
                    if (mag <= LABEL_MAG_LIMIT || (inFigure && mag <= PICK_MAG_LIMIT)) {
                        screenPos = toScreen(starPosition, width, height);
                    }
                }
                setLabel(label, screenPos, 8, -8);
            }
            for (const label of constellationLabels) {
                const wanted = opts.showLabels && (
                    label.abbrev === opts.selectedAbbrev || (opts.showLines && opts.showAllLines)
                );
                setLabel(label, wanted ? toScreen(label.position, width, height) : null, 0, 0);
            }
            // The Sun is labelled from anywhere, so you can find home
            placedLabels.length = 0;
            for (const label of bodyLabels) {
                const { body } = label;
                let screenPos = null;
                const wanted = opts.showLabels && (body.id === 'Sun' || (opts.showPlanets && bodiesActive()));
                const p = wanted ? bodyOnScreen(body, width, height) : null;
                if (p && !placedLabels.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 16)) {
                    placedLabels.push(p);
                    const r = Math.min(p.radiusPx, height / 4) * 0.7;
                    screenPos = [p.x + r, p.y - r];
                }
                setLabel(label, screenPos, 8, -8);
            }
        };

        // ---------- Resize + render loop ----------
        const resize = () => {
            const { clientWidth, clientHeight } = mount;
            renderer.setSize(clientWidth, clientHeight);
            composer.setPixelRatio(pixelRatio);
            composer.setSize(clientWidth, clientHeight);
            camera.aspect = clientWidth / clientHeight;
            camera.updateProjectionMatrix();
            solar?.setViewportHeight(clientHeight * pixelRatio);
        };
        resize();
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);

        // ---------- Scale bar ----------
        // Measured at the orbit point (screen centre): things nearer or
        // farther are drawn bigger or smaller. In free look the target is
        // just in front of the camera, so it shows an angle on the sky.
        let lastScale = '';
        const updateScaleBar = () => {
            const bar = scaleBarRef.current;
            const label = scaleLabelRef.current;
            if (!bar || !label) return;
            const { clientWidth: width, clientHeight: height } = mount;
            if (!height) return;
            const maxPx = Math.min(120, width * 0.25);
            let px, text;
            if (s.mode === 'free') {
                const degPerPx = camera.fov / height;
                const { lengthDeg, label: l } = scaleBarAngle(maxPx * degPerPx);
                px = lengthDeg / degPerPx;
                text = l;
            } else {
                const dist = camera.position.distanceTo(controls.target);
                const lyPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / height;
                const { lengthLy, label: l } = scaleBarDistance(maxPx * lyPerPx);
                px = lengthLy / lyPerPx;
                text = l;
            }
            const key = `${Math.round(px)}|${text}`;
            if (key === lastScale) return;
            lastScale = key;
            bar.style.width = `${Math.round(px)}px`;
            label.textContent = text;
        };

        let frameId;
        let lastDistanceLabel = '';
        const animate = (now) => {
            updateFlight(now);
            controls.update();
            // The solar system fades out as the camera leaves it
            solarFade = solar ? solar.fadeForDistance(camera.position.length() * AU_PER_LY) : 0;
            solar?.setFade(solarFade);
            solarLayer.visible = solarFade > 0 && optionsRef.current.showPlanets;
            syncCameras();
            if (s.haze) {
                syncLayerPasses(layerPasses, layers);
                composer.render();
            } else {
                renderLayers(renderer, layers);
            }
            updateLabels();
            updateScaleBar();
            // Update the distance readout directly to avoid a React render per frame
            const distanceLabel = formatDistance(controls.target, s.earthPosition);
            if (distanceLabel !== lastDistanceLabel && distanceRef.current) {
                distanceRef.current.textContent = distanceLabel;
                lastDistanceLabel = distanceLabel;
            }
            frameId = requestAnimationFrame(animate);
        };
        frameId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(frameId);
            if (hoverRequest) cancelAnimationFrame(hoverRequest);
            resizeObserver.disconnect();
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            controls.dispose();
            [stars, sun, hoverRing, selectedRing, bodyHoverRing, bodySelectedRing, s.selectedLines, s.allLines]
                .forEach(disposeObject);
            solar?.dispose();
            bloomPass.dispose();
            composer.dispose();
            renderer.dispose();
            mount.removeChild(canvas);
            labelsEl.replaceChildren();
            sceneRef.current = null;
        };
    }, [starBuffers, lineStarInfo, constellationData, planetFacts]);

    // Fly back to Earth, looking at the selected constellation. In free look
    // the target sits just in front of the camera, in that direction.
    const resetToEarthView = (mode = viewMode) => {
        const s = sceneRef.current;
        if (!s) return;
        const focus = constellationFocus(constellationData[selectedAbbrev], starBuffers);
        const earth = s.earthPosition.toArray();
        if (mode === 'free') {
            const dir = focus.map((v, i) => v - earth[i]);
            const len = Math.hypot(...dir);
            s.flyTo(earth, dir.map((v, i) => earth[i] + v / len * FREE_LOOK_RADIUS));
        } else {
            s.flyTo(earth, focus);
        }
        s.setFov(DEFAULT_FOV);
    };

    // Orbit: drag circles the target, scroll zooms toward it.
    // Free look: the camera sits at Earth; drag turns the view, scroll changes the FOV.
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        if (skipModeReset.current) {
            skipModeReset.current = false;
            return;
        }
        const free = viewMode === 'free';
        s.mode = viewMode;
        s.controls.enableZoom = !free;
        s.controls.enablePan = !free;
        // minDistance is set by the flight (s.defaultMinDistance). In free
        // look the speed is negative (drag the sky, like a planetarium);
        // resetToEarthView -> setFov sets it
        s.controls.rotateSpeed = 0.5;
        resetToEarthView(viewMode);
    }, [viewMode]);

    // Leave free look without the reset flight the mode effect would start
    const switchToOrbitMode = () => {
        const s = sceneRef.current;
        if (viewMode !== 'free') return;
        s.mode = 'orbit';
        s.controls.enableZoom = true;
        s.controls.enablePan = true;
        s.controls.rotateSpeed = 0.5;
        s.setFov(DEFAULT_FOV);
        skipModeReset.current = true;
        setViewMode('orbit');
    };

    // How close you may zoom to a planet: just above its surface
    const bodyMinDistance = (id) => sceneRef.current.solar.byId.get(id).radiusAu * 1.2 / AU_PER_LY;

    // Turn to face a planet, like lookAtStar. Earth itself can't be seen
    // from Earth, so that one flies out to it instead.
    const lookAtBody = (id) => {
        const s = sceneRef.current;
        if (!s?.solar) return;
        if (id === 'Earth') {
            flyToBody(id);
            return;
        }
        const p = s.bodyPositionLy(id);
        if (viewMode === 'free') {
            const cam = s.camera.position;
            const dir = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z];
            const len = Math.hypot(...dir);
            s.flyTo(cam.toArray(), dir.map((v, i) => cam.getComponent(i) + v / len * FREE_LOOK_RADIUS));
        } else {
            s.flyTo(s.earthPosition.toArray(), p, bodyMinDistance(id));
        }
    };

    // Fly out to a planet: a few radii away on its sunlit side, a little
    // above the ecliptic. The Sun gets a view of the whole Solar System.
    const flyToBody = (id) => {
        const s = sceneRef.current;
        if (!s?.solar) return;
        switchToOrbitMode();
        const body = s.solar.byId.get(id);
        const p = new THREE.Vector3(...s.bodyPositionLy(id));
        let offset;
        if (id === 'Sun') {
            // Above the ecliptic on Earth's side, far enough to see Neptune's orbit
            offset = s.earthPosition.clone().normalize().add(ECLIPTIC_NORTH.clone().multiplyScalar(1.2))
                .normalize().multiplyScalar(60 / AU_PER_LY);
        } else {
            const distance = body.radiusAu * (id === 'Saturn' ? 9 : 6) / AU_PER_LY;
            offset = p.clone().normalize().negate().add(ECLIPTIC_NORTH.clone().multiplyScalar(0.35))
                .normalize().multiplyScalar(distance);
        }
        s.flyTo(p.clone().add(offset).toArray(), p.toArray(), bodyMinDistance(id));
    };

    // Turn to face a star. Free look turns in place; orbit goes back to Earth
    // and orbits the star, so you see where it is in the night sky.
    const lookAtStar = (index) => {
        const s = sceneRef.current;
        if (!s) return;
        const p = starBuffers.positions.subarray(index * 3, index * 3 + 3);
        if (viewMode === 'free') {
            const cam = s.camera.position;
            const dir = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z];
            const len = Math.hypot(...dir);
            s.flyTo(cam.toArray(), dir.map((v, i) => cam.getComponent(i) + v / len * FREE_LOOK_RADIUS));
        } else {
            s.flyTo(s.earthPosition.toArray(), [p[0], p[1], p[2]]);
        }
    };

    const handleSearchSelect = (item) => {
        if (item.type === 'constellation') {
            if (item.abbrev === selectedAbbrev) resetToEarthView();
            else setSelectedAbbrev(item.abbrev);
        } else if (item.type === 'star') {
            selectStar(item.starIndex);
            lookAtStar(item.starIndex);
        } else if (item.type === 'planet') {
            selectBody(item.id);
            lookAtBody(item.id);
        }
    };

    // Stop just short of the star (on the Earth side), looking at it
    const flyToStar = (index) => {
        const s = sceneRef.current;
        if (!s) return;
        switchToOrbitMode();
        const p = Array.from(starBuffers.positions.subarray(index * 3, index * 3 + 3));
        const earth = s.earthPosition.toArray();
        const dir = p.map((v, i) => v - earth[i]);
        const dist = Math.hypot(...dir);
        const keep = 1 - Math.min(Math.max(dist * 0.05, 0.3), 15) / dist;
        s.flyTo(dir.map((v, i) => earth[i] + v * keep), p, ORBIT_MIN_DISTANCE);
    };

    // Draw the selected constellation's stick figure and fly to it from Earth
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        if (s.selectedLines) {
            s.scene.remove(s.selectedLines);
            disposeObject(s.selectedLines);
        }
        s.selectedLines = makeLines(
            constellationLinePositions(constellationData[selectedAbbrev], starBuffers),
            0x60a5fa,
            0.8
        );
        s.selectedLines.visible = showLines;
        s.scene.add(s.selectedLines);
        resetToEarthView();
    }, [selectedAbbrev, starBuffers]);

    // Line visibility. All 88 stick figures are built on first use.
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        if (s.selectedLines) s.selectedLines.visible = showLines;
        if (showLines && showAllLines && !s.allLines) {
            const flat = Object.values(constellationData)
                .flatMap(c => constellationLinePositions(c, starBuffers));
            s.allLines = makeLines(flat, 0x94a3b8, 0.25);
            s.scene.add(s.allLines);
        }
        if (s.allLines) s.allLines.visible = showLines && showAllLines;
    }, [showLines, showAllLines, starBuffers]);

    useEffect(() => {
        sceneRef.current?.setHaze(showHaze);
    }, [showHaze, starBuffers]);

    useEffect(() => {
        sceneRef.current?.solar?.setShowOrbits(showOrbits);
    }, [showOrbits, starBuffers, planetFacts]);

    // Ring around the selected star or planet
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        const i = selectedStar;
        placeRing(s.selectedRing, i === null ? null : starBuffers.positions.subarray(i * 3, i * 3 + 3));
        placeRing(s.bodySelectedRing, selectedBody && s.solar ? s.solar.byId.get(selectedBody).position.toArray() : null);
    }, [selectedStar, selectedBody, starBuffers, planetFacts]);

    // Keyboard: Esc closes the card, then goes back. L lines, N names, R reset.
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') {
                if (e.code !== 'Escape') return;
            }
            if (e.code === 'Escape') {
                if (selectedStar !== null || selectedBody !== null) selectStar(null);
                else onBack();
            }
            if (e.code === 'KeyL') setShowLines(prev => !prev);
            if (e.code === 'KeyN') setShowLabels(prev => !prev);
            if (e.code === 'KeyR') resetToEarthView();
            if (e.code === 'KeyF') setViewMode(mode => (mode === 'free' ? 'orbit' : 'free'));
            if (e.code === 'KeyH') setShowHaze(prev => !prev);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    if (!stars3d) {
        return (
            <div className="universe-3d-screen universe-3d-error">
                <button className="back-button" onClick={onBack}>← Back</button>
                <p>Failed to load the 3D star catalogue.</p>
            </div>
        );
    }

    const selected = constellationData[selectedAbbrev];
    const star = selectedStar !== null ? starRecord(starBuffers, selectedStar) : null;
    const solar = sceneRef.current?.solar;
    const body = selectedBody !== null && solar ? solar.byId.get(selectedBody) : null;
    // Current distances (AU), for the card
    const bodyDistances = body && {
        sun: body.position.length(),
        earth: body.position.distanceTo(solar.byId.get('Earth').position),
    };

    return (
        <div className={`universe-3d-screen ${star || body ? 'has-card' : ''}`}>
            <div className="universe-3d-canvas" ref={mountRef} />
            <div className="universe-3d-labels" ref={labelsRef} />
            <div className="universe-3d-tooltip" ref={tooltipRef} />

            <button className="back-button" onClick={onBack}>← Back</button>

            <Universe3DSearch items={searchItems} starBuffers={starBuffers} onSelect={handleSearchSelect} />

            <button
                className="universe-3d-panel-toggle"
                onClick={() => setPanelOpen(open => !open)}
                aria-expanded={panelOpen}
            >
                {panelOpen ? '✕ Close' : '☰ Options'}
            </button>

            <div className={`universe-3d-panel ${panelOpen ? 'open' : ''}`}>
                <div className="universe-3d-segmented" role="group" aria-label="View mode">
                    <button
                        className={viewMode === 'orbit' ? 'active' : ''}
                        onClick={() => setViewMode('orbit')}
                    >
                        Orbit
                    </button>
                    <button
                        className={viewMode === 'free' ? 'active' : ''}
                        onClick={() => setViewMode('free')}
                    >
                        Free look
                    </button>
                </div>
                <select value={selectedAbbrev} onChange={(e) => setSelectedAbbrev(e.target.value)}>
                    {sortedAbbrevs.map(abbrev => (
                        <option key={abbrev} value={abbrev}>{constellationData[abbrev].name}</option>
                    ))}
                </select>
                <label className="universe-3d-checkbox">
                    <input
                        type="checkbox"
                        checked={showLines}
                        onChange={(e) => setShowLines(e.target.checked)}
                    />
                    Show lines
                </label>
                <label className={`universe-3d-checkbox universe-3d-sub-option ${showLines ? '' : 'disabled'}`}>
                    <input
                        type="checkbox"
                        checked={showAllLines}
                        disabled={!showLines}
                        onChange={(e) => setShowAllLines(e.target.checked)}
                    />
                    All constellations
                </label>
                <label className="universe-3d-checkbox">
                    <input
                        type="checkbox"
                        checked={showLabels}
                        onChange={(e) => setShowLabels(e.target.checked)}
                    />
                    Show names
                </label>
                {planetFacts && (
                    <>
                        <label className="universe-3d-checkbox">
                            <input
                                type="checkbox"
                                checked={showPlanets}
                                onChange={(e) => setShowPlanets(e.target.checked)}
                            />
                            Planets
                        </label>
                        <label className={`universe-3d-checkbox universe-3d-sub-option ${showPlanets ? '' : 'disabled'}`}>
                            <input
                                type="checkbox"
                                checked={showOrbits}
                                disabled={!showPlanets}
                                onChange={(e) => setShowOrbits(e.target.checked)}
                            />
                            Orbits
                        </label>
                    </>
                )}
                <label className="universe-3d-checkbox">
                    <input
                        type="checkbox"
                        checked={showHaze}
                        onChange={(e) => setShowHaze(e.target.checked)}
                    />
                    Haze
                </label>
                <button className="button-secondary" onClick={() => resetToEarthView()}>Reset to Earth view</button>
            </div>

            {star && (
                <StarInfoCard
                    star={star}
                    lineInfo={lineStarInfo.get(star.hip)}
                    onClose={() => setSelectedStar(null)}
                    onFlyTo={() => flyToStar(selectedStar)}
                />
            )}
            {body && (
                <PlanetInfoCard
                    body={body}
                    distances={bodyDistances}
                    onClose={() => setSelectedBody(null)}
                    onFlyTo={() => flyToBody(selectedBody)}
                />
            )}

            <div
                className="universe-3d-scale"
                title={viewMode === 'free' ? 'Angle on the sky' : 'Scale at the orbit point (screen centre)'}
            >
                <div ref={scaleLabelRef} className="universe-3d-scale-label" />
                <div ref={scaleBarRef} className="universe-3d-scale-bar" />
            </div>

            <div className="universe-3d-footer">
                <div className="universe-3d-title">{selected.name}</div>
                {selected.name_english && selected.name_english !== selected.name && (
                    <div className="universe-3d-subtitle">{selected.name_english}</div>
                )}
                <div ref={distanceRef} className="universe-3d-distance" />
                <div className="universe-3d-hint">
                    {viewMode === 'free'
                        ? 'Click a star or planet for details · Drag to look around · Scroll to zoom'
                        : 'Click a star or planet for details · Drag to rotate · Scroll to zoom'}
                </div>
            </div>
        </div>
    );
}

export default Universe3D;
