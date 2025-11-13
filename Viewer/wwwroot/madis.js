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
    // Only show gray for exactly 0 (not trace amounts)
    if (valueInInches <= 0) return 'rgb(200, 200, 200)'; // Gray for zero

    for (let i = 0; i < qpeColorMap.thresholds.length; i++) {
        if (valueInInches >= qpeColorMap.thresholds[i]) {
            return qpeColorMap.colors[i];
        }
    }
    return qpeColorMap.colors[qpeColorMap.colors.length - 1]; // Lowest color
}
// Get color for bias value (gauge/QPE ratio)
function getBiasColor(biasRatio) {
    if (biasRatio === null || biasRatio === undefined || !isFinite(biasRatio)) {
        return 'rgb(200, 200, 200)'; // Gray for invalid
    }

    // Positive bias (gauge > QPE) - light to dark red
    if (biasRatio >= 10) return 'rgb(139, 0, 0)';  // Super dark red for extreme overestimation
    if (biasRatio >= 5) return 'rgb(178, 34, 34)';
    if (biasRatio >= 2.5) return 'rgb(205, 92, 92)';
    if (biasRatio >= 2.0) return 'rgb(220, 120, 120)';
    if (biasRatio >= 1.6) return 'rgb(235, 150, 150)';
    if (biasRatio >= 1.3) return 'rgb(245, 180, 180)';
    if (biasRatio >= 1.1) return 'rgb(255, 210, 210)';
    if (biasRatio >= 1.0) return 'rgb(255, 230, 230)';

    // Near neutral
    if (biasRatio >= 0.9) return 'rgb(245, 245, 245)';

    // Negative bias (gauge < QPE) - light to dark blue/purple
    if (biasRatio >= 0.77) return 'rgb(230, 230, 255)';
    if (biasRatio >= 0.625) return 'rgb(210, 210, 255)';
    if (biasRatio >= 0.5) return 'rgb(180, 180, 245)';
    if (biasRatio >= 0.4) return 'rgb(150, 150, 235)';
    if (biasRatio >= 0.2) return 'rgb(120, 120, 220)';
    if (biasRatio >= 0.1) return 'rgb(92, 92, 205)';
    if (biasRatio > 0.01) return 'rgb(34, 34, 178)';

    return 'rgb(0, 0, 139)'; // Very dark blue for extreme underestimation (bias <= 0.01)
}

// Build MADIS URL for precipitation (1-hour or 24-hour)
function buildMadisUrl(startDate, startHour, startMinute, lookBack, lookForward, accumPeriod = '1H') {
    // Fixed bounds: -130 to -60 longitude, 20 to 60 latitude
    const latLower = 20.0;
    const latUpper = 60.0;
    const lonLower = -130.0;
    const lonUpper = -60.0;

    // Select the correct precipitation variable based on accumulation period
    const pcpVar = accumPeriod === '24H' ? 'PCP24H' : 'PCP1H';

    return `https://madis-data.ncep.noaa.gov/madisPublic1/cgi-bin/madisXmlPublicDir?rdr=&time=${startDate}_${startHour}${startMinute}&minbck=-${lookBack}&minfwd=${lookForward}&recwin=4&dfltrsel=0&state=&latll=${latLower}&lonll=${lonLower}&latur=${latUpper}&lonur=${lonUpper}&stanam=&stasel=0&pvdrsel=0&varsel=1&qctype=0&qcsel=0&xml=5&csvmiss=0&nvars=${pcpVar}&nvars=LAT&nvars=LON`;
}

// Store parsed MADIS data globally
window.madisData = [];
window.madisMarkersLayer = null;
window.fullGaugeData = []; // Store processed gauge data with MRMS values for filtering

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

// Process array in batches to avoid overwhelming the browser/server
async function processBatches(items, batchSize, processFn) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processFn));
        results.push(...batchResults);

        // Small delay between batches to prevent overwhelming the connection
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    return results;
}


