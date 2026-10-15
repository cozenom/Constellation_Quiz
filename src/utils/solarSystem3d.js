// The Solar System layer of the 3D view (units AU, origin the Sun).
//
// Each body is a real-size sphere plus a fixed-size dot, so it can be found
// from far away; the dot fades out once the sphere is drawn bigger than it.
// Spheres sit at mesh.position (JS doubles), so the GPU only ever sees
// camera-relative numbers and close-ups stay sharp. The Sun's glow is the
// star-layer point at the origin; here it is only a sphere.
//
// Moons: the major ones (moons.json `major`, plus our Moon) are bodies like
// the planets, with orbit lines and labels. The minor ones are one cloud of
// small dots per planet, positioned at the planet, with no labels (hover
// and click still find them, and a clicked one gets its orbit line). A
// moon's dot only shows once it is drawn a few pixels clear of its planet,
// so from far away a planet is just its own dot.
// Positions come from utils/planets.js and utils/moons.js (scene frame:
// J2000, north = +Y).

import * as THREE from 'three';
import { GALILEAN, galileanOrbitLoop, galileanPositions, moonOrbitLoop, moonPeriodDays, moonPosition } from './moons.js';
import { heliocentricPosition, moonOrbitPath, orbitPath, orbitPeriodDays, SOLAR_SYSTEM_BODIES } from './planets.js';
import { KM_PER_AU, raDecToXYZ } from './universe3d.js';

// Whole layer fades out between these camera distances from the Sun (AU)
const FADE_START_AU = 300;
const FADE_END_AU = 5000;

const DOT_SIZE_PX = 6;
const MINOR_MOON_SIZE_PX = 3;
const DEG_TO_RAD = Math.PI / 180;
const ORBIT_OPACITY = 0.35;
// Orbit lines are resampled once their body has moved this much of an orbit,
// spending at most ORBIT_BUDGET_MS a frame on it (see resampleStaleOrbits)
const ORBIT_RESAMPLE_FRACTION = 1 / 200;
const ORBIT_BUDGET_MS = 4;
// A moon's dot fades in between these distances (px) from its planet's centre
const MOON_SEPARATION_PX = [6, 14];
// A planet's small-moon cloud fades in as its typical orbit grows across
// the screen between these sizes (px, radius): most small moons are 1-4 km
// rocks far too faint to see, so they only show once you zoom in
const MINOR_CLOUD_FADE_PX = [150, 450];
// Minor moons with no measured size are drawn (and flown to) at this radius
const UNKNOWN_MOON_RADIUS_KM = 5;
const DEFAULT_MOON_COLOR = '#aaa49b';
const MOON_COLORS = {
    Io: '#d8c46f', Europa: '#cdbea2', Ganymede: '#9f978b', Callisto: '#6e665d',
    Titan: '#d6a25a', Enceladus: '#e8eef2', Iapetus: '#8f8676', Triton: '#cdbcb3',
    Phobos: '#7d7268', Deimos: '#9a8f82', Charon: '#9b958f',
};

// Saturn's north pole (IAU), for tilting its rings
const SATURN_POLE = { raHours: 40.589 / 15, decDeg: 83.537 };
// Saturn's main rings (C ring inner edge to A ring outer edge), km
const SATURN_RINGS_KM = [74500, 136780];

// Ecliptic north in the scene frame (RA 18h, Dec +66.56)
export const ECLIPTIC_NORTH = new THREE.Vector3(...raDecToXYZ(18, 66.56, 1));

// Screen distance (px) between two view-space points, from the projection's
// y scale (the x scale is the same per pixel)
const separationGlsl = `
    float separationPx(vec4 a, vec4 b) {
        vec2 pa = a.xy / max(-a.z, 1e-30);
        vec2 pb = b.xy / max(-b.z, 1e-30);
        return length(pa - pb) * projectionMatrix[1][1] * uViewportHeight * 0.5;
    }
`;

