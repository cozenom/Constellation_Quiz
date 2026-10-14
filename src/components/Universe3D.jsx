import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    buildStarBuffers,
    bvToColor,
    constellationCentroid,
    constellationLinePositions,
} from '../utils/universe3d';
import './Universe3D.css';

const LY_PER_PARSEC = 3.26156;
const SUN_ABS_MAG = 4.83;
const SUN_BV = 0.65;

// Points shader: each star stores its absolute magnitude, and the apparent
// magnitude is recomputed from the camera distance every frame. From Earth
// this reproduces the real sky; flying closer makes a star brighter.
const starVertexShader = `
    attribute float absMag;
    attribute vec3 color;
    uniform float uPixelRatio;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float distPc = max(length(mvPosition.xyz) / ${LY_PER_PARSEC}, 1e-4);
        float mag = absMag + 5.0 * log(distPc) / log(10.0) - 5.0;

        gl_PointSize = clamp(2.0 + (6.5 - mag) * 1.3, 1.5, 24.0) * uPixelRatio;
        vAlpha = smoothstep(7.5, 5.0, mag);
        vColor = color;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const starFragmentShader = `
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-r * r * 8.0) + 0.35 * exp(-r * r * 2.5);
        float alpha = glow * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
    }
`;

function makeStarPoints(positions, colors, absMags, pixelRatio) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('absMag', new THREE.BufferAttribute(absMags, 1));
    const material = new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: { value: pixelRatio } },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geometry, material);
}

function makeLines(flatPositions, color, opacity) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(flatPositions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    return new THREE.LineSegments(geometry, material);
}

function disposeObject(obj) {
    if (!obj) return;
    obj.geometry.dispose();
    obj.material.dispose();
}

function formatDistance(ly) {
    if (ly < 0.01) return 'Earth';
    if (ly < 10) return `${ly.toFixed(2)} ly from the Sun`;
    return `${Math.round(ly).toLocaleString()} ly from the Sun`;
}

function Universe3D({ constellationData, stars3d, onBack }) {
    const [selectedAbbrev, setSelectedAbbrev] = useState('Ori');
    const [showLines, setShowLines] = useState(true);
    const [showAllLines, setShowAllLines] = useState(false);
    const mountRef = useRef(null);
    const distanceRef = useRef(null);
    const sceneRef = useRef(null);  // { scene, camera, controls, selectedLines, allLines }

    const starBuffers = useMemo(() => (stars3d ? buildStarBuffers(stars3d) : null), [stars3d]);

    const sortedAbbrevs = useMemo(
        () => Object.keys(constellationData).sort((a, b) =>
            constellationData[a].name.localeCompare(constellationData[b].name)),
        [constellationData]
    );

    // Set up renderer, scene, camera and stars once
    useEffect(() => {
        if (!starBuffers) return;
        const mount = mountRef.current;
        const pixelRatio = Math.min(window.devicePixelRatio, 2);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(pixelRatio);
        renderer.setClearColor(0x02040a);
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, 1, 0.001, 1e6);
        camera.up.set(0, 1, 0);  // celestial north

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.5;
        controls.minDistance = 0.01;
        controls.maxDistance = 50000;

        const stars = makeStarPoints(starBuffers.positions, starBuffers.colors, starBuffers.absMags, pixelRatio);
        scene.add(stars);

        // The Sun, so you can find home after flying away
        const sun = makeStarPoints(
            new Float32Array([0, 0, 0]),
            new Float32Array(bvToColor(SUN_BV)),
            new Float32Array([SUN_ABS_MAG]),
            pixelRatio
        );
        scene.add(sun);

        sceneRef.current = { scene, camera, controls, selectedLines: null, allLines: null };

        const resize = () => {
            const { clientWidth, clientHeight } = mount;
            renderer.setSize(clientWidth, clientHeight);
            camera.aspect = clientWidth / clientHeight;
            camera.updateProjectionMatrix();
        };
        resize();
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);

        let frameId;
        let lastLabel = '';
        const animate = () => {
            controls.update();
            renderer.render(scene, camera);
            // Update the distance readout directly to avoid a React render per frame
            const label = formatDistance(camera.position.length());
            if (label !== lastLabel && distanceRef.current) {
                distanceRef.current.textContent = label;
                lastLabel = label;
            }
            frameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            controls.dispose();
            const s = sceneRef.current;
            [stars, sun, s.selectedLines, s.allLines].forEach(disposeObject);
            renderer.dispose();
            mount.removeChild(renderer.domElement);
            sceneRef.current = null;
        };
    }, [starBuffers]);

    // Move to Earth, looking at the constellation, and orbit around its centre
    const resetToEarthView = () => {
        const s = sceneRef.current;
        if (!s) return;
        const centroid = constellationCentroid(constellationData[selectedAbbrev], starBuffers);
        s.camera.position.set(0, 0, 0);
        s.controls.target.set(...centroid);
        s.controls.update();
    };

    // Draw the selected constellation's stick figure
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        if (s.selectedLines) {
            s.scene.remove(s.selectedLines);
            disposeObject(s.selectedLines);
        }
        s.selectedLines = makeLines(
            constellationLinePositions(constellationData[selectedAbbrev], starBuffers),
            0x60a5fa,
            0.8
        );
        s.selectedLines.visible = showLines;
        s.scene.add(s.selectedLines);
        resetToEarthView();
    }, [selectedAbbrev, starBuffers]);

    // Line visibility. All 88 stick figures are built on first use.
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        if (s.selectedLines) s.selectedLines.visible = showLines;
        if (showLines && showAllLines && !s.allLines) {
            const flat = Object.values(constellationData)
                .flatMap(c => constellationLinePositions(c, starBuffers));
            s.allLines = makeLines(flat, 0x94a3b8, 0.25);
            s.scene.add(s.allLines);
        }
        if (s.allLines) s.allLines.visible = showLines && showAllLines;
    }, [showLines, showAllLines, starBuffers]);

    // Esc → back, L → toggle lines
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Escape') onBack();
            if (e.code === 'KeyL' && e.target.tagName !== 'SELECT') setShowLines(prev => !prev);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onBack]);

    if (!stars3d) {
        return (
            <div className="universe-3d-screen universe-3d-error">
                <button className="back-button" onClick={onBack}>← Back</button>
                <p>Failed to load the 3D star catalogue.</p>
            </div>
        );
    }

    const selected = constellationData[selectedAbbrev];

    return (
        <div className="universe-3d-screen">
            <div className="universe-3d-canvas" ref={mountRef} />

            <button className="back-button" onClick={onBack}>← Back</button>

            <div className="universe-3d-panel">
                <select value={selectedAbbrev} onChange={(e) => setSelectedAbbrev(e.target.value)}>
                    {sortedAbbrevs.map(abbrev => (
                        <option key={abbrev} value={abbrev}>{constellationData[abbrev].name}</option>
                    ))}
                </select>
                <label className="universe-3d-checkbox">
                    <input
                        type="checkbox"
                        checked={showLines}
                        onChange={(e) => setShowLines(e.target.checked)}
                    />
                    Show lines
                </label>
                <label className={`universe-3d-checkbox universe-3d-sub-option ${showLines ? '' : 'disabled'}`}>
                    <input
                        type="checkbox"
                        checked={showAllLines}
                        disabled={!showLines}
                        onChange={(e) => setShowAllLines(e.target.checked)}
                    />
                    All constellations
                </label>
                <button className="button-secondary" onClick={resetToEarthView}>Earth view</button>
            </div>

            <div className="universe-3d-footer">
                <div className="universe-3d-title">{selected.name}</div>
                {selected.name_english && selected.name_english !== selected.name && (
                    <div className="universe-3d-subtitle">{selected.name_english}</div>
                )}
                <div ref={distanceRef} className="universe-3d-distance" />
                <div className="universe-3d-hint">Drag to rotate · Scroll to zoom · Right-drag to pan</div>
            </div>
        </div>
    );
}

export default Universe3D;
