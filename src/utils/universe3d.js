// Helpers for the 3D Universe mode.
// Scene units are light-years, with the Sun at the origin and celestial
// north (Dec +90) along +Y.

const LY_PER_PARSEC = 3.26156;

// Equatorial (RA hours, Dec degrees, distance ly) -> scene xyz.
// Mapping x = cos(ra), z = -sin(ra) keeps the sky un-mirrored when viewed
// from the origin: with north up, RA increases to the left (east).
export function raDecToXYZ(raHours, decDeg, distLy) {
    const ra = raHours * 15 * Math.PI / 180;
    const dec = decDeg * Math.PI / 180;
    const cosDec = Math.cos(dec);
    return [
        distLy * cosDec * Math.cos(ra),
        distLy * Math.sin(dec),
        -distLy * cosDec * Math.sin(ra),
    ];
}

// Apparent magnitude seen from Earth -> absolute magnitude (seen from 10 pc).
// The shader turns this back into apparent magnitude from the camera.
export function absoluteMagnitude(mag, distLy) {
    const distPc = distLy / LY_PER_PARSEC;
    return mag - 5 * Math.log10(distPc) + 5;
}

// B-V colour index -> effective temperature (Ballesteros 2012)
function bvToTemperature(bv) {
    return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

// Temperature (K) -> RGB in 0..1 (Tanner Helland's blackbody approximation)
function temperatureToRGB(kelvin) {
    const t = kelvin / 100;
    let r, g, b;
    if (t <= 66) {
        r = 255;
        g = 99.4708025861 * Math.log(t) - 161.1195681661;
        b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    } else {
        r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
        g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
        b = 255;
    }
    const clamp = (v) => Math.min(255, Math.max(0, v)) / 255;
    return [clamp(r), clamp(g), clamp(b)];
}

// B-V -> star tint. Mixed toward white so colours read as starlight, not paint.
export function bvToColor(bv) {
    if (bv === null || bv === undefined) return [1, 1, 1];
    const [r, g, b] = temperatureToRGB(bvToTemperature(Math.max(-0.4, Math.min(2.0, bv))));
    const mix = 0.35;
    return [r + (1 - r) * mix, g + (1 - g) * mix, b + (1 - b) * mix];
}

// stars_3d.json ({fields, stars: [[...]]}) -> typed arrays for the GPU,
// plus a hip -> index map for drawing constellation lines.
export function buildStarBuffers(stars3d) {
    const f = Object.fromEntries(stars3d.fields.map((name, i) => [name, i]));
    const count = stars3d.stars.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const absMags = new Float32Array(count);
    const hipToIndex = new Map();

    stars3d.stars.forEach((row, i) => {
        const [x, y, z] = raDecToXYZ(row[f.ra], row[f.dec], row[f.dist]);
        positions.set([x, y, z], i * 3);
        colors.set(bvToColor(row[f.bv]), i * 3);
        absMags[i] = absoluteMagnitude(row[f.mag], row[f.dist]);
        hipToIndex.set(row[f.hip], i);
    });

    return { positions, colors, absMags, hipToIndex, count };
}

// Line segment endpoints (flat xyz array) for one constellation's stick figure.
// Lines whose stars are missing from the 3D catalogue are skipped.
export function constellationLinePositions(constellation, starBuffers) {
    const { positions, hipToIndex } = starBuffers;
    const out = [];
    for (const [a, b] of constellation.lines) {
        const ia = hipToIndex.get(Number(constellation.stars[a].hip));
        const ib = hipToIndex.get(Number(constellation.stars[b].hip));
        if (ia === undefined || ib === undefined) continue;
        out.push(
            positions[ia * 3], positions[ia * 3 + 1], positions[ia * 3 + 2],
            positions[ib * 3], positions[ib * 3 + 1], positions[ib * 3 + 2],
        );
    }
    return out;
}

// 3D centre of a constellation's line stars (the point the camera orbits).
export function constellationCentroid(constellation, starBuffers) {
    const { positions, hipToIndex } = starBuffers;
    let x = 0, y = 0, z = 0, n = 0;
    for (const star of constellation.stars) {
        const i = hipToIndex.get(Number(star.hip));
        if (i === undefined) continue;
        x += positions[i * 3];
        y += positions[i * 3 + 1];
        z += positions[i * 3 + 2];
        n++;
    }
    return n ? [x / n, y / n, z / n] : [0, 0, -1];
}
