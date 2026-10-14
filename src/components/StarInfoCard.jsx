import React from 'react';
import { describeSpectralType, distanceRange, formatBayer, luminosityVsSun } from '../utils/universe3d';

// Distances at or above this relative error are shown as approximate
const APPROX_ERR = 0.25;

function formatLy(ly) {
    if (ly < 10) return ly.toFixed(1);
    if (ly < 1000) return String(Math.round(ly));
    return (Math.round(ly / 10) * 10).toLocaleString();
}

function formatLuminosity(times) {
    if (times >= 1) return `${Number(times.toPrecision(2)).toLocaleString()}× the Sun`;
    return `1/${Number((1 / times).toPrecision(2)).toLocaleString()} of the Sun`;
}

function DistanceValue({ dist, err }) {
    const { low, high } = distanceRange(dist, err);
    if (err < 0.1) {
        const pct = err < 0.01 ? '<1' : Math.round(err * 100);
        return <>{formatLy(dist)} ly <span className="star-info-muted">± {pct}%</span></>;
    }
    if (high !== null) {
        return (
            <>
                ~{formatLy(dist)} ly
                <div className="star-info-muted">likely {formatLy(low)}–{formatLy(high)} ly</div>
            </>
        );
    }
    return (
        <>
            over {formatLy(low)} ly
            <div className="star-info-muted">too far for its parallax to be measured well</div>
        </>
    );
}

function StarInfoCard({ star, lineInfo, onClose, onFlyTo }) {
    const bayer = formatBayer(lineInfo?.bayer);
    const title = star.name || bayer || `HIP ${star.hip}`;
    const subtitle = [
        star.name && bayer,
        lineInfo?.constellations.join(', '),
        `HIP ${star.hip}`,
    ].filter(Boolean).join(' · ');
    const isApprox = star.err >= APPROX_ERR;
    const description = describeSpectralType(star.spect);

    return (
        <div className="star-info">
            <button className="star-info-close" onClick={onClose} aria-label="Close">×</button>
            <h3 className="star-info-title">{title}</h3>
            <div className="star-info-subtitle">{subtitle}</div>

            <dl className="star-info-facts">
                <dt>Distance {isApprox && <span className="star-info-approx">approx.</span>}</dt>
                <dd>
                    <DistanceValue dist={star.dist} err={star.err} />
                    <div className="star-info-muted">
                        {star.src === 'lit'
                            ? 'Published estimate (its own parallax is too uncertain)'
                            : `${star.src === 'gaia' ? 'Gaia DR3' : 'Hipparcos'} parallax`}
                    </div>
                </dd>

                {star.spect && (
                    <>
                        <dt>Type</dt>
                        <dd>
                            {description ? `${description[0].toUpperCase()}${description.slice(1)}` : 'Star'}
                            <span className="star-info-muted"> ({star.spect})</span>
                        </dd>
                    </>
                )}

                <dt>Brightness</dt>
                <dd>
                    Magnitude {star.mag.toFixed(2)} from Earth
                    <div className="star-info-muted">
                        {isApprox ? '~' : ''}{formatLuminosity(luminosityVsSun(star.mag, star.dist))} in visible light
                    </div>
                </dd>
            </dl>

            {lineInfo?.origin && (
                <p className="star-info-origin">
                    <strong>Name origin{lineInfo.culturalGroup ? ` (${lineInfo.culturalGroup})` : ''}:</strong> {lineInfo.origin}
                </p>
            )}

            <button className="button-primary star-info-fly" onClick={onFlyTo}>Fly to star</button>
        </div>
    );
}

export default StarInfoCard;
