// Planetary rings: what solarSystem3d.js draws (RING_SYSTEMS) and the
// named features the 3D view labels and describes (RING_FEATURES).
// Distances are km from the planet's centre.

import { raDecToXYZ } from './universe3d.js';

// ---------- Drawing ----------
// Each ring system lies in its planet's equator (pole: IAU north pole, RA
// and Dec in degrees, J2000) and is drawn as flat strips. Saturn's main
// rings are the Solar System Scope texture, which isn't evenly scaled: its
// `stops` pin texture positions (u) to the real radii of the C and B ring
// inner edges, the Cassini Division, the Encke Gap's centre (where Pan
// orbits) and the A ring's outer edge, and it is stretched linearly between
// them. The rest are drawn from published ring edges (Burns et al.,
// Esposito, de Pater et al.; as tabled on Wikipedia's ring articles):
// bands [inner km, outer km, opacity].
// Opacities are for display. The real faint rings are far darker (Jupiter's
// would be invisible), so the dusty ones are exaggerated to be seen; the
// narrow Uranus rings are thinner than a texel and come out as faint lines.
const band = (r, width, opacity) => [r - width / 2, r + width / 2, opacity];

export const RING_SYSTEMS = {
    Jupiter: {
        pole: [268.057, 64.495],
        strips: [{
            km: [92000, 226000], color: '#8c7a66',
            bands: [
                [92000, 122500, 0.05],    // halo
                [122500, 129000, 0.22],   // main ring
                [129000, 182000, 0.04],   // Amalthea gossamer ring
                [182000, 226000, 0.02],   // Thebe gossamer ring
            ],
        }],
    },
    Saturn: {
        pole: [40.589, 83.537],
        strips: [
            {
                // C, B and A rings: [texture pixel / 2048, km]; the ends
                // (clear margins) extrapolated from their neighbours
                texture: '2k_saturn_ring_alpha.png',
                stops: [
                    [0, 70613],
                    [107.5, 74490],     // C ring inner edge
                    [592.5, 91980],     // B ring inner edge
                    [1375.5, 117580],   // Cassini Division
                    [1448.5, 122170],
                    [1835, 133590],     // Encke Gap centre
                    [1926.5, 136780],   // A ring outer edge
                    [2048, 141016],
                ].map(([px, km]) => [px / 2048, km]),
            },
            {
                km: [139500, 480000], color: '#c9c2b4',
                bands: [
                    band(140180, 50, 0.6),    // F ring (shepherded by Prometheus and Pandora)
                    [166000, 175000, 0.05],   // G ring
                    [180000, 480000, 0.015],  // E ring (from Enceladus' plumes)
                ],
            },
        ],
    },
    Uranus: {
        pole: [257.311, -15.175],
        strips: [
            {
                km: [37000, 52000], color: '#77736c',
                bands: [
                    [37850, 41350, 0.05],     // zeta (dusty)
                    band(41837, 2, 0.7),      // 6
                    band(42234, 2.5, 0.7),    // 5
                    band(42571, 2.5, 0.7),    // 4
                    band(44718, 7, 0.7),      // alpha
                    band(45661, 8, 0.7),      // beta
                    band(47175, 1.5, 0.7),    // eta
                    band(47627, 2.5, 0.7),    // gamma
                    band(48300, 6, 0.7),      // delta
                    band(50023, 1.5, 0.5),    // lambda
                    band(51149, 58, 0.85),    // epsilon (19-96 km wide)
                ],
            },
            {
                km: [60000, 104000], color: '#8fa7c9',
                bands: [
                    [64200, 68000, 0.05],     // nu (dusty)
                    [86000, 103000, 0.04],    // mu (dusty, blue; Mab's orbit)
                ],
            },
        ],
    },
    Neptune: {
        pole: [299.36, 43.46],
        strips: [{
            km: [40000, 64000], color: '#7a6f69',
            bands: [
                [40900, 42900, 0.06],         // Galle
                band(53200, 113, 0.35),       // Le Verrier
                [53200, 57200, 0.04],         // Lassell
                band(57200, 50, 0.25),        // Arago
                band(62932, 35, 0.4),         // Adams (its arcs not drawn)
            ],
        }],
    },
};

