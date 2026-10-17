// Named asteroid, dwarf planet and comet positions (small_bodies.json,
// built by Star_Data/scripts/build_small_bodies.py from JPL's Small-Body
// Database), in AU from the Sun, in the scene frame (J2000 equatorial,
// north = +Y; see planets.js).
//
// Two-body Kepler orbits from SBDB's osculating elements (J2000 ecliptic):
// the Sun's pull alone, so positions drift as the planets tug them. Slowly
// in the main belt; faster for bodies that pass close to Jupiter or Earth
// (Apophis' 2029 flyby changes its orbit, this keeps the old one). Comets
// also get pushed by their own outgassing. Good for years around the
// elements' epoch (2026 for most). The point cloud does the same maths on
// the GPU (smallBodies3d.js).

import { eccentricAnomaly } from './moons.js';

const DEG = Math.PI / 180;
const DAY_MS = 86400000;
const JD_UNIX_EPOCH = 2440587.5;
// Gaussian gravitational constant (rad/day): mean motion n = k / a^1.5, a in AU
export const GAUSS_K = 0.01720209895;
// J2000 ecliptic -> equator tilt
export const OBLIQUITY_RAD = 23.4392911 * DEG;
const COS_EPS = Math.cos(OBLIQUITY_RAD);
const SIN_EPS = Math.sin(OBLIQUITY_RAD);
// Hyperbolic orbits are drawn out to this distance from the Sun (AU), or
// past the body if it is farther
const HYPERBOLA_EXTENT_AU = 150;

export const julianDate = (date) => date.getTime() / DAY_MS + JD_UNIX_EPOCH;
export const dateFromJulian = (jd) => new Date((jd - JD_UNIX_EPOCH) * DAY_MS);

const isBound = (b) => b.e < 1;

// Semi-major axis (AU; elliptic orbits only)
export const semiMajorAxis = (b) => b.q / (1 - b.e);

// Orbital period in days, or null for an orbit that escapes the Sun
export function smallBodyPeriodDays(b) {
    if (!isBound(b)) return null;
    return 2 * Math.PI * semiMajorAxis(b) ** 1.5 / GAUSS_K;
}

// Hyperbolic Kepler equation M = e sinh H - H, solved for H
function hyperbolicAnomaly(M, e) {
    let H = Math.asinh(M / e);
    for (let k = 0; k < 50; k++) {
        const dH = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
        H -= dH;
        if (Math.abs(dH) < 1e-12) break;
    }
    return H;
}

// Point in the orbit plane (x towards perihelion, AU) -> scene [x, y, z]:
// turn by w, tilt by i, turn by node (as moons.js), then ecliptic -> equator
function orbitToScene(b, px, py) {
    const cw = Math.cos(b.w * DEG), sw = Math.sin(b.w * DEG);
    const ci = Math.cos(b.i * DEG), si = Math.sin(b.i * DEG);
    const cn = Math.cos(b.node * DEG), sn = Math.sin(b.node * DEG);
    const x1 = cw * px - sw * py;
    const y1 = sw * px + cw * py;
    const y2 = ci * y1;
    const z2 = si * y1;
    const x = cn * x1 - sn * y2;          // ecliptic
    const y = sn * x1 + cn * y2;
    const z = z2;
    const ye = COS_EPS * y - SIN_EPS * z;  // equatorial
    const ze = SIN_EPS * y + COS_EPS * z;
    return [x, ze, -ye];                  // scene (north = +Y)
}

// Eccentric anomaly (radians, 0..2pi) of an elliptic orbit at a Date
function eccentricAnomalyAt(b, date) {
    const a = semiMajorAxis(b);
    const M = GAUSS_K / a ** 1.5 * (julianDate(date) - b.tp);
    return eccentricAnomaly(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), b.e);
}

// True anomaly (radians) of a hyperbolic orbit at a Date
function hyperbolicTrueAnomalyAt(b, date) {
    const a = b.q / (b.e - 1);
    const H = hyperbolicAnomaly(GAUSS_K / a ** 1.5 * (julianDate(date) - b.tp), b.e);
    return 2 * Math.atan(Math.sqrt((b.e + 1) / (b.e - 1)) * Math.tanh(H / 2));
}

