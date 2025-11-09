// MRMS QPE colorbar for 1-hour precipitation (0.01 to 8.0+ inches)
const qpeColorMap = {
    thresholds: [8.0, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5, 4.0, 3.0, 2.0, 1.75, 1.25, 1.00, 0.80, 0.60, 0.40, 0.20, 0.10, 0.05, 0.01],
    colors: [
        'rgb(255, 255, 200)',  // 8.0+
        'rgb(150, 100, 200)',  // 7.0-8.0
        'rgb(200, 0, 255)',    // 6.5-7.0
        'rgb(255, 0, 255)',    // 6.0-6.5
        'rgb(180, 0, 0)',      // 5.5-6.0
        'rgb(220, 0, 0)',      // 5.0-5.5
        'rgb(255, 0, 0)',      // 4.5-5.0
        'rgb(255, 50, 0)',     // 4.0-4.5
        'rgb(255, 100, 0)',    // 3.0-4.0
        'rgb(255, 165, 0)',    // 2.0-3.0
        'rgb(255, 200, 0)',    // 1.75-2.0
        'rgb(255, 255, 0)',    // 1.25-1.75
        'rgb(150, 255, 0)',    // 1.00-1.25
        'rgb(0, 255, 0)',      // 0.80-1.00
        'rgb(0, 200, 0)',      // 0.60-0.80
        'rgb(0, 150, 0)',      // 0.40-0.60
        'rgb(0, 0, 255)',      // 0.20-0.40
        'rgb(0, 128, 255)',    // 0.10-0.20
        'rgb(0, 200, 255)',    // 0.05-0.10
        'rgb(0, 255, 255)'     // 0.01-0.05
    ]
};

// Get color for precipitation value using MRMS colormap
function getPrecipColor(valueInInches) {
    if (valueInInches < 0.01) return 'rgb(200, 200, 200)'; // Gray for trace/zero

    for (let i = 0; i < qpeColorMap.thresholds.length; i++) {
        if (valueInInches >= qpeColorMap.thresholds[i]) {
            return qpeColorMap.colors[i];
        }
    }
    return qpeColorMap.colors[qpeColorMap.colors.length - 1]; // Lowest color
}

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

// Get MRMS value at lat/lon from API
async function getMrmsValueAt(lat, lon) {
    try {
        const response = await fetch(`/api/tiles/value?lat=${lat}&lon=${lon}&cacheKey=default`);
        const result = await response.json();
        return result.value;
    } catch (error) {
        console.error('Error fetching MRMS value:', error);
        return null;
    }
}

// Plot MADIS data with MRMS comparison
async function plotMadisData(map) {
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

    const unit = 'in'; // Inches to match MRMS

    // Fetch MRMS values for all gauges in parallel
    const gaugePromises = window.madisData
        .filter(item => {
            const { lat, lon, value } = item;
            return !isNaN(lat) && !isNaN(lon) &&
                   lat >= lowerLat && lat <= upperLat &&
                   lon >= lowerLon && lon <= upperLon &&
                   value > 0;
        })
        .map(async (item) => {
            const { stationId, obvTime, provider, value, lat, lon } = item;
            const displayValue = convertFromMM(value, unit);

            if (!isFinite(displayValue) || isNaN(displayValue)) return null;

            // Fetch MRMS value at this location
            const mrmsValue = await getMrmsValueAt(lat, lon);

            return { stationId, obvTime, provider, displayValue, mrmsValue, lat, lon };
        });

    const gaugeData = await Promise.all(gaugePromises);

    // Plot gauges
    for (const data of gaugeData) {
        if (!data) continue;

        const { stationId, obvTime, provider, displayValue, mrmsValue, lat, lon } = data;

        // Use MRMS colormap
        const fillColor = getPrecipColor(displayValue);

        const mrmsText = mrmsValue !== null && mrmsValue !== undefined
            ? `<strong>MRMS:</strong> ${mrmsValue.toFixed(2)} ${unit}<br/><strong>Gauge:</strong> ${displayValue.toFixed(2)} ${unit}`
            : `<strong>Gauge:</strong> ${displayValue.toFixed(2)} ${unit}`;

        L.circleMarker([lat, lon], {
            radius: 6,
            color: '#333',
            fillColor: fillColor,
            fillOpacity: 0.85,
            weight: 1
        })
            .addTo(window.madisMarkersLayer)
            .bindPopup(
                `<strong>${stationId}</strong><br/>` +
                `Obs Time: ${obvTime}<br/>` +
                `Provider: ${provider}<br/>` +
                mrmsText
            );
    }

    // Don't add legend - MRMS colorbar will be visible
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