// Filter gauge data by map bounds and update scatterplot
function updateScatterplotByBounds(map) {
    if (!map || !window.fullGaugeData || window.fullGaugeData.length === 0) {
        return;
    }

    // Get current map bounds
    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();

    // Filter gauge data to only include gauges within current map bounds
    const filteredData = window.fullGaugeData.filter(d => {
        if (!d) return false;
        return d.lat >= south && d.lat <= north && d.lon >= west && d.lon <= east;
    });

    // Check if bias mode is enabled
    const biasMode = document.getElementById('bias-toggle')?.checked || false;

    // Update scatterplot with filtered data
    if (window.scatterplotManager) {
        window.scatterplotManager.updateData(filteredData, biasMode);
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

    // Check if bias mode is enabled
    const biasMode = document.getElementById('bias-toggle')?.checked || false;

    // Check if user wants to see gauge > 0, MRMS = 0 cases
    const showZeroMrms = document.getElementById('show-zero-mrms-toggle')?.checked || false;

    // Update total gauges loaded (before filtering by value > 0)
    const totalGaugesLoaded = window.madisData.length;
    const totalLoadedEl = document.getElementById('stat-total-loaded');
    if (totalLoadedEl) {
        totalLoadedEl.textContent = totalGaugesLoaded;
    }

    // Filter gauges with value > 0
    const filteredGauges = window.madisData
        .filter(item => {
            const { lat, lon, value } = item;
            return !isNaN(lat) && !isNaN(lon) &&
                   lat >= lowerLat && lat <= upperLat &&
                   lon >= lowerLon && lon <= upperLon &&
                   value > 0;  // Only process gauges with precipitation
        });

    // Process gauges in batches to avoid overwhelming the server
    const gaugeData = await processBatches(filteredGauges, 50, async (item) => {
        const { stationId, obvTime, provider, value, lat, lon } = item;
        const displayValue = convertFromMM(value, unit);

        if (!isFinite(displayValue) || isNaN(displayValue)) return null;

        // Fetch MRMS value at this location
        const mrmsValue = await getMrmsValueAt(lat, lon);

        // Calculate bias with special handling for edge cases
        let biasRatio = null;
        const mrmsIsZero = mrmsValue === null || mrmsValue === 0 || mrmsValue < 0.001;

        if (displayValue > 0 && mrmsIsZero) {
            // Gauge detected precip but MRMS didn't
            if (!showZeroMrms) {
                // User doesn't want to see these, skip this gauge
                return null;
            }
            // Set bias to 11 (extreme overestimation)
            biasRatio = 11;
        } else if (mrmsValue !== null && mrmsValue !== undefined && mrmsValue >= 0.001) {
            // Normal case: both have values
            biasRatio = displayValue / mrmsValue;
        }

        return { stationId, obvTime, provider, displayValue, mrmsValue, biasRatio, lat, lon };
    });

    // Store full gauge data globally for filtering by map bounds
    window.fullGaugeData = gaugeData.filter(d => d !== null);

    // Update total gauges with data > 0 (gauges actually plotted)
    const totalWithDataEl = document.getElementById('stat-total-with-data');
    if (totalWithDataEl) {
        totalWithDataEl.textContent = window.fullGaugeData.length;
    }

    // Plot gauges
    for (const data of gaugeData) {
        if (!data) continue;

        const { stationId, obvTime, provider, displayValue, mrmsValue, biasRatio, lat, lon } = data;

        // Choose color based on mode
        const fillColor = biasMode ? getBiasColor(biasRatio) : getPrecipColor(displayValue);

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

    // Update scatterplot with gauge data
    if (window.scatterplotManager) {
        window.scatterplotManager.updateData(window.fullGaugeData, biasMode);
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
        loadMadisData: async function(date, hour, minute, lookBack, lookForward, accumPeriod) {
            const madisUrl = buildMadisUrl(date, hour, minute, lookBack, lookForward, accumPeriod);
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
        },
        updateScatterplotByBounds: function() {
            updateScatterplotByBounds(map);
        }
,
        replotGauges: function() {
            // Replot gauges with current data (useful for bias mode toggle)
            plotMadisData(map);
        }
    };
}
