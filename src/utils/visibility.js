// Hand-rolled alt/az astronomy for the "visible at time X, location Y" filter.
// Altitude-only is used for eligibility filtering (Quiz mode + Sky View askability);
// full alt/az is used for Sky View's real-horizon rendering. The stereographic
// projection below is a direct port of the sibling project's plot.py:44-50
// (stereographic_from_altaz), so az follows that same convention: 0=North,
// 90=East, clockwise.

function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }
function norm360(deg) { return ((deg % 360) + 360) % 360; }

function julianDate(date) {
    return date.getTime() / 86400000 + 2440587.5;
}

// raHours: right ascension in hours (0-24); decDeg: declination in degrees
// latDeg/lonDeg: observer's geodetic position (lonDeg east-positive)
// Returns { alt, az } in degrees.
export function getAltAz(date, latDeg, lonDeg, raHours, decDeg) {
    const jd = julianDate(date);
    const T = (jd - 2451545.0) / 36525;

    // Greenwich Mean Sidereal Time (IAU 1982 formula)
    const gmst = norm360(
        280.46061837 + 360.98564736629 * (jd - 2451545.0)
        + 0.000387933 * T * T - (T ** 3) / 38710000
    );

    const lst = norm360(gmst + lonDeg);
    const haDeg = norm360(lst - raHours * 15 + 180) - 180; // hour angle, [-180, 180]

    const dec = toRad(decDeg);
    const lat = toRad(latDeg);
    const ha = toRad(haDeg);

    const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    const az = Math.atan2(
        -Math.cos(dec) * Math.sin(ha),
        Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha)
    );

    return { alt: toDeg(alt), az: norm360(toDeg(az)) };
}

// Direct port of plot.py:44-50 (zenith-centered stereographic projection).
// Returns unscaled x/y (edge of visible sky at alt=0 maps to r = 2*tan(45deg) = 2).
export function stereographicFromAltAz(altDeg, azDeg) {
    const z = toRad(90 - altDeg);
    const r = 2.0 * Math.tan(z / 2);
    const a = toRad(azDeg);
    return { x: r * Math.sin(a), y: r * Math.cos(a) };
}

// Returns a Set of abbrevs whose constellation center (ra_center/dec_center)
// is above minAltitude at the given date/location.
export function getVisibleAbbrevs(constellationData, abbrevs, { date, lat, lon, minAltitude = 10 }) {
    const visible = new Set();
    for (const abbrev of abbrevs) {
        const data = constellationData[abbrev];
        if (!data) continue;
        const { alt } = getAltAz(date, lat, lon, data.ra_center, data.dec_center);
        if (alt >= minAltitude) visible.add(abbrev);
    }
    return visible;
}
