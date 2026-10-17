// Checks src/utils/planets.js against Skyfield + JPL DE421, and
// src/utils/moons.js (with public/data/moons.json) and
// src/utils/smallBodies.js (with public/data/small_bodies*) against JPL
// Horizons.
//
// Reference positions come from Star_Data (run there first, skypy env):
//   python scripts/tools/planet_reference.py
//   python scripts/tools/moon_reference.py
//   python scripts/tools/small_body_reference.py
// Then here:
//   node scripts/check-planets.js
//
// For each date, compares where each body appears from Earth (RA/Dec) and
// how far it is from the Sun. RA/Dec go through the scene frame, so this
// also checks that planets line up with the stars (raDecToXYZ).

import { readFileSync } from 'node:fs';
import { moonPosition } from '../src/utils/moons.js';
import { geocentricMoon, heliocentricPosition, SOLAR_SYSTEM_BODIES } from '../src/utils/planets.js';
import { attachSmallBodyHistory, historyYears, smallBodyPosition } from '../src/utils/smallBodies.js';

const REF = '../../Star_Data/output/planet_reference.json';  // relative to this file
const ref = JSON.parse(readFileSync(new URL(REF, import.meta.url)));

// Scene frame (north = +Y, see raDecToXYZ) -> unit direction in ICRS (north = +Z)
const sceneToIcrs = ([x, y, z]) => [x, -z, y];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const norm = (v) => Math.hypot(...v);

// Angle between two vectors, arcseconds
function separationArcsec(a, b) {
    const cos = a.reduce((s, v, i) => s + v * b[i], 0) / (norm(a) * norm(b));
    return Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI * 3600;
}

// Limit (arcsec on the sky from Earth): astronomy-engine promises ~1'.
// First run (2026-10-13): worst 20" (Venus near inferior conjunction).
// For scale, one pixel at the default 60 deg FOV is ~200".
const LIMIT = { default: 60 };

let worst = 0;
let failed = false;
ref.dates.forEach((iso, d) => {
    const date = new Date(iso);
    const earth = sceneToIcrs(heliocentricPosition('Earth', date));
    const refEarth = ref.helio.Earth[d];
    console.log(`\n${iso}`);

    const rows = [];
    for (const body of SOLAR_SYSTEM_BODIES) {
        const mine = sceneToIcrs(heliocentricPosition(body, date));
        const theirs = ref.helio[body][d];
        const sky = body === 'Earth'
            ? separationArcsec(mine, theirs)  // Earth: direction from the Sun
            : separationArcsec(sub(mine, earth), sub(theirs, refEarth));
        const distErrKm = Math.abs(norm(mine) - norm(theirs)) * 149597870.7;
        rows.push([body, sky, distErrKm]);
    }
    const moon = sceneToIcrs(geocentricMoon(date));
    rows.push(['Moon', separationArcsec(moon, ref.moon[d]), Math.abs(norm(moon) - norm(ref.moon[d])) * 149597870.7]);

    for (const [body, sky, distErrKm] of rows) {
        const limit = LIMIT[body] ?? LIMIT.default;
        const ok = sky <= limit;
        if (!ok) failed = true;
        worst = Math.max(worst, sky);
        console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${body.padEnd(8)} ${sky.toFixed(2).padStart(7)}"  ` +
            `dist off ${Math.round(distErrKm).toLocaleString()} km`);
    }
});

console.log(`\nWorst: ${worst.toFixed(2)}"`);

// ---------- Moons (utils/moons.js) vs JPL Horizons ----------
// Reference: Star_Data scripts/tools/moon_reference.py. Moons are fitted
// at a 2026 epoch, so the 2026 column must be within MOON_LIMIT_DEG; the
// other years are shown to see the drift (soonest for the distant
// irregular moons the Sun perturbs). 5 deg because Phobos's orbit turns
// round every ~1-2 years (Mars's bulge), which a fixed ellipse can't
// follow: ~3.5 deg (570 km) off in 2026. The rest are within ~1.5 deg.
const MOON_LIMIT_DEG = 5;
const moonRef = JSON.parse(readFileSync(new URL('../../Star_Data/output/moon_reference.json', import.meta.url)));
const moonsData = JSON.parse(readFileSync(new URL('../public/data/moons.json', import.meta.url)));
const moonByCode = new Map(moonsData.moons.map(m => [String(m.code), m]));
const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);
const years = moonRef.dates.map(jd => jdToDate(jd).getUTCFullYear());