// A ring system's plane normal in the scene frame [x, y, z]
export function ringPole(planet) {
    const [raDeg, decDeg] = RING_SYSTEMS[planet].pole;
    return raDecToXYZ(raDeg / 15, decDeg, 1);
}

// ---------- Named features ----------
// kind: 'ring' | 'gap' | 'group' (several narrow rings under one label)
// km: [inner, outer]. width: shown instead of outer - inner when set.
// scaleKm: how big the feature looks for deciding when to label it, if not
// its width (narrow rings: the distance to their neighbours, so a label
// shows once they are drawn apart). madeOf / discovered / note: the card.
// Sources: NASA Science ring pages, Wikipedia's ring articles and their
// references (Burns et al., Esposito, de Pater et al., Showalter & Lissauer).
const narrow = (r, width) => [r - width / 2, r + width / 2];

const SATURN_RINGS = [
    {
        id: 'saturn-c', name: 'C ring', kind: 'ring', km: [74490, 91980],
        madeOf: 'Water ice, dirtier and darker than the B and A rings',
        discovered: '1850, by William and George Bond (and William Dawes)',
        note: 'Also called the Crepe Ring for its faint, see-through look: Saturn shows through it.',
    },
    {
        id: 'saturn-b', name: 'B ring', kind: 'ring', km: [91980, 117580],
        madeOf: 'Almost pure water ice, in pieces from grains to boulders several metres across',
        discovered: 'Part of the ring Christiaan Huygens described in 1655',
        note: 'The brightest and most massive ring, so packed that almost no starlight gets through. '
            + 'Like the other main rings it is astonishingly thin: typically about 10 metres thick.',
    },
    {
        id: 'saturn-cassini', name: 'Cassini Division', kind: 'gap', km: [117580, 122170],
        madeOf: 'Not empty: thin ringlets of darker, dustier ice',
        discovered: '1675, by Giovanni Cassini',
        note: 'Kept mostly clear by Mimas. A particle at its inner edge would go round Saturn exactly '
            + 'twice for each orbit of Mimas, and those regular tugs pull its orbit out of shape.',
    },
    {
        id: 'saturn-a', name: 'A ring', kind: 'ring', km: [122170, 136780],
        madeOf: 'Water ice',
        discovered: 'Part of Huygens\' ring (1655); Cassini split it from the B ring in 1675',
        note: 'Holds the Encke Gap (cleared by Pan) and the narrow Keeler Gap (cleared by Daphnis), plus '
            + '"propeller" moonlets too small to clear a gap. Its sharp outer edge is held by Janus and Epimetheus.',
    },
    {
        id: 'saturn-encke', name: 'Encke Gap', kind: 'gap', km: [133423, 133745],
        madeOf: 'Thin, wavy ringlets of dust',
        discovered: '1888, by James Keeler (named after Johann Encke)',
        note: 'Pan, a 28 km moon shaped like a ravioli, orbits inside it and sweeps it clear. '
            + 'Its pull leaves waves along both edges.',
    },
    {
        id: 'saturn-f', name: 'F ring', kind: 'ring', km: narrow(140180, 50), scaleKm: 3400,
        width: 'A few hundred km, with a bright core tens of km wide',
        madeOf: 'Icy particles and lots of fine dust',
        discovered: '1979, by Pioneer 11',
        note: 'A narrow, knotted, braided-looking ring kept in place by two shepherd moons: '
            + 'Prometheus just inside it and Pandora just outside.',
    },
    {
        id: 'saturn-g', name: 'G ring', kind: 'ring', km: [166000, 175000],
        madeOf: 'Fine dust',
        discovered: '1980, by Voyager 1',
        note: 'Fed by a bright arc of debris around the tiny moonlet Aegaeon, chipped off by small impacts.',
    },
    {
        id: 'saturn-e', name: 'E ring', kind: 'ring', km: [180000, 480000], labelKm: 300000,
        madeOf: 'Microscopic ice grains',
        discovered: '1966, from Earth (Walter Feibelman)',
        note: 'Saturn\'s widest ring. Enceladus orbits inside it and keeps it supplied: '
            + 'the ice it sprays from geysers at its south pole drifts out into the ring.',
    },
].map(f => ({ ...f, planet: 'Saturn' }));