// Fixed-size dot at the object's origin; fades as the sphere outgrows it.
// Moons also fade in only once clear of their planet (uParentOffset is the
// planet's position relative to the moon, AU).
const dotVertexShader = `
    uniform float uSize;
    uniform float uRadius;
    uniform float uViewportHeight;
    uniform float uFade;
    uniform float uHasParent;
    uniform vec3 uParentOffset;
    varying float vAlpha;
    ${separationGlsl}

    void main() {
        vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float radiusPx = uRadius / max(-mvPosition.z, 1e-30) * projectionMatrix[1][1] * uViewportHeight * 0.5;
        vAlpha = uFade * (1.0 - smoothstep(uSize * 0.25, uSize * 0.5, radiusPx));
        if (uHasParent > 0.5) {
            vec4 parent = modelViewMatrix * vec4(uParentOffset, 1.0);
            vAlpha *= smoothstep(${MOON_SEPARATION_PX[0].toFixed(1)}, ${MOON_SEPARATION_PX[1].toFixed(1)}, separationPx(mvPosition, parent));
        }
        gl_PointSize = vAlpha > 0.0 ? uSize : 0.0;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const dotFragmentShader = `
    uniform vec3 uColor;
    uniform float uLinear;
    varying float vAlpha;

    void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float alpha = (1.0 - smoothstep(0.55, 1.0, r)) * vAlpha;
        if (alpha < 0.01) discard;
        vec3 color = mix(uColor, pow(uColor, vec3(2.2)), uLinear);  // like the star shader
        gl_FragColor = vec4(color, alpha);
    }
`;

// Minor moons: positions are relative to the planet (the object's origin).
// uCloudFade: the whole cloud only shows when zoomed in on its planet.
const minorMoonVertexShader = `
    uniform float uSize;
    uniform float uViewportHeight;
    uniform float uFade;
    uniform float uCloudFade;
    varying float vAlpha;
    ${separationGlsl}

    void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec4 parent = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vAlpha = uFade * uCloudFade * 0.55 * smoothstep(${MOON_SEPARATION_PX[0].toFixed(1)}, ${MOON_SEPARATION_PX[1].toFixed(1)}, separationPx(mvPosition, parent));
        gl_PointSize = vAlpha > 0.0 ? uSize : 0.0;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const colorUniform = (hex) => ({ value: new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace) });

function makeDot(color, radiusAu, pixelRatio, hasParent) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uSize: { value: DOT_SIZE_PX * pixelRatio },
            uRadius: { value: radiusAu },
            uViewportHeight: { value: 1 },
            uFade: { value: 1 },
            uLinear: { value: 0 },
            uHasParent: { value: hasParent ? 1 : 0 },
            uParentOffset: { value: new THREE.Vector3() },
            // Raw hex values, like the star shader (no colour management)
            uColor: colorUniform(color),
        },
        vertexShader: dotVertexShader,
        fragmentShader: dotFragmentShader,
        transparent: true,
        depthWrite: false,
    });
    const dot = new THREE.Points(geometry, material);
    dot.frustumCulled = false;
    return dot;
}

function makeMinorMoonCloud(count, pixelRatio) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uSize: { value: MINOR_MOON_SIZE_PX * pixelRatio },
            uViewportHeight: { value: 1 },
            uFade: { value: 1 },
            uCloudFade: { value: 0 },
            uLinear: { value: 0 },
            uColor: colorUniform(new THREE.Color(DEFAULT_MOON_COLOR).getHex()),
        },
        vertexShader: minorMoonVertexShader,
        fragmentShader: dotFragmentShader,
        transparent: true,
        depthWrite: false,
    });
    const cloud = new THREE.Points(geometry, material);
    cloud.frustumCulled = false;
    return cloud;
}

// Orbit lines write depth, so where two cross on screen the nearer one is
// drawn on top instead of whichever happened to be drawn last
function makeOrbitLine(flatPositions, color, opacity = ORBIT_OPACITY) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(flatPositions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.LineLoop(geometry, material);
    line.userData.baseOpacity = opacity;
    return line;
}

function disposeLine(line) {
    line.parent?.remove(line);
    line.geometry.dispose();
    line.material.dispose();
}

function makeSaturnRings(radiusAu, color) {
    const [inner, outer] = SATURN_RINGS_KM.map(km => km / KM_PER_AU);
    const geometry = new THREE.RingGeometry(inner, outer, 128);
    const material = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    const rings = new THREE.Mesh(geometry, material);
    // RingGeometry lies in XY (normal +Z); turn the normal to Saturn's pole
    const pole = new THREE.Vector3(...raDecToXYZ(SATURN_POLE.raHours, SATURN_POLE.decDeg, 1));
    rings.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pole);
    return rings;
}