console.log(`\nMoons, angle seen from the planet (limit ${MOON_LIMIT_DEG} deg in 2026):`);
console.log(`  ${''.padEnd(13)}${years.map(y => String(y).padStart(9)).join('')}`);
for (const [code, refs] of Object.entries(moonRef.moons)) {
    const m = moonByCode.get(code);
    if (!m) continue;
    const errs = refs.map((ref, d) => separationArcsec(sceneToIcrs(moonPosition(m, jdToDate(moonRef.dates[d]))), ref) / 3600);
    const now = errs[years.indexOf(2026)];
    const ok = now <= MOON_LIMIT_DEG;
    if (!ok) failed = true;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m.name.padEnd(8)}${errs.map(e => `${e.toFixed(2)}°`.padStart(9)).join('')}`);
}

// ---------- Named small bodies (utils/smallBodies.js) vs JPL Horizons ----------
// Reference: Star_Data scripts/tools/small_body_reference.py. Each position
// blends two-body orbits from the two nearest Horizons samples
// (small_bodies_history.bin); the error is shown as km and as the angle
// seen from the Sun, and must stay under SMALL_BODY_LIMIT_DEG wherever the
// history covers the date. "(no history)" shows the single 2026 SBDB orbit
// for comparison. Bennu's history covers only 1900-2135 ("-").
const SMALL_BODY_LIMIT_DEG = 0.05;
const sbRef = JSON.parse(readFileSync(new URL('../../Star_Data/output/small_body_reference.json', import.meta.url)));
const sbMeta = JSON.parse(readFileSync(new URL('../public/data/small_bodies.json', import.meta.url)));
const sbPlain = JSON.parse(JSON.stringify(sbMeta.named));  // without history
const historyFile = readFileSync(new URL('../public/data/small_bodies_history.bin', import.meta.url));
attachSmallBodyHistory(sbMeta, historyFile.buffer.slice(historyFile.byteOffset, historyFile.byteOffset + historyFile.length));
const sbYears = sbRef.dates.map(jd => jdToDate(jd).getUTCFullYear());
const curated = JSON.parse(readFileSync(new URL('../../Star_Data/curated/small_bodies.json', import.meta.url))).bodies;
const KM_PER_AU_ = 149597870.7;

console.log(`\nNamed small bodies, error vs Horizons in km (angle from the Sun; limit ${SMALL_BODY_LIMIT_DEG} deg):`);
console.log(`  ${''.padEnd(19)}${sbYears.map(y => String(y).padStart(15)).join('')}`);
for (const [sstr, refs] of Object.entries(sbRef.bodies)) {
    const k = curated.findIndex(c => c.sstr === sstr);
    const b = sbMeta.named[k];
    const cells = [], plainCells = [];
    let ok = true;
    refs.forEach((ref, d) => {
        if (!ref) {
            cells.push('-'.padStart(15));
            plainCells.push('-'.padStart(15));
            return;
        }
        const date = jdToDate(sbRef.dates[d]);
        const r = sceneToIcrs(smallBodyPosition(b, date));
        const p = sceneToIcrs(smallBodyPosition(sbPlain[k], date));
        const err = norm(sub(r, ref)), plainErr = norm(sub(p, ref));
        const deg = err / norm(ref) * 180 / Math.PI;
        const [y0, y1] = historyYears(b);
        if (sbYears[d] >= y0 && sbYears[d] <= y1 && deg > SMALL_BODY_LIMIT_DEG) ok = false;
        cells.push(`${Math.round(err * KM_PER_AU_).toLocaleString('en')} (${deg.toFixed(3)}°)`.padStart(15));
        plainCells.push(`${(plainErr / norm(ref) * 180 / Math.PI).toFixed(2)}°`.padStart(15));
    });
    if (!ok) failed = true;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${b.name.slice(0, 14).padEnd(14)}${cells.join('')}`);
    console.log(`       ${'(no history)'.padEnd(14)}${plainCells.join('')}`);
}

process.exit(failed ? 1 : 0);