const JUPITER_RINGS = [
    {
        id: 'jupiter-halo', name: 'Halo ring', kind: 'ring', km: [92000, 122500],
        madeOf: 'Very fine dust',
        discovered: '1979, by the Voyager probes',
        note: 'A thick, doughnut-shaped cloud: dust from the main ring drifting inwards, '
            + 'puffed up by Jupiter\'s magnetic field.',
    },
    {
        id: 'jupiter-main', name: 'Main ring', kind: 'ring', km: [122500, 129000],
        madeOf: 'Dark red-brown dust and rocky debris',
        discovered: '1979, by Voyager 1',
        note: 'Debris knocked off the small moons Metis and Adrastea by meteorite impacts; they orbit '
            + 'inside it, and Adrastea marks its outer edge. So faint it shows best when lit from behind.',
    },
    {
        id: 'jupiter-amalthea', name: 'Amalthea gossamer ring', kind: 'ring', km: [129000, 182000],
        madeOf: 'Fine dust from Amalthea',
        discovered: '1979 (Voyager); Galileo showed in the 1990s that there are two gossamer rings',
        note: 'Really a thick sheet, as tall as Amalthea\'s slightly tilted orbit carries it above '
            + 'and below Jupiter\'s equator. Drawn flat here.',
    },
    {
        id: 'jupiter-thebe', name: 'Thebe gossamer ring', kind: 'ring', km: [129000, 226000], labelKm: 205000, scaleKm: 44000,
        madeOf: 'Fine dust from Thebe',
        discovered: '1979 (Voyager); Galileo showed in the 1990s that there are two gossamer rings',
        note: 'Even fainter than Amalthea\'s, and thicker; it reaches a little past Thebe\'s orbit '
            + '(222,000 km). Drawn flat here, beyond Amalthea\'s ring.',
    },
].map(f => ({ ...f, planet: 'Jupiter' }));

const URANUS_NARROW = {
    madeOf: 'Dark chunks, centimetres to metres across, with little dust',
    discovered: '1977, from Earth, when a star blinked off and on several times before passing behind Uranus',
};
const URANUS_RINGS = [
    {
        id: 'uranus-zeta', name: 'ζ ring', kind: 'ring', km: [37850, 41350],
        madeOf: 'Dust', discovered: '1986, by Voyager 2',
        note: 'A faint dusty sheet inside the narrow rings, reaching in towards the planet.',
    },
    {
        id: 'uranus-654', name: 'Rings 6, 5 and 4', kind: 'group', km: [41836, 42573], scaleKm: 2100,
        width: 'A few km each', ...URANUS_NARROW,
        note: 'The innermost of the narrow rings, numbered in the order they were found.',
    },
    {
        id: 'uranus-alpha-beta', name: 'α and β rings', kind: 'group', km: [44714, 45665], scaleKm: 1500,
        width: 'About 5-10 km each, varying around the ring', ...URANUS_NARROW,
        note: 'Slightly oval, so their widths change around the ring.',
    },
    {
        id: 'uranus-eta-gamma-delta', name: 'η, γ and δ rings', kind: 'group', km: [47174, 48303], scaleKm: 1500,
        width: '1-9 km each', ...URANUS_NARROW,
        note: 'η has a faint, broad skirt of dust on its outside; δ one on its inside.',
    },
    {
        id: 'uranus-lambda', name: 'λ ring', kind: 'ring', km: narrow(50023, 1.5), scaleKm: 1100,
        width: '1-2 km', madeOf: 'Mostly dust', discovered: '1986, by Voyager 2',
        note: 'Like Jupiter\'s dusty rings, it shows best when lit from behind.',
    },
    {
        id: 'uranus-epsilon', name: 'ε ring', kind: 'ring', km: narrow(51149, 58), scaleKm: 1100,
        width: '20-96 km: it is slightly oval, widest farthest from Uranus',
        madeOf: URANUS_NARROW.madeOf,
        discovered: '1977, from Earth (James Elliot, Edward Dunham, Jessica Mink)',
        note: 'Uranus\' densest and widest ring, held in place by two shepherd moons: Cordelia inside it '
            + 'and Ophelia outside. Its material reflects only about 2% of sunlight, like charcoal.',
    },
    {
        id: 'uranus-nu', name: 'ν ring', kind: 'ring', km: [64200, 68000],
        madeOf: 'Reddish dust', discovered: '2005, by the Hubble Space Telescope (Mark Showalter, Jack Lissauer)',
        note: 'A faint dusty ring well outside the narrow rings.',
    },
    {
        id: 'uranus-mu', name: 'μ ring', kind: 'ring', km: [86000, 103000],
        madeOf: 'Fine dust or ice grains, blue', discovered: '2005, by the Hubble Space Telescope (Mark Showalter, Jack Lissauer)',
        note: 'Fed by the small moon Mab, which orbits in its brightest part. It is blue, like Saturn\'s '
            + 'E ring fed by Enceladus.',
    },
].map(f => ({ ...f, planet: 'Uranus' }));

