// Checks src/utils/planets.js against Skyfield + JPL DE421.
//
// Reference positions come from Star_Data (run there first, skypy env):
//   python scripts/tools/planet_reference.py
// Then here:
//   node scripts/check-planets.js
//
// For each date, compares where each body appears from Earth (RA/Dec) and
// how far it is from the Sun. RA/Dec go through the scene frame, so this
// also checks that planets line up with the stars (raDecToXYZ).

import { readFileSync } from 'node:fs';
import { geocentricMoon, heliocentricPosition, SOLAR_SYSTEM_BODIES } from '../src/utils/planets.js';

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
process.exit(failed ? 1 : 0);