// The facts the info card shows for a moons.json moon
function moonFacts(m) {
    return {
        id: `moon-${m.code}`,
        name: m.name,
        type: 'moon',
        parent: m.planet,
        diameter_km: m.radius_km ? m.radius_km * 2 : null,
        orbit_days: 360 / Math.abs(m.n),
        orbit_radius_km: m.a_km,
        approximate: !m.major,
    };
}

// facts: planets.json; moonsData: moons.json (optional). Returns the
// layer's contents and controls:
//   bodies: [{id, name, type, facts, radiusAu, position (Vector3, AU),
//             parentId?, major?}], planets first, then major moons, then minor
//   byId:   Map id -> body
//   update(date), setFade(f), setShowOrbits(on), setHighlightOrbit(id),
//   updateMinorMoonFade(cameraAu, heightPx, fovDeg), minorMoonFade(planetId),
//   setShowMinorMoons(on), setHaze(on), setViewportHeight(px), dispose()
export function buildSolarSystem(scene, facts, moonsData, pixelRatio) {
    const factsById = new Map(facts.bodies.map(b => [b.id, b]));
    const disposables = [];
    const track = (obj) => { disposables.push(obj); return obj; };

    // Sunlight; a little ambient so night sides aren't pure black
    scene.add(new THREE.PointLight(0xffffff, Math.PI, 0, 0));
    scene.add(new THREE.AmbientLight(0xffffff, 0.06));

    const orbitGroup = new THREE.Group();
    scene.add(orbitGroup);

    const makeBody = ({ id, name, type, facts: f, radiusAu, color, isSun = false, parentId = null, major = true }) => {
        const material = isSun ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
        const mesh = track(new THREE.Mesh(new THREE.SphereGeometry(radiusAu, 48, 24), material));
        scene.add(mesh);
        const dot = isSun ? null : track(makeDot(color, radiusAu, pixelRatio, parentId !== null));
        if (dot) mesh.add(dot);
        if (id === 'Saturn') mesh.add(track(makeSaturnRings(radiusAu, color)));
        return { id, name, type, facts: f, radiusAu, color, mesh, dot, position: mesh.position, parentId, major };
    };

    // Sun, planets, Pluto, our Moon
    const ids = ['Sun', ...SOLAR_SYSTEM_BODIES, 'Moon'];
    const bodies = ids.filter(id => factsById.has(id)).map(id => {
        const f = factsById.get(id);
        return makeBody({
            id, name: f.name, type: f.type, facts: f,
            radiusAu: f.diameter_km / 2 / KM_PER_AU,
            color: new THREE.Color(f.color).getHex(),
            isSun: id === 'Sun',
            parentId: f.parent ?? null,
        });
    });
    const planetIds = new Set(bodies.map(b => b.id));

    // Moons of the other planets
    const moons = (moonsData?.moons ?? []).filter(m => planetIds.has(m.planet));
    for (const m of moons.filter(m => m.major)) {
        const body = makeBody({
            id: `moon-${m.code}`, name: m.name, type: 'moon', facts: moonFacts(m),
            radiusAu: (m.radius_km ?? UNKNOWN_MOON_RADIUS_KM) / KM_PER_AU,
            color: new THREE.Color(MOON_COLORS[m.name] ?? DEFAULT_MOON_COLOR).getHex(),
            parentId: m.planet,
        });
        body.moon = m;
        bodies.push(body);
    }
    // Minor moons: one dot cloud per planet; bodies without a mesh
    const clouds = new Map();  // planet -> {cloud, moons: [body]}
    for (const m of moons.filter(m => !m.major)) {
        const body = {
            id: `moon-${m.code}`, name: m.name, type: 'moon', facts: moonFacts(m),
            radiusAu: (m.radius_km ?? UNKNOWN_MOON_RADIUS_KM) / KM_PER_AU,
            color: new THREE.Color(DEFAULT_MOON_COLOR).getHex(),
            mesh: null, dot: null, position: new THREE.Vector3(), parentId: m.planet, major: false, moon: m,
        };
        bodies.push(body);
        if (!clouds.has(m.planet)) clouds.set(m.planet, { moons: [] });
        clouds.get(m.planet).moons.push(body);
    }
    for (const entry of clouds.values()) {
        entry.cloud = track(makeMinorMoonCloud(entry.moons.length, pixelRatio));
        scene.add(entry.cloud);
        // Typical orbit size (median), for the zoom fade
        const radii = entry.moons.map(b => b.moon.a_km / KM_PER_AU).sort((x, y) => x - y);
        entry.spreadAu = radii[Math.floor(radii.length / 2)];
        entry.fade = 0;
    }
    const byId = new Map(bodies.map(b => [b.id, b]));
    const moonBodies = bodies.filter(b => b.parentId && b.id !== 'Moon');

    // ---------- Orbit lines ----------
    // Each orbit is sampled densely around its body's current place (see
    // sampleOrbit in planets.js). As time runs the body moves on, so a line
    // is resampled once its body has gone ORBIT_RESAMPLE_FRACTION of the way
    // round; the most out-of-date first, within ORBIT_BUDGET_MS a frame, so
    // fast time stays smooth (lines just lag a little). Moon orbits sit in a
    // group per planet, kept at the planet.
    const isGalilean = (body) => body.parentId === 'Jupiter' && GALILEAN.includes(body.name);
    const orbits = [];  // {line, sample(date), periodDays, sampledAt (ms) | null}
    const moonOrbitGroups = new Map();  // planet id -> Group
    const moonOrbitGroup = (planetId) => {
        if (!moonOrbitGroups.has(planetId)) {
            const group = new THREE.Group();
            orbitGroup.add(group);
            moonOrbitGroups.set(planetId, group);
        }
        return moonOrbitGroups.get(planetId);
    };
    const addOrbit = ({ sample, periodDays, color, opacity, parent = orbitGroup, segments }) => {
        const line = makeOrbitLine(new Float32Array(segments * 3), color, opacity);
        line.frustumCulled = false;  // samples move round the orbit
        line.visible = false;        // until first sampled
        parent.add(line);
        const orbit = { line, sample, periodDays, sampledAt: null };
        orbits.push(orbit);
        return orbit;
    };
    const resample = (orbit, date) => {
        orbit.line.geometry.attributes.position.array.set(orbit.sample(date));
        orbit.line.geometry.attributes.position.needsUpdate = true;
        orbit.line.visible = true;
        orbit.sampledAt = date.getTime();
    };
    const moonOrbit = (body, opacity) => addOrbit({
        sample: isGalilean(body)
            ? (d) => galileanOrbitLoop(body.name, moonPeriodDays(body.moon), d)
            : (d) => moonOrbitLoop(body.moon, d),
        periodDays: moonPeriodDays(body.moon), color: body.color, opacity,
        parent: moonOrbitGroup(body.parentId), segments: 256,
    });

    for (const id of SOLAR_SYSTEM_BODIES) {
        const body = byId.get(id);
        if (body) addOrbit({ sample: (d) => orbitPath(id, d), periodDays: orbitPeriodDays(id), color: body.color, segments: 512 });
    }
    if (byId.has('Moon')) {
        addOrbit({
            sample: (d) => moonOrbitPath(d), periodDays: orbitPeriodDays('Moon'),
            color: byId.get('Moon').color, parent: moonOrbitGroup('Earth'), segments: 512,
        });
    }
    for (const body of moonBodies.filter(b => b.major)) moonOrbit(body);

    let lastDate = null;
    const resampleStaleOrbits = (date) => {
        const now = date.getTime();
        const stale = orbits
            .map(o => ({
                o,
                age: o.sampledAt === null ? Infinity : Math.abs(now - o.sampledAt) / (o.periodDays * 86400000 * ORBIT_RESAMPLE_FRACTION),
            }))
            .filter(s => s.age >= 1)
            .sort((a, b) => b.age - a.age);
        const start = performance.now();
        for (const { o } of stale) {
            resample(o, date);
            // First build: everything at once; afterwards a few ms a frame
            if (lastDate !== null && performance.now() - start > ORBIT_BUDGET_MS) break;
        }
    };

    // A selected minor moon gets its orbit drawn (major ones always have one)
    let highlightId = null;
    let highlight = null;
    const setHighlight = (id) => {
        if (highlight) {
            orbits.splice(orbits.indexOf(highlight), 1);
            disposeLine(highlight.line);
            highlight = null;
        }
        highlightId = id;
        const body = id && byId.get(id);
        if (body && body.moon && !body.major) {
            highlight = moonOrbit(body, 0.6);
            if (lastDate) resample(highlight, lastDate);
            applyOrbitOpacity();
        }
    };

    const parentOffset = new THREE.Vector3();
    const update = (date) => {
        for (const body of bodies) {
            if (body.id === 'Sun' || body.moon) continue;
            body.position.set(...heliocentricPosition(body.id, date));
        }
        const galilean = moonBodies.some(isGalilean) ? galileanPositions(date) : null;
        for (const body of moonBodies) {
            const parent = byId.get(body.parentId).position;
            const rel = isGalilean(body) ? galilean[body.name] : moonPosition(body.moon, date);
            body.position.set(rel[0], rel[1], rel[2]).add(parent);
            if (body.dot) body.dot.material.uniforms.uParentOffset.value.set(-rel[0], -rel[1], -rel[2]);
        }
        // Our Moon's dot fades by its separation from Earth too
        if (byId.has('Moon') && byId.has('Earth')) {
            parentOffset.subVectors(byId.get('Earth').position, byId.get('Moon').position);
            byId.get('Moon').dot.material.uniforms.uParentOffset.value.copy(parentOffset);
        }
        for (const [planetId, { cloud, moons: list }] of clouds) {
            const parent = byId.get(planetId).position;
            cloud.position.copy(parent);
            const array = cloud.geometry.attributes.position.array;
            list.forEach((body, i) => {
                array[i * 3] = body.position.x - parent.x;
                array[i * 3 + 1] = body.position.y - parent.y;
                array[i * 3 + 2] = body.position.z - parent.z;
            });
            cloud.geometry.attributes.position.needsUpdate = true;
        }
        resampleStaleOrbits(date);
        if (lastDate === null) applyOrbitOpacity();
        lastDate = date;
        for (const [planetId, group] of moonOrbitGroups) group.position.copy(byId.get(planetId).position);
    };

    const dotMaterials = [
        ...bodies.filter(b => b.dot).map(b => b.dot.material),
        ...[...clouds.values()].map(c => c.cloud.material),
    ];
    let showOrbits = true;
    let showMinorMoons = true;
    let fade = 1;
    function applyOrbitOpacity() {
        orbitGroup.visible = showOrbits && fade > 0;
        orbits.forEach(({ line }) => { line.material.opacity = line.userData.baseOpacity * fade; });
    }

    return {
        bodies,
        byId,
        update,
        // 1 near the Sun, 0 far out (log scale), from camera distance in AU
        fadeForDistance: (au) => 1 - THREE.MathUtils.smoothstep(
            Math.log10(Math.max(au, 1e-9)), Math.log10(FADE_START_AU), Math.log10(FADE_END_AU)
        ),
        setFade: (f) => {
            if (f === fade) return;
            fade = f;
            dotMaterials.forEach(m => { m.uniforms.uFade.value = f; });
            applyOrbitOpacity();
        },
        setShowOrbits: (on) => {
            showOrbits = on;
            applyOrbitOpacity();
        },
        // Fade each small-moon cloud by how big it is drawn. cameraAu: camera
        // position (AU); heightPx: viewport height (CSS px); fovDeg: vertical FOV.
        updateMinorMoonFade: (cameraAu, heightPx, fovDeg) => {
            const pxPerRadian = heightPx / 2 / Math.tan(fovDeg * DEG_TO_RAD / 2);
            for (const [planetId, entry] of clouds) {
                const distance = cameraAu.distanceTo(byId.get(planetId).position);
                const px = entry.spreadAu / Math.max(distance, 1e-12) * pxPerRadian;
                entry.fade = showMinorMoons
                    ? THREE.MathUtils.smoothstep(px, MINOR_CLOUD_FADE_PX[0], MINOR_CLOUD_FADE_PX[1])
                    : 0;
                entry.cloud.material.uniforms.uCloudFade.value = entry.fade;
                entry.cloud.visible = entry.fade > 0;
            }
        },
        // How visible a planet's small-moon cloud is (0..1), for picking
        minorMoonFade: (planetId) => clouds.get(planetId)?.fade ?? 0,
        setShowMinorMoons: (on) => { showMinorMoons = on; },
        // Draw the orbit of a selected minor moon (major ones always have one)
        setHighlightOrbit: (id) => {
            if (id !== highlightId) setHighlight(id);
        },
        setHaze: (on) => dotMaterials.forEach(m => { m.uniforms.uLinear.value = on ? 1 : 0; }),
        setViewportHeight: (px) => dotMaterials.forEach(m => { m.uniforms.uViewportHeight.value = px; }),
        dispose: () => {
            orbits.forEach(({ line }) => disposeLine(line));
            disposables.forEach(obj => {
                obj.geometry.dispose();
                obj.material.dispose();
            });
        },
    };
}