const NEPTUNE_DUST = 'Dark dust and small particles';
const NEPTUNE_RINGS = [
    {
        id: 'neptune-galle', name: 'Galle ring', kind: 'ring', km: [40900, 42900],
        madeOf: NEPTUNE_DUST, discovered: '1989, by Voyager 2',
        note: 'Broad and very faint. Named after Johann Galle, who first saw Neptune, in 1846.',
    },
    {
        id: 'neptune-le-verrier', name: 'Le Verrier ring', kind: 'ring', km: narrow(53200, 113), scaleKm: 2000,
        madeOf: NEPTUNE_DUST, discovered: '1989, by Voyager 2',
        note: 'Narrow; the moon Despina orbits just inside it. Named after Urbain Le Verrier, '
            + 'who worked out where Neptune would be found.',
    },
    {
        id: 'neptune-lassell', name: 'Lassell ring', kind: 'ring', km: [53200, 57200],
        madeOf: NEPTUNE_DUST, discovered: '1989, by Voyager 2',
        note: 'A broad, very faint sheet between the Le Verrier and Arago rings. '
            + 'Named after William Lassell, who discovered Triton.',
    },
    {
        id: 'neptune-arago', name: 'Arago ring', kind: 'ring', km: narrow(57200, 50), scaleKm: 2000,
        madeOf: NEPTUNE_DUST, discovered: '1989, by Voyager 2',
        note: 'Faint and narrow, on the Lassell ring\'s outer edge. Named after François Arago.',
    },
    {
        id: 'neptune-adams', name: 'Adams ring', kind: 'ring', km: narrow(62932, 35), scaleKm: 5000,
        madeOf: NEPTUNE_DUST,
        discovered: 'Its arcs in 1984, from Earth; the whole ring in 1989, by Voyager 2',
        note: 'Neptune\'s outermost ring, with four bright clumpy arcs named Courage, Liberté, Égalité and '
            + 'Fraternité (not drawn here), held together by the moon Galatea just inside it. '
            + 'Named after John Couch Adams.',
    },
].map(f => ({ ...f, planet: 'Neptune' }));

export const RING_FEATURES = [...SATURN_RINGS, ...JUPITER_RINGS, ...URANUS_RINGS, ...NEPTUNE_RINGS];
export const RING_FEATURES_BY_ID = new Map(RING_FEATURES.map(f => [f.id, f]));

// "Ring of Saturn", "Gap in Saturn's rings", "Rings of Uranus"
export function ringSubtitle(f) {
    if (f.kind === 'gap') return `Gap in ${f.planet}'s rings`;
    return `${f.kind === 'group' ? 'Rings' : 'Ring'} of ${f.planet}`;
}

// Size used to decide when a feature is labelled, and how far back to view it
export const ringScaleKm = (f) => f.scaleKm ?? f.km[1] - f.km[0];
// Radius its label (and view) sits at
export const ringLabelKm = (f) => f.labelKm ?? (f.km[0] + f.km[1]) / 2;
