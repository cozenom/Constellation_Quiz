// Moon positions (moons.json, built by Star_Data/scripts/build_moons.py),
// in AU relative to the parent planet, in the scene frame (J2000
// equatorial, north = +Y; see planets.js).
//
// Each moon is an ellipse fitted to JPL Horizons at an epoch (2026), turning
// at a mean motion measured over a year: accurate for years around the
// epoch, drifting slowly beyond (soonest for the small distant moons the Sun
// perturbs). Jupiter's four big moons come from astronomy-engine instead,
// which stays accurate for centuries (galileanPositions). Checked by
// scripts/check-planets.js.

import { JupiterMoons } from 'astronomy-engine';
import { sampleOrbit } from './planets.js';
import { KM_PER_AU } from './universe3d.js';  // .js so node scripts can import this too

const DEG = Math.PI / 180;
const DAY_MS = 86400000;
const JD_UNIX_EPOCH = 2440587.5;

// ICRF vector -> scene [x, y, z] (north = +Y), as in planets.js
const toScene = (x, y, z) => [x, z, -y];

// Kepler's equation M = E - e sin E, solved for E (radians)
function eccentricAnomaly(M, e) {
    let E = e < 0.8 ? M : Math.PI;
    for (let k = 0; k < 30; k++) {
        const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= dE;
        if (Math.abs(dE) < 1e-12) break;
    }
    return E;
}

// One moon (a moons.json entry) at a Date: [x, y, z] AU from its planet.
// Elements are ICRF: rotate the orbit-plane ellipse by w, i, node.
export function moonPosition(m, date) {
    const days = date.getTime() / DAY_MS + JD_UNIX_EPOCH - m.epoch_jd;
    const M = ((((m.M + m.n * days) % 360) + 360) % 360) * DEG;
    const E = eccentricAnomaly(M, m.e);
    const a = m.a_km / KM_PER_AU;
    const px = a * (Math.cos(E) - m.e);
    const py = a * Math.sqrt(1 - m.e * m.e) * Math.sin(E);

    const cw = Math.cos(m.w * DEG), sw = Math.sin(m.w * DEG);
    const ci = Math.cos(m.i * DEG), si = Math.sin(m.i * DEG);
    const cn = Math.cos(m.node * DEG), sn = Math.sin(m.node * DEG);
    const x1 = cw * px - sw * py;     // turn by w in the orbit plane
    const y1 = sw * px + cw * py;
    const y2 = ci * y1;               // tilt by i
    const z2 = si * y1;
    return toScene(cn * x1 - sn * y2, sn * x1 + cn * y2, z2);  // turn by node
}

// Io, Europa, Ganymede, Callisto from astronomy-engine:
// {name: [x, y, z]} AU from Jupiter
export const GALILEAN = ['Io', 'Europa', 'Ganymede', 'Callisto'];
export function galileanPositions(date) {
    const info = JupiterMoons(date);
    const out = {};
    for (const name of GALILEAN) {
        const v = info[name.toLowerCase()];
        out[name] = toScene(v.x, v.y, v.z);
    }
    return out;
}

// Orbital period in days of a moons.json moon
export const moonPeriodDays = (m) => 360 / Math.abs(m.n);

// One orbit as a closed loop around `date`, flat [x, y, z, ...] AU from the
// planet. Points bunch up near the moon, like orbitPath in planets.js.
export function moonOrbitLoop(m, date, segments = 256) {
    return sampleOrbit(d => moonPosition(m, d), date, moonPeriodDays(m) * DAY_MS, segments);
}

// The same for Io, Europa, Ganymede or Callisto, sampled from astronomy-engine
// so each sits exactly on its line. periodDays from its moons.json entry.
export function galileanOrbitLoop(name, periodDays, date, segments = 256) {
    return sampleOrbit(d => galileanPositions(d)[name], date, periodDays * DAY_MS, segments);
}
