import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { addLayerPasses, createLayer, renderLayers, syncLayerCamera, syncLayerPasses } from '../utils/layers3d';
import { createStarDisc, radiusToLy } from '../utils/starDisc';
import { buildSolarSystem, ECLIPTIC_NORTH, minViewRadii } from '../utils/solarSystem3d';
import {
    AU_PER_LY,
    KM_PER_AU,
    LY_PER_PARSEC,
    buildGaiaBuffers,
    buildLineStarInfo,
    buildSearchIndex,
    buildStarBuffers,
    bvToColor,
    constellationFocus,
    constellationLinePositions,
    formatBayer,
    scaleBarDistance,
    starRecord,
} from '../utils/universe3d';
import { RING_FEATURES, RING_FEATURES_BY_ID, ringLabelKm, ringPole, ringScaleKm, ringSubtitle } from '../utils/rings';
import PlanetInfoCard from './PlanetInfoCard';
import RingInfoCard from './RingInfoCard';
import StarInfoCard from './StarInfoCard';
import Universe3DSearch from './Universe3DSearch';
import Universe3DTimeBar, { nextPresetRate, TIME_RANGE } from './Universe3DTimeBar';
import './Universe3D.css';

const SUN_ABS_MAG = 4.83;
const SUN_BV = 0.65;

// Stars fainter than this (seen from the camera) can't be picked or labelled
const PICK_MAG_LIMIT = 7.0;
// Opacity of stars too faint to see (see the star shader's uMinAlpha)
const STAR_MIN_ALPHA = 0.12;
// Named stars brighter than this get a label; the selected constellation's
// named stars are always labelled
const LABEL_MAG_LIMIT = 2.5;
const FLIGHT_SECONDS = 1.6;
// OrbitControls zoom: each wheel notch scales the distance by 0.95^ZOOM_SPEED
// (~23% at 5). Earth close-up to Orion is ~11 orders of magnitude, so the
// default of 1 (5% a notch) took hundreds of notches.
const ZOOM_SPEED = 5;

// Closest the camera may get to an orbit target that is a star or a
// constellation (ly). Planets use a multiple of their radius instead.
const ORBIT_MIN_DISTANCE = 0.01;
// Stars (radius curated or estimated): "Fly to star" stops this many radii
// from the centre (the disc ~20 deg across), and you may zoom in to this many
const STAR_VIEW_RADII = 6;
const STAR_MIN_RADII = 1.2;
const EARTH_RADIUS_LY = 6378 / KM_PER_AU / AU_PER_LY;
// Planet labels and picking only while the solar system is at least this visible
const BODY_MIN_FADE = 0.3;
// Moons are only picked once drawn this far (px) from their planet's edge
// (their dots fade in from about there; see solarSystem3d)
const MOON_PICK_SEPARATION_PX = 10;
// Earth's marker ring (18 px across) counts as a click target
const EARTH_RING_PICK_PX = 12;
// Solar-system near plane: this fraction of the distance to the nearest
// body's surface (see solarNearPlane)
const SOLAR_NEAR_FRACTION = 0.3;
const FOV = 60;
// Ring and gap labels show once the feature (its ringScaleKm) is drawn
// this many px across: gaps sooner, as they're narrow
const RING_LABEL_PX = 18;
const RING_GAP_LABEL_PX = 6;
// Ring labels keep this far (px) inside the screen edges
const RING_LABEL_MARGIN_PX = 24;
// Points tried around a ring for its label when its right-hand end is off screen
const RING_LABEL_SAMPLES = 48;
// "Ring waves" option: how much the moon-driven ring edges are exaggerated
const RING_WAVE_EXAGGERATION = 10;
// Viewing a ring feature: this many times its size away, at least the minimum
const RING_VIEW_SCALE = 5;
const RING_VIEW_MIN_KM = 2000;

// Points shader: each star stores its absolute magnitude, and the apparent
// magnitude is recomputed from the camera distance every frame. From Earth
// this reproduces the real sky; flying closer makes a star brighter.
// Stars brighter than mag ~2 get a larger sprite with a wide halo (vGlow).
// With haze on, colours are blended in linear light and run through bloom
// + sRGB output, so the faint halos of thousands of stars add up to a glow.
// uMaxSize caps the sprite; the Sun gets a bigger cap so it still gets
// brighter from Neptune to Mercury. The 1e-9 pc clamp (~0.0002 AU) only
// guards log(0); the camera never gets that close to a star centre.
// uMinAlpha keeps stars too faint for the eye as dim dots, so the shape of
// the catalogue (the Gaia 100 pc sphere) shows from outside.
const starVertexShader = `
    attribute float absMag;
    attribute vec3 color;
    uniform float uPixelRatio;
    uniform float uLinear;
    uniform float uMaxSize;
    uniform float uMinAlpha;
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
        vAlpha = max(smoothstep(7.5, 5.0, mag), uMinAlpha);
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

// The line keeps its width in pixels (uWidth) however big the ring is drawn
const ringFragmentShader = `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uSize;
    uniform float uWidth;
    void main() {
        float d = length(gl_PointCoord - 0.5) * uSize;  // px from the centre
        float outer = uSize * 0.47;
        float inner = outer - uWidth;
        float alpha = smoothstep(inner - 1.0, inner, d) * (1.0 - smoothstep(outer, outer + 1.0, d)) * uOpacity;
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
        uniforms: {
            uPixelRatio: { value: pixelRatio },
            uLinear: { value: 0 },
            uMaxSize: { value: maxSize },
            uMinAlpha: { value: STAR_MIN_ALPHA },
        },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geometry, material);
}

// sizePx: device pixels; the ring's minimum size (see sizeRingToBody)
function makeRing(color, opacity, sizePx) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uSize: { value: sizePx },
            uWidth: { value: sizePx * 0.1 },
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
    ring.userData = { minSize: sizePx, opacity };
    return ring;
}

