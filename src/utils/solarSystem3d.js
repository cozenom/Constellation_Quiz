// The Solar System layer of the 3D view (units AU, origin the Sun).
//
// Each body is a real-size sphere plus a fixed-size dot, so it can be found
// from far away; the dot fades out once the sphere is drawn bigger than it.
// Spheres sit at mesh.position (JS doubles), so the GPU only ever sees
// camera-relative numbers and close-ups stay sharp. The Sun's glow is the
// star-layer point at the origin; here it is only a sphere.
// Positions come from utils/planets.js (scene frame: J2000, north = +Y).

import * as THREE from 'three';
import { heliocentricPosition, moonOrbitPath, orbitPath, SOLAR_SYSTEM_BODIES } from './planets';
import { KM_PER_AU, raDecToXYZ } from './universe3d';

// Whole layer fades out between these camera distances from the Sun (AU)
const FADE_START_AU = 300;
const FADE_END_AU = 5000;

const DOT_SIZE_PX = 6;
const ORBIT_OPACITY = 0.35;

// Saturn's north pole (IAU), for tilting its rings
const SATURN_POLE = { raHours: 40.589 / 15, decDeg: 83.537 };
// Saturn's main rings (C ring inner edge to A ring outer edge), km
const SATURN_RINGS_KM = [74500, 136780];

// Ecliptic north in the scene frame (RA 18h, Dec +66.56)
export const ECLIPTIC_NORTH = new THREE.Vector3(...raDecToXYZ(18, 66.56, 1));

// Fixed-size dot at the object's origin; fades as the sphere outgrows it
const dotVertexShader = `
    uniform float uSize;
    uniform float uRadius;
    uniform float uViewportHeight;
    uniform float uFade;
    varying float vAlpha;

    void main() {
        vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float radiusPx = uRadius / max(-mvPosition.z, 1e-30) * projectionMatrix[1][1] * uViewportHeight * 0.5;
        vAlpha = uFade * (1.0 - smoothstep(uSize * 0.25, uSize * 0.5, radiusPx));
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

function makeDot(color, radiusAu, pixelRatio) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uSize: { value: DOT_SIZE_PX * pixelRatio },
            uRadius: { value: radiusAu },
            uViewportHeight: { value: 1 },
            uFade: { value: 1 },
            uLinear: { value: 0 },
            // Raw hex values, like the star shader (no colour management)
            uColor: { value: new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace) },
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

// Orbit lines write depth, so where two cross on screen the nearer one is
// drawn on top instead of whichever happened to be drawn last
function makeOrbitLine(flatPositions, color) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(flatPositions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: ORBIT_OPACITY });
    return new THREE.LineLoop(geometry, material);
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

// facts: planets.json. Returns the layer's contents and controls:
//   bodies: [{id, name, type, facts, radiusAu, position (Vector3, AU)}]
//   byId:   Map id -> body
//   update(date), setFade(f), setShowOrbits(on), setHaze(on),
//   setViewportHeight(px), dispose()
export function buildSolarSystem(scene, facts, pixelRatio) {
    const factsById = new Map(facts.bodies.map(b => [b.id, b]));
    const disposables = [];
    const track = (obj) => { disposables.push(obj); return obj; };

    // Sunlight; a little ambient so night sides aren't pure black
    scene.add(new THREE.PointLight(0xffffff, Math.PI, 0, 0));
    scene.add(new THREE.AmbientLight(0xffffff, 0.06));

    const orbitGroup = new THREE.Group();
    scene.add(orbitGroup);

    const ids = ['Sun', ...SOLAR_SYSTEM_BODIES, 'Moon'];
    const bodies = ids.filter(id => factsById.has(id)).map(id => {
        const f = factsById.get(id);
        const radiusAu = f.diameter_km / 2 / KM_PER_AU;
        const color = new THREE.Color(f.color).getHex();
        const material = id === 'Sun'
            ? new THREE.MeshBasicMaterial({ color })
            : new THREE.MeshLambertMaterial({ color });
        const mesh = track(new THREE.Mesh(new THREE.SphereGeometry(radiusAu, 48, 24), material));
        scene.add(mesh);

        let dot = null;
        if (id !== 'Sun') {
            dot = track(makeDot(color, radiusAu, pixelRatio));
            mesh.add(dot);
        }
        if (id === 'Saturn') mesh.add(track(makeSaturnRings(radiusAu, color)));

        return { id, name: f.name, type: f.type, facts: f, radiusAu, color, mesh, dot, position: mesh.position };
    });
    const byId = new Map(bodies.map(b => [b.id, b]));

    // Orbit lines, built for the date given to update()
    let orbitsDate = null;
    let moonOrbit = null;
    const buildOrbits = (date) => {
        orbitGroup.children.slice().forEach(line => {
            orbitGroup.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        for (const id of SOLAR_SYSTEM_BODIES) {
            const body = byId.get(id);
            if (body) orbitGroup.add(makeOrbitLine(orbitPath(id, date), body.color));
        }
        // The Moon's orbit around Earth, positioned at Earth in update()
        if (byId.has('Moon')) {
            moonOrbit = makeOrbitLine(moonOrbitPath(date), byId.get('Moon').color);
            orbitGroup.add(moonOrbit);
        }
        orbitsDate = date;
    };

    const update = (date) => {
        for (const body of bodies) {
            if (body.id === 'Sun') continue;
            body.position.set(...heliocentricPosition(body.id, date));
        }
        // Rebuild orbits when the date has moved a lot (planets drift off them)
        if (!orbitsDate || Math.abs(date - orbitsDate) > 30 * 86400000) buildOrbits(date);
        if (moonOrbit && byId.has('Earth')) moonOrbit.position.copy(byId.get('Earth').position);
    };

    const dots = bodies.filter(b => b.dot).map(b => b.dot.material);
    let showOrbits = true;
    let fade = 1;
    const applyOrbitOpacity = () => {
        orbitGroup.visible = showOrbits && fade > 0;
        orbitGroup.children.forEach(line => { line.material.opacity = ORBIT_OPACITY * fade; });
    };

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
            dots.forEach(m => { m.uniforms.uFade.value = f; });
            applyOrbitOpacity();
        },
        setShowOrbits: (on) => {
            showOrbits = on;
            applyOrbitOpacity();
        },
        setHaze: (on) => dots.forEach(m => { m.uniforms.uLinear.value = on ? 1 : 0; }),
        setViewportHeight: (px) => dots.forEach(m => { m.uniforms.uViewportHeight.value = px; }),
        dispose: () => {
            orbitGroup.children.forEach(line => {
                line.geometry.dispose();
                line.material.dispose();
            });
            disposables.forEach(obj => {
                obj.geometry.dispose();
                obj.material.dispose();
            });
        },
    };
}
