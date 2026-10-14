import React from 'react';
import { KM_PER_AU } from '../utils/universe3d';

// Uses the star card's styles (.star-info-*)

const TYPE_LABELS = {
    star: 'The star at the centre of the Solar System',
    planet: 'Planet',
    'dwarf planet': 'Dwarf planet',
    moon: 'Moon',
};

const fmt = (v, digits = 3) => Number(v.toPrecision(digits)).toLocaleString();

function formatAu(au) {
    if (au < 0.1) return `${fmt(au * KM_PER_AU)} km`;
    return `${au < 10 ? au.toFixed(2) : au.toFixed(1)} AU`;
}

function formatHours(h) {
    const abs = Math.abs(h);
    if (abs < 48) return `${fmt(abs)} hours`;
    return `${fmt(abs / 24)} days`;
}

function formatDays(d) {
    if (d < 730) return `${fmt(d)} days`;
    return `${fmt(d / 365.25)} years`;
}

function PlanetInfoCard({ body, distances, onClose, onFlyTo }) {
    const f = body.facts;
    const isSun = body.id === 'Sun';
    const subtitle = f.parent ? `${TYPE_LABELS[f.type]} of ${f.parent}` : TYPE_LABELS[f.type];

    return (
        <div className="star-info">
            <button className="star-info-close" onClick={onClose} aria-label="Close">×</button>
            <h3 className="star-info-title">{body.name}</h3>
            <div className="star-info-subtitle">{subtitle}</div>

            <dl className="star-info-facts">
                {!isSun && body.id !== 'Earth' && (
                    <>
                        <dt>From Earth</dt>
                        <dd>{formatAu(distances.earth)} <span className="star-info-muted">now</span></dd>
                    </>
                )}
                {!isSun && (
                    <>
                        <dt>From the Sun</dt>
                        <dd>
                            {formatAu(distances.sun)} <span className="star-info-muted">now</span>
                            {f.parent && <div className="star-info-muted">{fmt(f.distance_mkm * 1e6)} km from {f.parent} on average</div>}
                        </dd>
                    </>
                )}

                <dt>Diameter</dt>
                <dd>
                    {fmt(f.diameter_km, 4)} km
                    {body.id !== 'Earth' && <div className="star-info-muted">{fmt(f.diameter_km / 12756, 2)}× Earth</div>}
                </dd>

                <dt>Mass</dt>
                <dd>{body.id === 'Earth' ? '5.97 × 10²⁴ kg' : `${fmt(f.mass_earth, 3)}× Earth`}</dd>

                <dt>Gravity</dt>
                <dd>
                    {f.gravity_ms2} m/s²
                    {body.id !== 'Earth' && <span className="star-info-muted"> ({fmt(f.gravity_ms2 / 9.8, 2)}× Earth)</span>}
                </dd>

                {f.day_h !== null && (
                    <>
                        <dt>Day</dt>
                        <dd>
                            {formatHours(f.day_h)}
                            {f.rotation_h < 0 && <div className="star-info-muted">spins backwards (retrograde)</div>}
                        </dd>
                    </>
                )}

                {f.orbit_days !== null && (
                    <>
                        <dt>{f.parent ? 'Orbit' : 'Year'}</dt>
                        <dd>{formatDays(f.orbit_days)}</dd>
                    </>
                )}

                <dt>{isSun ? 'Surface' : 'Temperature'}</dt>
                <dd>
                    {f.temp_c} °C
                    {['Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(body.id) && (
                        <div className="star-info-muted">at the cloud tops (1 bar)</div>
                    )}
                </dd>

                {f.moons !== null && (
                    <>
                        <dt>Moons</dt>
                        <dd>{f.moons}{f.rings && <span className="star-info-muted"> · has rings</span>}</dd>
                    </>
                )}
            </dl>

            <button className="button-primary star-info-fly" onClick={onFlyTo}>
                {isSun ? 'View the Solar System' : `Fly to ${body.name}`}
            </button>
        </div>
    );
}

export default PlanetInfoCard;