// Around a planet the ring hugs its disc (minimum size when the planet is
// small), and fades out once the planet fills much of the screen: by then
// it's obvious what is selected. radiusPx: the disc's radius in CSS px.
const RING_FADE_PX = [90, 150];
function sizeRingToBody(ring, radiusPx, pixelRatio) {
    const { minSize, opacity } = ring.userData;
    const hug = (radiusPx * 2 * 1.25 + 10) * pixelRatio;
    ring.material.uniforms.uSize.value = Math.max(minSize, hug);
    ring.material.uniforms.uOpacity.value = opacity * (1 - THREE.MathUtils.smoothstep(radiusPx, ...RING_FADE_PX));
}

// Ring geometry sits at its own origin; the ring is placed by object
// position (JS doubles), so it works in any layer. xyz null hides it.
function placeRing(ring, xyz) {
    ring.visible = xyz !== null;
    if (xyz) ring.position.set(xyz[0], xyz[1], xyz[2]);
}

// Line opacity is given as it looks with haze on, where lines blend in
// linear light before the sRGB output. Without haze they blend after sRGB
// encoding, where the same opacity looks about half as bright over the
// dark sky; opacity^(1/2.2) matches it.
function setLineHaze(lines, haze) {
    if (lines) lines.material.opacity = haze ? lines.userData.opacity : Math.pow(lines.userData.opacity, 1 / 2.2);
}