// A small_bodies.json `named` entry at a Date: [x, y, z] AU from the Sun.
// From perihelion distance q and time tp, so ellipses, hyperbolas and
// parabolas work alike.
export function smallBodyPosition(b, date) {
    const dt = julianDate(date) - b.tp;  // days since perihelion
    const { q, e } = b;
    let px, py;
    if (e < 1 && Math.abs(e - 1) >= 1e-8) {
        const a = q / (1 - e);
        const E = eccentricAnomalyAt(b, date);
        px = a * (Math.cos(E) - e);
        py = a * Math.sqrt(1 - e * e) * Math.sin(E);
    } else if (Math.abs(e - 1) < 1e-8) {
        // Parabola (Barker's equation): D + D^3/3 = dt sqrt(GM / 2q^3), D = tan(nu/2)
        const A = GAUSS_K * dt / Math.sqrt(2 * q * q * q);
        const Y = Math.cbrt(1.5 * A + Math.sqrt(2.25 * A * A + 1));
        const D = Y - 1 / Y;
        px = q * (1 - D * D);
        py = 2 * q * D;
    } else {
        const a = q / (e - 1);
        const H = hyperbolicAnomaly(GAUSS_K / a ** 1.5 * dt, e);
        px = a * (e - Math.cosh(H));
        py = a * Math.sqrt(e * e - 1) * Math.sinh(H);
    }
    return orbitToScene(b, px, py);
}

// The orbit as flat [x, y, z, ...] AU from the Sun: {points, closed}.
// Point segments/2 is the body at `date`, and points bunch up around it
// (offset ~ u^3), so seen up close it sits on its line. The orbit itself
// never changes (two-body), but a line of straight segments strays from
// the curve between points (~1,000 km near a comet far out), so the 3D view
// redraws it around the body every frame; it's cheap, unlike the planets'.
// Ellipses (closed): by eccentric anomaly, not time like the planets'
// (planets.js sampleOrbit): a comet spends nearly all its time far out, so
// time steps would leave its swing past the Sun with a few points.
// Hyperbolas (open): by true anomaly, out to HYPERBOLA_EXTENT_AU.
export function smallBodyOrbit(b, date, segments = 512) {
    if (isBound(b)) {
        const a = semiMajorAxis(b);
        const minor = a * Math.sqrt(1 - b.e * b.e);
        const E0 = eccentricAnomalyAt(b, date);
        const out = new Float64Array(segments * 3);
        for (let k = 0; k < segments; k++) {
            const u = -1 + 2 * k / segments;
            const E = E0 + Math.sign(u) * Math.abs(u) ** 3 * Math.PI;
            out.set(orbitToScene(b, a * (Math.cos(E) - b.e), minor * Math.sin(E)), k * 3);
        }
        return { points: out, closed: true };
    }
    // r = p / (1 + e cos nu): true anomaly where r reaches the extent (or
    // a little past the body, once it is farther out than that)
    const p = b.q * (1 + b.e);
    const nu0 = hyperbolicTrueAnomalyAt(b, date);
    const extent = Math.max(HYPERBOLA_EXTENT_AU, 1.1 * p / (1 + b.e * Math.cos(nu0)));
    const nuMax = Math.acos(Math.max(-1, Math.min(1, (p / extent - 1) / b.e)));
    const out = new Float64Array((segments + 1) * 3);
    for (let k = 0; k <= segments; k++) {
        const u = -1 + 2 * k / segments;
        const nu = nu0 + (u < 0 ? nu0 + nuMax : nuMax - nu0) * Math.sign(u) * Math.abs(u) ** 3;
        const r = p / (1 + b.e * Math.cos(nu));
        out.set(orbitToScene(b, r * Math.cos(nu), r * Math.sin(nu)), k * 3);
    }
    return { points: out, closed: false };
}

// Next perihelion after `date` for an ellipse; the perihelion for an
// escaping orbit (past or future). Date.
export function perihelionDate(b, date) {
    const period = smallBodyPeriodDays(b);
    if (!period) return dateFromJulian(b.tp);
    const now = julianDate(date);
    return dateFromJulian(b.tp + Math.ceil((now - b.tp) / period) * period);
}
