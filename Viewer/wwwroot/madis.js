import { jetColor, addJetColormapLegend } from './precipColorMap.js';

// Build MADIS URL for 1-hour precipitation
function buildMadisUrl(startDate, startHour, startMinute, lookBack, lookForward) {
    // Fixed bounds: -130 to -60 longitude, 20 to 60 latitude
    const latLower = 20.0;
    const latUpper = 60.0;
    const lonLower = -130.0;
    const lonUpper = -60.0;

    return `https://madis-data.ncep.noaa.gov/madisPublic1/cgi-bin/madisXmlPublicDir?rdr=&time=${startDate}_${startHour}${startMinute}&minbck=-${lookBack}&minfwd=${lookForward}&recwin=4&dfltrsel=0&state=&latll=${latLower}&lonll=${lonLower}&latur=${latUpper}&lonur=${lonUpper}&stanam=&stasel=0&pvdrsel=0&varsel=1&qctype=0&qcsel=0&xml=5&csvmiss=0&nvars=PCP1H&nvars=LAT&nvars=LON`;
}

// Store parsed MADIS data globally
window.madisData = [];
window.madisMarkersLayer = null;

// Clear markers
function clearMadisMarkers(map) {
    if (window.madisMarkersLayer) {
        window.madisMarkersLayer.clearLayers();
    } else if (map) {
        window.madisMarkersLayer = L.layerGroup().addTo(map);
    }
}

// Precipitation conversion helpers
function convertFromMM(value, unit) {
    if (unit === 'mm') return value;
    if (unit === 'in') return value / 25.4;
    return value;
}

function convertToMM(value, unit) {
    if (unit === 'mm') return value;
    if (unit === 'in') return value * 25.4;
    return value;
}

// Get colormap bounds
function getColormapBounds() {
    const unit = 'in'; // Fixed to inches for consistency with MRMS
    const vmin = 0;
    const vmax = 1.0; // 1 inch max for 1-hour precip
    return { vmin, vmax, unit };
}

// Plot MADIS data
function plotMadisData(map) {
    if (!map) {
        console.error("Leaflet map is not initialized.");
        return;
    }

    clearMadisMarkers(map);

    // Fixed bounds
    const lowerLat = 20.0;
    const lowerLon = -130.0;
    const upperLat = 60.0;
    const upperLon = -60.0;

    const { vmin, vmax, unit } = getColormapBounds();

    for (const item of window.madisData) {
        const { stationId, obvTime, provider, value, lat, lon } = item;

        if (
            !isNaN(lat) && !isNaN(lon) &&
            lat >= lowerLat && lat <= upperLat &&
            lon >= lowerLon && lon <= upperLon &&
            value > 0 // Only show non-zero values
        ) {
            const displayValue = convertFromMM(value, unit);

            if (!isFinite(displayValue) || isNaN(displayValue)) continue;

            L.circleMarker([lat, lon], {
                radius: 5,
                color: '#333',
                fillColor: jetColor(displayValue, vmin, vmax),
                fillOpacity: 0.8,
                weight: 1
            })
                .addTo(window.madisMarkersLayer)
                .bindPopup(
                    `<strong>${stationId}</strong><br/>` +
                    `Obs Time: ${obvTime}<br/>` +
                    `Provider: ${provider}<br/>` +
                    `1-Hr Precip: ${displayValue.toFixed(2)} ${unit}`
                );
        }
    }

    // Update legend
    addJetColormapLegend({
        vmin,
        vmax,
        title: 'Gauge 1-Hr',
        units: unit
    });
}

// Fetch, parse, and plot CSV
async function fetchAndPlotMadisData(url, map) {
    clearMadisMarkers(map);

    try {
        const response = await fetch(url);
        const text = await response.text();
        const lines = text.trim().split('\n');

        if (lines.length < 2) {
            console.warn('No MADIS data returned');
            return;
        }

        window.madisData = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 10) continue;

            const stationId = cols[0];
            const obvTime = cols[2];
            const provider = cols[3];
            // Precipitation is in meters, convert to mm
            let value = Math.round((parseFloat(cols[5]) * 1000) * 100) / 100;
            value = Math.max(0, value);
            const lat = parseFloat(cols[7]);
            const lon = parseFloat(cols[9]);

            window.madisData.push({ stationId, obvTime, provider, value, lat, lon });
        }

        plotMadisData(map);
    } catch (error) {
        console.error('Error fetching MADIS data:', error);
    }
}

// Initialize MADIS functionality
export function initializeMadis(map) {
    if (!map) {
        console.error("Map not provided to initializeMadis");
        return;
    }

    // Create markers layer
    window.madisMarkersLayer = L.layerGroup().addTo(map);

    // Return functions that can be called externally
    return {
        loadMadisData: async function(date, hour, minute, lookBack, lookForward) {
            const madisUrl = buildMadisUrl(date, hour, minute, lookBack, lookForward);
            console.log('MADIS URL:', madisUrl);

            const proxyUrl = `/api/madisproxy?url=${encodeURIComponent(madisUrl)}`;
            console.log('Proxy URL:', proxyUrl);

            await fetchAndPlotMadisData(proxyUrl, map);

            // Return number of gauges loaded
            return window.madisData.length;
        },
        clearMarkers: function() {
            clearMadisMarkers(map);
        },
        toggleVisibility: function(visible) {
            if (window.madisMarkersLayer) {
                if (visible) {
                    map.addLayer(window.madisMarkersLayer);
                } else {
                    map.removeLayer(window.madisMarkersLayer);
                }
            }
        }
    };
}