function makeLines(flatPositions, color, opacity, haze) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(flatPositions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.userData.opacity = opacity;
    setLineHaze(lines, haze);
    return lines;
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
// stays put while rotating. Positions in ly from the Sun.
function formatDistance(target, earthPosition) {
    if (target.distanceTo(earthPosition) < EARTH_RADIUS_LY) return 'Earth';
    return `${formatLength(target.length())} from the Sun`;
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function Universe3D({ constellationData, stars3d, planetFacts, moonsData, onBack }) {
    // Constellation picked in search (abbrev), or null: none drawn
    const [selectedAbbrev, setSelectedAbbrev] = useState(null);
    const [showLines, setShowLines] = useState(true);
    const [showAllLines, setShowAllLines] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [showPlanets, setShowPlanets] = useState(true);
    const [showOrbits, setShowOrbits] = useState(true);
    const [showSmallMoons, setShowSmallMoons] = useState(true);
    const [exaggerateRingWaves, setExaggerateRingWaves] = useState(false);
    // At most one of these is set: a star index, a solar system body id, or
    // a ring feature id (utils/rings.js)
    const [selectedStar, setSelectedStar] = useState(null);
    const [selectedBody, setSelectedBody] = useState(null);
    const [selectedRing, setSelectedRing] = useState(null);
    // On phones the options panel starts collapsed so it doesn't cover the sky
    const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 767);
    // What the view is centred on, for the footer title. Starts orbiting
    // Earth from outside (see bodyPose / resetView).
    // {type: 'body', id} | {type: 'star', index} | {type: 'constellation'} | {type: 'none'}
    const [focus, setFocus] = useState(() => (planetFacts ? { type: 'body', id: 'Earth' } : { type: 'none' }));
    // Bloom haze: on by default except on touch devices (heavy for phone GPUs)
    const [showHaze, setShowHaze] = useState(() => !window.matchMedia('(pointer: coarse)').matches);
    const mountRef = useRef(null);
    const labelsRef = useRef(null);
    const tooltipRef = useRef(null);
    const distanceRef = useRef(null);
    const scaleBarRef = useRef(null);
    const scaleLabelRef = useRef(null);
    const sceneRef = useRef(null);  // three.js objects + helpers, set up once
    // Simulated time, advanced by the render loop: {time (ms), rate (simulated
    // seconds per real second; 0 stops, negative runs backwards), playing}.
    // clockView is a copy for the time bar, refreshed a few times a second.
    const clockRef = useRef(null);
    if (!clockRef.current) clockRef.current = { time: Date.now(), rate: 1, playing: true };
    const [clockView, setClockView] = useState(() => ({ ...clockRef.current }));
    const optionsRef = useRef({});  // current toggles, read by the render loop

    const starBuffers = useMemo(() => (stars3d ? buildStarBuffers(stars3d) : null), [stars3d]);
    const gaiaBuffers = useMemo(() => (stars3d?.gaia ? buildGaiaBuffers(stars3d.gaia) : null), [stars3d]);
    const lineStarInfo = useMemo(() => buildLineStarInfo(constellationData), [constellationData]);
    const searchItems = useMemo(
        () => (starBuffers ? buildSearchIndex(constellationData, starBuffers, lineStarInfo, planetFacts, moonsData) : []),
        [constellationData, starBuffers, lineStarInfo, planetFacts, moonsData]
    );

    const selectedHips = useMemo(
        () => new Set(selectedAbbrev ? constellationData[selectedAbbrev].stars.map(s => Number(s.hip)) : []),
        [constellationData, selectedAbbrev]
    );

    optionsRef.current = { showLines, showAllLines, showLabels, showPlanets, selectedAbbrev, selectedHips, selectedRing };

    const selectStar = (index) => {
        setSelectedBody(null);
        setSelectedRing(null);
        setSelectedStar(index);
    };
    const selectBody = (id) => {
        setSelectedStar(null);
        setSelectedRing(null);
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
        const camera = new THREE.PerspectiveCamera(FOV, 1, 0.0001, 1e6);
        camera.up.set(0, 1, 0);  // celestial north

        // Far -> near. The Earth layer (km) comes with satellites.
        const starLayer = createLayer({ name: 'universe', unit: 1, near: 0.0001, far: 1e6 });
        // Real-size disc of the nearest star with a known radius (AU, at that star)
        const starDisc = createStarDisc(starBuffers);
        const solarLayer = createLayer({ name: 'solar system', unit: 1 / AU_PER_LY, near: 1e-7, far: 1e5 });
        const layers = [starLayer, starDisc.layer, solarLayer];
        const scene = starLayer.scene;
        const starCamera = starLayer.camera;  // for picking and labels
        const solarCamera = solarLayer.camera;
        const syncCameras = () => layers.forEach(layer => syncLayerCamera(layer, camera));

        // Planets and moons at the clock's time (see the render loop). Without
        // planets.json the layer stays empty and Earth stays at the Sun.
        const solar = planetFacts ? buildSolarSystem(solarLayer.scene, planetFacts, moonsData, pixelRatio) : null;
        solar?.update(new Date(clockRef.current.time));
        const earthPosition = new THREE.Vector3();
        if (solar?.byId.has('Earth')) earthPosition.copy(solar.byId.get('Earth').position).divideScalar(AU_PER_LY);

        // Camera pose for viewing a body, in ly: a few radii out on its
        // sunlit side, a little above the ecliptic. The Sun gets a view of
        // the whole Solar System. {position, target, minDistance} or null.
        const bodyPose = (id) => {
            const body = solar?.byId.get(id);
            if (!body) return null;
            const p = body.position.clone().divideScalar(AU_PER_LY);
            // How close you may zoom: before its map gets blurry (just
            // above the surface if it has none)
            const pxRadians = THREE.MathUtils.degToRad(camera.fov) / Math.max(mount.clientHeight, 1);
            const minRadii = minViewRadii(body.surfaceMap, pxRadians);
            let offset;
            if (id === 'Sun') {
                // Above the ecliptic on Earth's side, far enough to see Neptune's orbit
                offset = earthPosition.clone().normalize().add(ECLIPTIC_NORTH.clone().multiplyScalar(1.2))
                    .normalize().multiplyScalar(60 / AU_PER_LY);
            } else {
                const radii = Math.max(id === 'Saturn' ? 9 : 6, minRadii * 1.5);
                offset = p.clone().normalize().negate().add(ECLIPTIC_NORTH.clone().multiplyScalar(0.35))
                    .normalize().multiplyScalar(body.radiusAu * radii / AU_PER_LY);
            }
            return {
                position: p.clone().add(offset).toArray(),
                target: p.toArray(),
                minDistance: body.radiusAu * minRadii / AU_PER_LY,
            };
        };

        // Camera pose for viewing a ring feature, in ly: above the ring's
        // sunlit face, looking down at it where it is seen side-on from the
        // Sun (so it isn't in the planet's shadow), from RING_VIEW_SCALE
        // times its size away. {position, target, minDistance} or null.
        const ringPose = (featureId) => {
            const f = RING_FEATURES_BY_ID.get(featureId);
            const planet = f && solar?.byId.get(f.planet);
            if (!planet) return null;
            const pole = new THREE.Vector3(...ringPole(f.planet));
            const toSun = planet.position.clone().negate().normalize();
            if (pole.dot(toSun) < 0) pole.negate();
            const side = new THREE.Vector3().crossVectors(pole, toSun).normalize();
            const target = planet.position.clone().addScaledVector(side, ringLabelKm(f) / KM_PER_AU);
            const viewAu = Math.max(ringScaleKm(f) * RING_VIEW_SCALE, RING_VIEW_MIN_KM) / KM_PER_AU;
            const position = target.clone().addScaledVector(toSun.multiplyScalar(0.5).add(pole).normalize(), viewAu);
            return {
                position: position.divideScalar(AU_PER_LY).toArray(),
                target: target.divideScalar(AU_PER_LY).toArray(),
                minDistance: viewAu * 0.02 / AU_PER_LY,
            };
        };

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.5;
        controls.zoomSpeed = ZOOM_SPEED;
        controls.minDistance = ORBIT_MIN_DISTANCE;
        controls.maxDistance = 50000;
        // Start orbiting Earth (the home view). Without planets: at the Sun,
        // looking at the sky 500 ly out.
        const home = bodyPose('Earth');
        if (home) {
            camera.position.set(...home.position);
            controls.target.set(...home.target);
            controls.minDistance = home.minDistance;
        } else {
            controls.target.set(0, 0, -500);
        }

        const stars = makeStarPoints(starBuffers.positions, starBuffers.colors, starBuffers.absMags, pixelRatio);
        scene.add(stars);

        // Gaia's nearby stars (within 100 pc, not in the catalogue above):
        // drawn only, not picked or labelled
        const gaiaStars = gaiaBuffers
            ? makeStarPoints(gaiaBuffers.positions, gaiaBuffers.colors, gaiaBuffers.absMags, pixelRatio)
            : null;
        if (gaiaStars) scene.add(gaiaStars);

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
        // Earth is hard to find: it gets a blue ring while its sphere is small
        // on screen (placed by updateLabels). One in each layer: the solar
        // system's (AU) while that is drawn, the star layer's (ly) beyond it,
        // whose near plane (0.0001 ly, ~6 AU) would clip it close by.
        const earthMarkerNear = makeRing(0x60a5fa, 0.9, 18 * pixelRatio);
        const earthMarkerFar = makeRing(0x60a5fa, 0.9, 18 * pixelRatio);
        solarLayer.scene.add(bodyHoverRing, bodySelectedRing, earthMarkerNear);
        scene.add(earthMarkerFar);

        // Haze: bloom post-processing, used when s.haze is on
        const composer = new EffectComposer(renderer);
        const layerPasses = addLayerPasses(composer, layers);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.4, 0.6);
        composer.addPass(bloomPass);
        composer.addPass(new OutputPass());

        const s = {
            scene, camera, controls, selectedRing, bodySelectedRing, solar,
            selectedLines: null, allLines: null, flight: null, haze: false,
            // Earth in ly from the Sun; everything Earth-relative reads this
            earthPosition,
            bodyPose,
            ringPose,
            // The body the view rides along with as time runs (see setFollow)
            follow: { id: home ? 'Earth' : null, moveTarget: true },
            selectedBodyId: null,
        };
        // As time runs, keep the view with a moving body: the camera moves
        // with it, and so does the orbit target if it is that body
        // (moveTarget). Looking at stars from Earth, only the camera rides
        // along with Earth. id null: nothing moves.
        s.setFollow = (id, moveTarget = true) => {
            s.follow = { id: id && solar?.byId.has(id) ? id : null, moveTarget };
            s.focused = true;
        };
        // Centred on something (the footer names it); panning away clears it
        s.focused = true;
        s.setHaze = (on) => {
            s.haze = on;
            solar?.setHaze(on);
            [stars, gaiaStars, sun].forEach(obj => { if (obj) obj.material.uniforms.uLinear.value = on ? 1 : 0; });
            starDisc.setHaze(on);
            setLineHaze(s.selectedLines, on);
            setLineHaze(s.allLines, on);
        };
        sceneRef.current = s;

        // ---------- Camera flights ----------
        // Positions are in ly from the Sun (master camera space).
        // minDistance: how close the user may then zoom to the new target.
        // OrbitControls enforces it every frame, so during the flight it is
        // the smaller of old and new.
        s.flyTo = (toPosition, toTarget, minDistance = ORBIT_MIN_DISTANCE) => {
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
        // off screen, behind the camera, or the camera is inside it. Done by
        // hand rather than with project(): that also rejects points past the
        // layer's far plane (1e5 AU, ~1.6 ly), which would hide the Sun and
        // Earth labels from further out.
        const bodyOnScreen = (body, width, height) => {
            const dist = body.position.distanceTo(solarCamera.position);
            if (dist < body.radiusAu * 1.5) return null;
            bodyProjected.copy(body.position).applyMatrix4(solarCamera.matrixWorldInverse);
            if (bodyProjected.z >= 0) return null;  // behind the camera
            bodyProjected.applyMatrix4(solarCamera.projectionMatrix);
            if (Math.abs(bodyProjected.x) > 1.05 || Math.abs(bodyProjected.y) > 1.05) return null;
            const radiusPx = body.radiusAu / dist * (height / 2) / Math.tan(THREE.MathUtils.degToRad(solarCamera.fov) / 2);
            return { x: (bodyProjected.x + 1) / 2 * width, y: (1 - bodyProjected.y) / 2 * height, radiusPx };
        };
        const bodiesActive = () => solar && solarLayer.visible && solarFade >= BODY_MIN_FADE;
        // Earth's ring is showing (set each frame by updateLabels)
        let earthMarked = false;

        // Nearest body (by screen distance) whose dot or disc is under the point
        const pickBody = (clientX, clientY, radiusPx) => {
            if (!solar) return null;
            // From far out only Earth (marked by its ring) can be picked
            const active = bodiesActive();
            if (!active && !earthMarked) return null;
            const rect = renderer.domElement.getBoundingClientRect();
            const mx = clientX - rect.left;
            const my = clientY - rect.top;
            syncLayerCamera(solarLayer, camera);
            let best = null;
            let bestDist = Infinity;
            for (const body of solar.bodies) {
                const isEarth = body.id === 'Earth';
                if (!active && !isEarth) continue;
                // Small moons only while their cloud is shown (zoomed in)
                if (body.major === false && solar.minorMoonFade(body.parentId) < 0.5) continue;
                const p = bodyOnScreen(body, rect.width, rect.height);
                if (!p) continue;
                let d = Math.hypot(p.x - mx, p.y - my);
                // Earth's ring is a click target too, and Earth wins close calls
                const hitRadius = isEarth && earthMarked ? Math.max(p.radiusPx, EARTH_RING_PICK_PX) : Math.max(p.radiusPx, 0);
                if (d > hitRadius + radiusPx) continue;
                if (isEarth) d -= EARTH_RING_PICK_PX;
                if (body.parentId) {
                    // A moon still drawn on top of its planet isn't shown, so it
                    // can't be picked; one just clear of it loses close calls
                    const parent = bodyOnScreen(solar.byId.get(body.parentId), rect.width, rect.height);
                    if (parent && Math.hypot(p.x - parent.x, p.y - parent.y) < MOON_PICK_SEPARATION_PX + parent.radiusPx) continue;
                    d += 3;
                }
                if (d < bestDist) {
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
            s.hoverBodyId = hit?.type === 'body' ? hit.id : null;
        };

        // Planet rings follow their body (time runs) and hug its disc
        const updateBodyRings = () => {
            const { clientWidth: width, clientHeight: height } = mount;
            for (const [ring, id] of [[bodySelectedRing, s.selectedBodyId], [bodyHoverRing, s.hoverBodyId]]) {
                const body = ring.visible && id ? solar?.byId.get(id) : null;
                if (!body) continue;
                ring.position.copy(body.position);
                const p = bodyOnScreen(body, width, height);
                if (p) sizeRingToBody(ring, p.radiusPx, pixelRatio);
                else ring.material.uniforms.uOpacity.value = 0;  // camera inside it, or off screen
            }
        };

        // Click (not drag) selects a star or planet; empty space clears the selection
        let downAt = null;
        let pressedRing = null;  // ring feature id when the press began on its label
        const onPointerDown = (e) => {
            downAt = { x: e.clientX, y: e.clientY };
            // Hide the hover state while dragging; it is stale once the view moves
            showHover(null);
            tooltip.style.display = 'none';
        };
        const onPointerUp = (e) => {
            const ringId = pressedRing;
            pressedRing = null;
            if (!downAt || e.button !== 0) return;
            const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
            downAt = null;
            if (moved > 5) return;
            // Ring features are picked by their labels
            const hit = ringId ? null : pickAny(e.clientX, e.clientY, e.pointerType === 'touch' ? 24 : 14);
            setSelectedStar(hit?.type === 'star' ? hit.index : null);
            setSelectedBody(hit?.type === 'body' ? hit.id : null);
            setSelectedRing(ringId);
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
        // Minor moons get no label (hover names them)
        const bodyLabels = (solar?.bodies ?? []).filter(body => body.major !== false).map(body => ({
            body,
            el: makeLabelEl(body.name, `universe-3d-label universe-3d-label-planet${body.id === 'Earth' ? ' universe-3d-label-earth' : ''}`),
            shown: false,
        }));
        // Rings and gaps: clickable labels (see placeRingLabel)
        const ringLabels = solar ? RING_FEATURES.filter(f => solar.byId.has(f.planet)).map(f => {
            const el = makeLabelEl(f.name, `universe-3d-label universe-3d-label-ring${f.kind === 'gap' ? ' universe-3d-label-gap' : ''}`);
            // Pressing a label hands the pointer to the canvas, so a drag
            // that starts on it still turns the view; a press that doesn't
            // move selects the ring (see onPointerUp)
            el.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                pressedRing = f.id;
                canvas.dispatchEvent(new PointerEvent('pointerdown', e));
                if (!canvas.hasPointerCapture(e.pointerId)) canvas.setPointerCapture(e.pointerId);
            });
            // Scrolling over a label still zooms
            el.addEventListener('wheel', (e) => {
                e.preventDefault();
                canvas.dispatchEvent(new WheelEvent('wheel', e));
            }, { passive: false });
            return {
                feature: f,
                el,
                shown: false,
                selected: false,
                pole: new THREE.Vector3(...ringPole(f.planet)),
                labelAu: ringLabelKm(f) / KM_PER_AU,
                scaleAu: ringScaleKm(f) / KM_PER_AU,
                minPx: f.kind === 'gap' ? RING_GAP_LABEL_PX : RING_LABEL_PX,
            };
        }) : [];
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

        // Where a ring feature's label goes, [x, y] px, or null. Shown once
        // the feature is drawn big enough (always when selected). It sits on
        // the ring at the point farthest right on screen, where rings look
        // widest; when that's off screen (zoomed in), at the visible point
        // nearest the screen centre. Points behind the planet don't count.
        const ringDirA = new THREE.Vector3();
        const ringDirB = new THREE.Vector3();
        const ringPoint = new THREE.Vector3();
        const cameraAxis = new THREE.Vector3();
        const placeRingLabel = (label, selected, width, height, pxPerRadian) => {
            const planet = solar.byId.get(label.feature.planet);
            const centre = planet.position;
            const dist = centre.distanceTo(solarCamera.position);
            if (!selected && label.scaleAu / dist * pxPerRadian < label.minPx) return null;
            // In the ring plane: A towards the screen's right (or up, if the
            // ring is seen edge-on running up the screen), B at right angles
            const { pole } = label;
            cameraAxis.setFromMatrixColumn(solarCamera.matrixWorld, 0);
            ringDirA.copy(cameraAxis).addScaledVector(pole, -cameraAxis.dot(pole));
            if (ringDirA.lengthSq() < 0.05) {
                cameraAxis.setFromMatrixColumn(solarCamera.matrixWorld, 1);
                ringDirA.copy(cameraAxis).addScaledVector(pole, -cameraAxis.dot(pole));
            }
            ringDirA.normalize();
            ringDirB.crossVectors(pole, ringDirA);
            const disc = bodyOnScreen(planet, width, height);
            const m = RING_LABEL_MARGIN_PX;
            const pointAt = (angle) => {
                ringPoint.copy(centre)
                    .addScaledVector(ringDirA, label.labelAu * Math.cos(angle))
                    .addScaledVector(ringDirB, label.labelAu * Math.sin(angle));
                bodyProjected.copy(ringPoint).applyMatrix4(solarCamera.matrixWorldInverse);
                if (bodyProjected.z >= 0) return null;  // behind the camera
                bodyProjected.applyMatrix4(solarCamera.projectionMatrix);
                const x = (bodyProjected.x + 1) / 2 * width;
                const y = (1 - bodyProjected.y) / 2 * height;
                if (x < m || x > width - m || y < m || y > height - m) return null;
                const behindPlanet = disc && ringPoint.distanceTo(solarCamera.position) > dist
                    && Math.hypot(x - disc.x, y - disc.y) < disc.radiusPx;
                return behindPlanet ? null : [x, y];
            };
            const rightEnd = pointAt(0);
            if (rightEnd) return rightEnd;
            let best = null;
            let bestDist = Infinity;
            for (let i = 1; i < RING_LABEL_SAMPLES; i++) {
                const p = pointAt(i / RING_LABEL_SAMPLES * 2 * Math.PI);
                const d = p && Math.hypot(p[0] - width / 2, p[1] - height / 2);
                if (p && d < bestDist) {
                    best = p;
                    bestDist = d;
                }
            }
            return best;
        };

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
            // Earth is labelled from anywhere, with a ring, so you can always
            // find home, and other labels never hide it (next to the Sun's,
            // its label goes underneath). The Sun is labelled like the planets.
            placedLabels.length = 0;
            let sunAt = null;
            let earthRing = false;
            for (const label of bodyLabels) {
                const { body } = label;
                const isEarth = body.id === 'Earth';
                let screenPos = null;
                let dy = -8;
                const wanted = opts.showLabels && (isEarth || (opts.showPlanets && bodiesActive()));
                const p = wanted ? bodyOnScreen(body, width, height) : null;
                if (body.id === 'Sun') sunAt = p;
                const free = p && (isEarth || !placedLabels.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 16));
                if (free) {
                    placedLabels.push(p);
                    const r = Math.min(p.radiusPx, height / 4) * 0.7;
                    screenPos = [p.x + r, p.y - r];
                    if (isEarth && sunAt && Math.hypot(sunAt.x - p.x, sunAt.y - p.y) < 16) dy = 8;
                    if (isEarth) earthRing = p.radiusPx < 5;
                }
                setLabel(label, screenPos, 8, dy);
            }
            // Ring labels after the bodies': a body's label wins an overlap
            const ringsWanted = opts.showLabels && opts.showPlanets && bodiesActive();
            const pxPerRadian = height / 2 / Math.tan(THREE.MathUtils.degToRad(solarCamera.fov) / 2);
            for (const label of ringLabels) {
                const selected = label.feature.id === opts.selectedRing;
                let p = ringsWanted ? placeRingLabel(label, selected, width, height, pxPerRadian) : null;
                // Centred text: overlapping if within about a label's size
                if (p && !selected && placedLabels.some(q => Math.abs(q.x - p[0]) < 60 && Math.abs(q.y - p[1]) < 14)) p = null;
                if (p) placedLabels.push({ x: p[0], y: p[1] });
                setLabel(label, p, 0, 0);
                if (selected !== label.selected) {
                    label.el.classList.toggle('selected', selected);
                    label.selected = selected;
                }
            }
            earthMarked = earthRing;
            earthMarkerNear.visible = earthRing && solarLayer.visible;
            earthMarkerFar.visible = earthRing && !solarLayer.visible;
            if (earthRing) {
                earthMarkerNear.position.copy(solar.byId.get('Earth').position);
                earthMarkerFar.position.copy(earthPosition);
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
        // farther are drawn bigger or smaller.
        let lastScale = '';
        const updateScaleBar = () => {
            const bar = scaleBarRef.current;
            const label = scaleLabelRef.current;
            if (!bar || !label) return;
            const { clientWidth: width, clientHeight: height } = mount;
            if (!height) return;
            const maxPx = Math.min(120, width * 0.25);
            const dist = camera.position.distanceTo(controls.target);
            const lyPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / height;
            const { lengthLy, label: text } = scaleBarDistance(maxPx * lyPerPx);
            const px = lengthLy / lyPerPx;
            const key = `${Math.round(px)}|${text}`;
            if (key === lastScale) return;
            lastScale = key;
            bar.style.width = `${Math.round(px)}px`;
            label.textContent = text;
        };

        // ---------- Clock ----------
        // clockRef.current: {time (ms), rate, playing}; the time bar changes it.
        // Each frame the time advances by the speed, the solar system moves,
        // and the followed body takes the camera (and target) along.
        const followBefore = new THREE.Vector3();
        const followDelta = new THREE.Vector3();
        let solarTime = clockRef.current.time;
        const moveSolarSystem = (time) => {
            const followed = s.follow.id ? solar.byId.get(s.follow.id) : null;
            if (followed) followBefore.copy(followed.position);
            solar.update(new Date(time));
            if (solar.byId.has('Earth')) earthPosition.copy(solar.byId.get('Earth').position).divideScalar(AU_PER_LY);
            if (!followed) return;
            followDelta.subVectors(followed.position, followBefore).divideScalar(AU_PER_LY);
            camera.position.add(followDelta);
            if (s.follow.moveTarget) controls.target.add(followDelta);
            const f = s.flight;
            if (f) {
                // A flight to a moving body (or from moving Earth) moves with it
                f.pivot.add(followDelta);
                if (s.follow.moveTarget) {
                    f.fromTarget.add(followDelta);
                    f.toTarget.add(followDelta);
                } else {
                    f.toOffset.add(followDelta);
                }
            }
        };

        let lastFrame = null;
        let lastPublished = 0;
        const advanceClock = (now) => {
            const clock = clockRef.current;
            const dt = lastFrame === null ? 0 : Math.min(now - lastFrame, 250);  // ms; cap after a stalled tab
            lastFrame = now;
            if (clock.playing) {
                clock.time = THREE.MathUtils.clamp(clock.time + dt * clock.rate, TIME_RANGE[0], TIME_RANGE[1]);
            }
            if (solar && clock.time !== solarTime) {
                moveSolarSystem(clock.time);
                solarTime = clock.time;
            }
            // The time bar (and card distances) re-render a few times a second
            if (now - lastPublished > 250) {
                lastPublished = now;
                setClockView({ ...clock });
            }
        };

        // The solar-system layer spans 15 km to 100,000 AU; with a fixed near
        // plane the depth buffer can't tell moons, their orbits and their
        // planet apart (they flicker in front of and behind each other). So
        // the near plane sits at a fraction of the distance to the nearest
        // surface: depth is precise for whatever the camera is close to.
        // Every body counts, small moons too (one you've flown to must not be
        // clipped by a near plane set by its distant planet).
        const cameraAu = new THREE.Vector3();
        const solarNearPlane = () => {
            cameraAu.copy(camera.position).multiplyScalar(AU_PER_LY);
            let nearest = Infinity;
            for (const body of solar.bodies) {
                nearest = Math.min(nearest, body.position.distanceTo(cameraAu) - body.radiusAu);
            }
            return THREE.MathUtils.clamp(nearest * SOLAR_NEAR_FRACTION, 1e-9, 1e3);
        };

        const targetBefore = new THREE.Vector3();
        let frameId;
        let lastDistanceLabel = '';
        const animate = (now) => {
            advanceClock(now);
            updateFlight(now);
            targetBefore.copy(controls.target);
            controls.update();
            // Only panning moves the target inside controls.update (rotating
            // and zooming don't): the view is no longer centred on what it was.
            // The threshold ignores rounding (controls.update re-scales the
            // target every frame); a pan moves it by far more.
            const panTolerance = 1e-6 * camera.position.distanceTo(controls.target) + 1e-12 * controls.target.length();
            if (!s.flight && s.focused && targetBefore.distanceTo(controls.target) > panTolerance) {
                s.focused = false;
                s.follow = { id: null, moveTarget: true };
                setFocus({ type: 'none' });
            }
            // The solar system fades out as the camera leaves it
            solarFade = solar ? solar.fadeForDistance(camera.position.length() * AU_PER_LY) : 0;
            solar?.setFade(solarFade);
            solarLayer.visible = solarFade > 0 && optionsRef.current.showPlanets;
            if (solar) solarLayer.near = solarNearPlane();
            starDisc.update(camera, mount.clientHeight);
            syncCameras();
            solar?.updateMinorMoonFade(solarCamera.position, mount.clientHeight, camera.fov);
            solar?.updateTextures(solarCamera.position, mount.clientHeight, camera.fov);
            solar?.updateRingView(solarCamera.position);
            updateBodyRings();
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
            controls.dispose();
            [stars, gaiaStars, sun, hoverRing, selectedRing, bodyHoverRing, bodySelectedRing, earthMarkerNear, earthMarkerFar, s.selectedLines, s.allLines]
                .forEach(disposeObject);
            solar?.dispose();
            starDisc.dispose();
            bloomPass.dispose();
            composer.dispose();
            renderer.dispose();
            mount.removeChild(canvas);
            labelsEl.replaceChildren();
            sceneRef.current = null;
        };
    }, [starBuffers, gaiaBuffers, lineStarInfo, constellationData, planetFacts, moonsData]);

    // Fly back to Earth and orbit a constellation, so you see its figure as
    // in the night sky; dragging then shows it in 3D
    const viewConstellation = (abbrev) => {
        const s = sceneRef.current;
        if (!s) return;
        s.setFollow('Earth', false);
        s.flyTo(s.earthPosition.toArray(), constellationFocus(constellationData[abbrev], starBuffers));
        setFocus({ type: 'constellation' });
    };

    // R / Reset view: back home, orbiting Earth (without planets: at the
    // Sun, looking at the selected constellation or the default direction)
    const resetView = () => {
        const s = sceneRef.current;
        if (!s) return;
        const home = s.bodyPose('Earth');
        if (home) {
            s.setFollow('Earth');
            s.flyTo(home.position, home.target, home.minDistance);
            setFocus({ type: 'body', id: 'Earth' });
        } else if (selectedAbbrev) {
            viewConstellation(selectedAbbrev);
        } else {
            s.setFollow(null);
            s.flyTo([0, 0, 0], [0, 0, -500]);
            setFocus({ type: 'none' });
        }
    };

    // Fly out to a planet (see bodyPose in the setup)
    const flyToBody = (id) => {
        const s = sceneRef.current;
        const pose = s?.bodyPose(id);
        if (!pose) return;
        s.setFollow(id);
        s.flyTo(pose.position, pose.target, pose.minDistance);
        setFocus({ type: 'body', id });
    };

    // Fly to a ring feature (see ringPose in the setup), riding along with its planet
    const viewRing = (id) => {
        const s = sceneRef.current;
        const pose = s?.ringPose(id);
        if (!pose) return;
        s.setFollow(RING_FEATURES_BY_ID.get(id).planet);
        s.flyTo(pose.position, pose.target, pose.minDistance);
        setFocus({ type: 'ring', id });
    };

    // A star's radius in ly (curated or estimated), or null if unknown
    const starRadiusLy = (index) => {
        const radius = starBuffers.radius[index];
        return Number.isNaN(radius) ? null : radiusToLy(radius);
    };

    // How close the camera may zoom to a star: near its surface, or
    // ORBIT_MIN_DISTANCE if its radius is unknown
    const starMinDistance = (index) => {
        const radiusLy = starRadiusLy(index);
        return radiusLy ? radiusLy * STAR_MIN_RADII : ORBIT_MIN_DISTANCE;
    };

    // Go back to Earth and orbit the star, so you see where it is in the night sky
    const lookAtStar = (index) => {
        const s = sceneRef.current;
        if (!s) return;
        const p = starBuffers.positions.subarray(index * 3, index * 3 + 3);
        s.setFollow('Earth', false);
        s.flyTo(s.earthPosition.toArray(), [p[0], p[1], p[2]], starMinDistance(index));
        setFocus({ type: 'star', index });
    };

    const handleSearchSelect = (item) => {
        if (item.type === 'constellation') {
            setSelectedAbbrev(item.abbrev);
            viewConstellation(item.abbrev);
        } else if (item.type === 'star') {
            selectStar(item.starIndex);
            lookAtStar(item.starIndex);
        } else if (item.type === 'planet') {
            // Planets and moons: fly straight in (stars are shown from Earth)
            selectBody(item.id);
            flyToBody(item.id);
        }
    };

    // Stop just short of the star (on the Earth side), looking at it: close
    // enough that its real disc fills the view (STAR_VIEW_RADII radii out);
    // it may then be zoomed to its surface. A star with no radius estimate
    // is only approached to a few ly.
    const flyToStar = (index) => {
        const s = sceneRef.current;
        if (!s) return;
        const p = Array.from(starBuffers.positions.subarray(index * 3, index * 3 + 3));
        const earth = s.earthPosition.toArray();
        const dir = p.map((v, i) => v - earth[i]);
        const dist = Math.hypot(...dir);
        const radiusLy = starRadiusLy(index);
        const stopAt = radiusLy ? radiusLy * STAR_VIEW_RADII : Math.min(Math.max(dist * 0.05, 0.3), 15);
        const keep = 1 - stopAt / dist;
        s.setFollow(null);
        s.flyTo(dir.map((v, i) => earth[i] + v * keep), p, starMinDistance(index));
        setFocus({ type: 'star', index });
    };

    // ---------- Clock controls (the render loop advances the time) ----------
    const updateClock = (changes) => {
        Object.assign(clockRef.current, changes);
        setClockView({ ...clockRef.current });
    };
    const togglePlay = () => updateClock({ playing: !clockRef.current.playing });
    const changeSpeed = (direction) => updateClock({ rate: nextPresetRate(clockRef.current.rate, direction), playing: true });
    const setRate = (rate) => updateClock({ rate, playing: true });
    const goToNow = () => updateClock({ time: Date.now(), rate: 1, playing: true });
    const setTime = (ms) => updateClock({ time: THREE.MathUtils.clamp(ms, TIME_RANGE[0], TIME_RANGE[1]) });

    // Draw the selected constellation's stick figure (the flight to it is
    // started by whatever selected it)
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        if (s.selectedLines) {
            s.scene.remove(s.selectedLines);
            disposeObject(s.selectedLines);
            s.selectedLines = null;
        }
        if (!selectedAbbrev) return;
        s.selectedLines = makeLines(
            constellationLinePositions(constellationData[selectedAbbrev], starBuffers),
            0x60a5fa,
            0.8,
            s.haze
        );
        s.selectedLines.visible = showLines;
        s.scene.add(s.selectedLines);
    }, [selectedAbbrev, starBuffers, planetFacts]);

    // Line visibility. All 88 stick figures are built on first use.
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        if (s.selectedLines) s.selectedLines.visible = showLines;
        if (showLines && showAllLines && !s.allLines) {
            const flat = Object.values(constellationData)
                .flatMap(c => constellationLinePositions(c, starBuffers));
            s.allLines = makeLines(flat, 0x94a3b8, 0.25, s.haze);
            s.scene.add(s.allLines);
        }
        if (s.allLines) s.allLines.visible = showLines && showAllLines;
    }, [showLines, showAllLines, starBuffers]);

    useEffect(() => {
        sceneRef.current?.setHaze(showHaze);
    }, [showHaze, starBuffers]);

    useEffect(() => {
        sceneRef.current?.solar?.setShowOrbits(showOrbits);
    }, [showOrbits, starBuffers, planetFacts, moonsData]);

    useEffect(() => {
        sceneRef.current?.solar?.setShowMinorMoons(showSmallMoons);
    }, [showSmallMoons, starBuffers, planetFacts, moonsData]);

    useEffect(() => {
        sceneRef.current?.solar?.setRingWaveScale(exaggerateRingWaves ? RING_WAVE_EXAGGERATION : 1);
    }, [exaggerateRingWaves, starBuffers, planetFacts, moonsData]);

    // Ring around the selected star or planet
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        const i = selectedStar;
        placeRing(s.selectedRing, i === null ? null : starBuffers.positions.subarray(i * 3, i * 3 + 3));
        placeRing(s.bodySelectedRing, selectedBody && s.solar ? s.solar.byId.get(selectedBody).position.toArray() : null);
        s.selectedBodyId = selectedBody;  // the render loop keeps the ring on it as time runs
        s.solar?.setHighlightOrbit(selectedBody);
    }, [selectedStar, selectedBody, starBuffers, planetFacts, moonsData]);

    // Keyboard: Esc closes the card, then goes back. L lines, N names, R reset.
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') {
                if (e.code !== 'Escape') return;
            }
            if (e.code === 'Escape') {
                if (selectedStar !== null || selectedBody !== null || selectedRing !== null) selectStar(null);
                else onBack();
            }
            if (e.code === 'KeyL') setShowLines(prev => !prev);
            if (e.code === 'KeyN') setShowLabels(prev => !prev);
            if (e.code === 'KeyR') resetView();
            if (e.code === 'Space') {
                e.preventDefault();  // no page scroll / button press
                togglePlay();
            }
            if (e.code === 'BracketLeft') changeSpeed(-1);
            if (e.code === 'BracketRight') changeSpeed(1);
            if (e.code === 'KeyT') goToNow();
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

    const selected = selectedAbbrev ? constellationData[selectedAbbrev] : null;
    const star = selectedStar !== null ? starRecord(starBuffers, selectedStar) : null;
    const solar = sceneRef.current?.solar;
    const body = selectedBody !== null && solar ? solar.byId.get(selectedBody) : null;
    const ring = selectedRing !== null ? RING_FEATURES_BY_ID.get(selectedRing) : null;
    // Current distances (AU), for the card
    const bodyDistances = body && {
        sun: body.position.length(),
        earth: body.position.distanceTo(solar.byId.get('Earth').position),
        parent: body.parentId ? body.position.distanceTo(solar.byId.get(body.parentId).position) : null,
    };

    // Footer: what the view is centred on
    // (nothing when the view isn't centred on anything, e.g. after panning)
    let title = null;
    let subtitle = null;
    if (focus.type === 'constellation' && selected) {
        title = selected.name;
        subtitle = selected.name_english !== selected.name ? selected.name_english : null;
    } else if (focus.type === 'body' && solar?.byId.has(focus.id)) {
        const f = solar.byId.get(focus.id).facts;
        title = f.name;
        subtitle = { star: 'Our star', planet: 'Planet', 'dwarf planet': 'Dwarf planet', moon: `Moon of ${f.parent}` }[f.type];
    } else if (focus.type === 'ring') {
        const f = RING_FEATURES_BY_ID.get(focus.id);
        title = f.name;
        subtitle = ringSubtitle(f);
    } else if (focus.type === 'star') {
        const rec = starRecord(starBuffers, focus.index);
        const bayer = formatBayer(lineStarInfo.get(rec.hip)?.bayer);
        title = rec.name || bayer || `HIP ${rec.hip}`;
        subtitle = rec.name && bayer ? bayer : 'Star';
    }

    return (
        <div className={`universe-3d-screen ${star || body || ring ? 'has-card' : ''}`}>
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
                        {moonsData && (
                            <label
                                className={`universe-3d-checkbox universe-3d-sub-option ${showPlanets ? '' : 'disabled'}`}
                                title="Hundreds of tiny moons, shown when zoomed in on their planet"
                            >
                                <input
                                    type="checkbox"
                                    checked={showSmallMoons}
                                    disabled={!showPlanets}
                                    onChange={(e) => setShowSmallMoons(e.target.checked)}
                                />
                                Small moons
                            </label>
                        )}
                        <label
                            className={`universe-3d-checkbox universe-3d-sub-option ${showPlanets ? '' : 'disabled'}`}
                            title={`Waves and lobes that moons raise on the edges of Saturn's rings, ${RING_WAVE_EXAGGERATION}× their real size`}
                        >
                            <input
                                type="checkbox"
                                checked={exaggerateRingWaves}
                                disabled={!showPlanets}
                                onChange={(e) => setExaggerateRingWaves(e.target.checked)}
                            />
                            Ring waves ×{RING_WAVE_EXAGGERATION}
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
                <button className="button-secondary" onClick={() => resetView()}>Reset view</button>
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
            {ring && (
                <RingInfoCard
                    feature={ring}
                    onClose={() => setSelectedRing(null)}
                    onView={() => viewRing(selectedRing)}
                />
            )}

            {planetFacts && (
                <Universe3DTimeBar
                    time={clockView.time}
                    rate={clockView.rate}
                    playing={clockView.playing}
                    onTogglePlay={togglePlay}
                    onStep={changeSpeed}
                    onSetRate={setRate}
                    onNow={goToNow}
                    onSetTime={setTime}
                />
            )}

            <div
                className="universe-3d-scale"
                title="Scale at the orbit point (screen centre)"
            >
                <div ref={scaleLabelRef} className="universe-3d-scale-label" />
                <div ref={scaleBarRef} className="universe-3d-scale-bar" />
            </div>

            <div className="universe-3d-footer">
                {title && <div className="universe-3d-title">{title}</div>}
                {title && subtitle && <div className="universe-3d-subtitle">{subtitle}</div>}
                <div ref={distanceRef} className="universe-3d-distance" />
                <div className="universe-3d-hint">
                    Click a star, planet or ring name for details · Drag to rotate · Scroll to zoom
                </div>
            </div>
        </div>
    );
}

export default Universe3D;
