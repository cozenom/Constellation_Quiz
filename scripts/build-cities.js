// One-time prep script: converts the raw GeoNames cities15000.txt bulk dump
// (public/data/cities15000.txt, CC-BY 3.0 geonames.org) into a trimmed JSON
// array used by the city search in VisibilityFilterControls.
//
// Usage: node scripts/build-cities.js
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = join(__dirname, '..', 'public', 'data', 'cities15000.txt');
const outputPath = join(__dirname, '..', 'public', 'data', 'cities.json');

const raw = readFileSync(inputPath, 'utf-8');
const lines = raw.split('\n').filter(line => line.trim().length > 0);

const cities = lines.map(line => {
    const cols = line.split('\t');
    return {
        name: cols[1],
        country: cols[8],
        lat: parseFloat(cols[4]),
        lon: parseFloat(cols[5]),
        population: parseInt(cols[14], 10) || 0,
    };
});

cities.sort((a, b) => b.population - a.population);

writeFileSync(outputPath, JSON.stringify(cities));
console.log(`Wrote ${cities.length} cities to ${outputPath}`);
