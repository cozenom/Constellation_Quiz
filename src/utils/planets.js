// Planet, Moon and Pluto positions (astronomy-engine), shared by the 3D view
// and later Sky View.
//
// Positions are in AU, Sun-centred, in the scene frame used for the stars
// (utils/universe3d.js raDecToXYZ): J2000 equatorial with celestial north
// along +Y. astronomy-engine's J2000 (EQJ) vectors have north along +Z, so
// (x, y, z) -> (x, z, -y). Checked against Skyfield + DE421 by
// scripts/check-planets.js.

import { Body, GeoMoon, HelioVector } from 'astronomy-engine';

// Drawn in the solar-system layer, in this order
export const SOLAR_SYSTEM_BODIES = [
    'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
];

// Sidereal orbital periods (days), for drawing one full orbit
const ORBIT_DAYS = {
    Mercury: 87.969, Venus: 224.701, Earth: 365.256, Mars: 686.980, Jupiter: 4332.59,
    Saturn: 10759.22, Uranus: 30688.5, Neptune: 60182, Pluto: 90560,
};

const MOON_ORBIT_DAYS = 27.32;  // sidereal month
const DAY_MS = 86400000;

// astronomy-engine EQJ vector -> scene [x, y, z]
const toScene = (v) => [v.x, v.z, -v.y];

// One body's position (AU from the Sun) at a Date. Body names as in
// SOLAR_SYSTEM_BODIES, plus 'Moon'.
export function heliocentricPosition(body, date) {
    return toScene(HelioVector(Body[body], date));
}

// Every body in SOLAR_SYSTEM_BODIES plus the Moon: {name: [x, y, z]} in AU
export function solarSystemPositions(date) {
    const out = {};
    for (const body of SOLAR_SYSTEM_BODIES) out[body] = heliocentricPosition(body, date);
    out.Moon = heliocentricPosition('Moon', date);
    return out;
}

// The Moon relative to Earth (AU). Accurate to ~arcminutes; useful for the
// Earth layer, where Earth is the origin.
export function geocentricMoon(date) {
    return toScene(GeoMoon(date));
}

// One orbit as a closed loop of points, flat [x, y, z, ...] in AU (for a
// THREE.LineLoop). Sampled from the real positions, so it matches where the
// body is drawn. Points bunch up around `date` (time offset ~ u^3): the
// line passes through the body, and seen up close evenly spaced straight
// segments show visible corners. Far round the orbit they're sparse, but
// also far away, so the corners are too small to see.
function sampleOrbit(position, date, periodMs, segments) {
    const out = new Float32Array(segments * 3);
    for (let i = 0; i < segments; i++) {
        const u = -1 + 2 * i / segments;
        const offset = Math.sign(u) * Math.abs(u) ** 3 * periodMs / 2;
        out.set(position(new Date(date.getTime() + offset)), i * 3);
    }
    return out;
}

export function orbitPath(body, date, segments = 512) {
    return sampleOrbit(d => heliocentricPosition(body, d), date, ORBIT_DAYS[body] * DAY_MS, segments);
}

// The Moon's orbit around Earth (AU, Earth-centred), sampled like orbitPath
export function moonOrbitPath(date, segments = 512) {
    return sampleOrbit(geocentricMoon, date, MOON_ORBIT_DAYS * DAY_MS, segments);
}
