/**
 * UI Handlers Module
 * Manages all user interface event handlers and interactions
 */

import { updateQPEColorbar, toggleBiasColorbar } from './colorbarManager.js';
import { switchBasemap, toggleOverlay, applyOverlaySettings, getOverlayLabel } from './mapManager.js';
import { ACCUMULATION_PERIODS } from './config.js';

/**
 * Populates the hour selector dropdown with 00-23 hours
 */
export function populateHourSelector() {
    const hourSelect = document.getElementById('hour-input');
    if (!hourSelect) return;

    hourSelect.innerHTML = '';

    for (let hour = 0; hour < 24; hour++) {
        const hourStr = hour.toString().padStart(2, '0');
        const option = document.createElement('option');
        option.value = hourStr;
        option.textContent = `${hourStr}:00`;
        hourSelect.appendChild(option);
    }
}

/**
 * Initializes the date and hour inputs with current UTC time
 */
export function initializeDateTimeInputs() {
    const now = new Date();

    const dateInput = document.getElementById('date-input');
    if (dateInput) {
        dateInput.valueAsDate = now;
    }

    populateHourSelector();

    const currentHour = now.getUTCHours().toString().padStart(2, '0');
    const hourInput = document.getElementById('hour-input');
    if (hourInput) {
        hourInput.value = currentHour;
    }
}

/**
 * Sets up the product selection change handler
 */
export function setupProductSelectHandler() {
    const productSelect = document.getElementById('product-select');
    if (!productSelect) return;

    // Update colorbar for initial product
    updateQPEColorbar(productSelect.value);

    // Update colorbar when product changes
    productSelect.addEventListener('change', (e) => {
        updateQPEColorbar(e.target.value);
    });
}

/**
 * Sets up the bias toggle checkbox handler
 *
 * @param {Object} madisController - MADIS controller instance with replotGauges method
 */
export function setupBiasToggleHandler(madisController) {
    const biasToggle = document.getElementById('bias-toggle');
    if (!biasToggle) return;

    biasToggle.addEventListener('change', async (e) => {
        const biasMode = e.target.checked;

        // Show/hide bias colorbar
        toggleBiasColorbar(biasMode);

        // Replot gauges with new coloring (don't refetch data)
        if (madisController && madisController.replotGauges) {
            madisController.replotGauges();
        }
    });
}

/**
 * Sets up the "show zero MRMS" toggle handler
 *
 * @param {Object} madisController - MADIS controller instance with replotGauges method
 */
export function setupShowZeroMrmsToggleHandler(madisController) {
    const showZeroMrmsToggle = document.getElementById('show-zero-mrms-toggle');
    if (!showZeroMrmsToggle) return;

    showZeroMrmsToggle.addEventListener('change', async (e) => {
        // Replot gauges with the new filter setting
        if (madisController && madisController.replotGauges) {
            madisController.replotGauges();
        }
    });
}

/**
 * Sets up the export gauge info button handler
 */
export function setupExportGaugeButtonHandler() {
    const exportBtn = document.getElementById('export-gauge-btn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
        if (!window.fullGaugeData || window.fullGaugeData.length === 0) {
            alert('No gauge data available to export. Please load gauge data first.');
            return;
        }

        const csvContent = generateGaugeInfoCSV(window.fullGaugeData);
        downloadGaugeInfoFile(csvContent);
    });
}

/**
 * Generates CSV content from gauge data
 *
 * @param {Array<Object>} gaugeData - Array of gauge data objects
 * @returns {string} CSV formatted string
 */
function generateGaugeInfoCSV(gaugeData) {
    let content = 'Gauge ID,Latitude,Longitude,Gauge QPE (in),MRMS QPE (in)\n';

    gaugeData.forEach(gauge => {
        if (gauge) {
            const gaugeQPE = gauge.displayValue !== null ? gauge.displayValue.toFixed(3) : 'N/A';
            const mrmsQPE = gauge.mrmsValue !== null && gauge.mrmsValue !== undefined
                ? gauge.mrmsValue.toFixed(3)
                : 'N/A';
            content += `${gauge.stationId},${gauge.lat.toFixed(4)},${gauge.lon.toFixed(4)},${gaugeQPE},${mrmsQPE}\n`;
        }
    });

    return content;
}

/**
 * Downloads gauge info as a text file
 *
 * @param {string} content - File content to download
 */
function downloadGaugeInfoFile(content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    a.download = `gauge_info_${timestamp}.txt`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

/**
 * Sets up the load data button handler
 *
 * @param {Object} map - Leaflet map instance
 * @param {Object} dataLayerState - Object containing current dataLayer reference
 * @param {Object} madisController - MADIS controller instance
 * @param {Object} lastGaugeLoad - Object tracking last gauge load parameters
 */
export function setupLoadDataButtonHandler(map, dataLayerState, madisController, lastGaugeLoad) {
    const loadBtn = document.getElementById('load-btn');
    if (!loadBtn) return;

    loadBtn.addEventListener('click', async () => {
        const product = document.getElementById('product-select').value;
        const dateInput = document.getElementById('date-input').value;
        const hourInput = document.getElementById('hour-input').value;
        const date = dateInput.replace(/-/g, '');
        const time = hourInput + '0000';
        const loading = document.getElementById('loading-indicator');

        const apiUrl = `/api/tiles/download-s3?product=${product}&date=${date}&time=${time}&cacheKey=default`;

        loadBtn.disabled = true;
        loading.style.display = 'block';

        try {
            const response = await fetch(apiUrl, { method: 'POST' });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error(`Server returned ${response.status}: ${errorText}`);
            }

            await response.json();

            // Remove existing data layer and add new one
            if (dataLayerState.current) {
                map.removeLayer(dataLayerState.current);
            }

            dataLayerState.current = L.tileLayer('/api/tiles/{z}/{x}/{y}.png?dataset=default&_=' + Date.now(), {
                maxZoom: 20,
                opacity: 0.7
            }).addTo(map);

            // Update colorbar
            updateQPEColorbar(product);

            // Automatically load gauges with MRMS data
            await loadGaugesForProduct(
                madisController,
                product,
                date,
                hourInput,
                lastGaugeLoad
            );

        } catch (error) {
            console.error('Error loading MRMS data:', error);
            alert('Error loading MRMS data: ' + error.message);
        } finally {
            loadBtn.disabled = false;
            loading.style.display = 'none';
        }
    });
}

/**
 * Loads gauge data for the selected product
 *
 * @param {Object} madisController - MADIS controller instance
 * @param {string} product - QPE product name
 * @param {string} date - Date string (YYYYMMDD)
 * @param {string} hour - Hour string (HH)
 * @param {Object} lastGaugeLoad - Object tracking last gauge load parameters
 */
async function loadGaugesForProduct(madisController, product, date, hour, lastGaugeLoad) {
    if (!madisController) return;

    try {
        const accumPeriod = product.includes('24H')
            ? ACCUMULATION_PERIODS.TWENTY_FOUR_HOUR
            : ACCUMULATION_PERIODS.ONE_HOUR;

        const needsReload =
            lastGaugeLoad.date !== date ||
            lastGaugeLoad.hour !== hour ||
            lastGaugeLoad.accumPeriod !== accumPeriod;

        if (needsReload) {
            await madisController.loadMadisData(date, hour, '00', 0, 0, accumPeriod);

            lastGaugeLoad.date = date;
            lastGaugeLoad.hour = hour;
            lastGaugeLoad.accumPeriod = accumPeriod;
        } else {
            console.log('Reusing cached gauge data, reprocessing with new MRMS product...');
            await madisController.replotGauges();
        }
    } catch (error) {
        console.error('Error auto-loading gauges:', error);
    }
}

/**
 * Sets up overlay type selector handler
 *
 * @param {Object} overlays - Object containing overlay instances
 * @param {Object} overlaySettings - Object containing overlay settings
 */
export function setupOverlayTypeSelectHandler(overlays, overlaySettings) {
    const overlayTypeSelect = document.getElementById('overlay-type-select');
    if (!overlayTypeSelect) return;

    overlayTypeSelect.addEventListener('change', (e) => {
        const overlayType = e.target.value;
        const optionsDiv = document.getElementById('overlay-options');

        if (overlayType === '') {
            optionsDiv.style.display = 'none';
            return;
        }

        optionsDiv.style.display = 'block';

        const settings = overlaySettings[overlayType];
        updateOverlayControlsForType(overlayType, overlays, settings);
    });
}

/**
 * Updates overlay controls for the selected overlay type
 *
 * @param {string} overlayType - Type of overlay
 * @param {Object} overlays - Object containing overlay instances
 * @param {Object} settings - Settings for the overlay
 */
function updateOverlayControlsForType(overlayType, overlays, settings) {
    document.getElementById('overlay-color-picker').value = settings.color;
    document.getElementById('overlay-color-preview').textContent = settings.color;
    document.getElementById('overlay-weight-slider').value = settings.weight;
    document.getElementById('overlay-weight-value').textContent = settings.weight;
    document.getElementById('overlay-opacity-slider').value = settings.opacity;
    document.getElementById('overlay-opacity-value').textContent = settings.opacity;

    document.getElementById('overlay-toggle').checked = overlays[overlayType].isEnabled();
    document.getElementById('overlay-toggle-label').textContent = getOverlayLabel(overlayType);

    applyOverlaySettings(overlays[overlayType], settings);
}

/**
 * Sets up overlay toggle handler
 *
 * @param {Object} overlays - Object containing overlay instances
 * @returns {Object} Object containing currentOverlay reference
 */
export function setupOverlayToggleHandler(overlays) {
    const currentOverlay = { type: null };
    const overlayToggle = document.getElementById('overlay-toggle');

    if (overlayToggle) {
        overlayToggle.addEventListener('change', (e) => {
            const overlayType = document.getElementById('overlay-type-select').value;
            if (overlayType && overlays[overlayType]) {
                currentOverlay.type = overlayType;
                toggleOverlay(overlays[overlayType], e.target.checked);
            }
        });
    }

    return currentOverlay;
}

/**
 * Sets up overlay color picker handler
 *
 * @param {Object} overlays - Object containing overlay instances
 * @param {Object} overlaySettings - Object containing overlay settings
 */
export function setupOverlayColorPickerHandler(overlays, overlaySettings) {
    const colorPicker = document.getElementById('overlay-color-picker');
    if (!colorPicker) return;

    colorPicker.addEventListener('input', (e) => {
        const overlayType = document.getElementById('overlay-type-select').value;
        if (overlayType && overlays[overlayType]) {
            const color = e.target.value;
            overlays[overlayType].setColor(color);
            document.getElementById('overlay-color-preview').textContent = color.toUpperCase();
            overlaySettings[overlayType].color = color;
        }
    });
}

/**
 * Sets up overlay weight slider handler
 *
 * @param {Object} overlays - Object containing overlay instances
 * @param {Object} overlaySettings - Object containing overlay settings
 */
export function setupOverlayWeightSliderHandler(overlays, overlaySettings) {
    const weightSlider = document.getElementById('overlay-weight-slider');
    if (!weightSlider) return;

    weightSlider.addEventListener('input', (e) => {
        const overlayType = document.getElementById('overlay-type-select').value;
        if (overlayType && overlays[overlayType]) {
            const weight = e.target.value;
            overlays[overlayType].setWeight(weight);
            document.getElementById('overlay-weight-value').textContent = weight;
            overlaySettings[overlayType].weight = weight;
        }
    });
}

/**
 * Sets up overlay opacity slider handler
 *
 * @param {Object} overlays - Object containing overlay instances
 * @param {Object} overlaySettings - Object containing overlay settings
 */
export function setupOverlayOpacitySliderHandler(overlays, overlaySettings) {
    const opacitySlider = document.getElementById('overlay-opacity-slider');
    if (!opacitySlider) return;

    opacitySlider.addEventListener('input', (e) => {
        const overlayType = document.getElementById('overlay-type-select').value;
        if (overlayType && overlays[overlayType]) {
            const opacity = e.target.value;
            overlays[overlayType].setOpacity(opacity);
            document.getElementById('overlay-opacity-value').textContent = opacity;
            overlaySettings[overlayType].opacity = opacity;
        }
    });
}

/**
 * Sets up basemap selector handler
 *
 * @param {Object} map - Leaflet map instance
 * @param {Object} basemaps - Object containing basemap layers
 * @param {Object} currentBasemapState - Object containing current basemap reference
 * @param {Object} dataLayerState - Object containing data layer reference
 */
export function setupBasemapSelectHandler(map, basemaps, currentBasemapState, dataLayerState) {
    const basemapSelect = document.getElementById('basemap-select');
    if (!basemapSelect) return;

    basemapSelect.addEventListener('change', (e) => {
        const selectedBasemap = e.target.value;
        currentBasemapState.current = switchBasemap(
            map,
            currentBasemapState.current,
            basemaps[selectedBasemap],
            dataLayerState.current
        );
    });
}

/**
 * Sets up map event handlers for viewport changes
 *
 * @param {Object} map - Leaflet map instance
 * @param {Object} madisController - MADIS controller instance
 */
export function setupMapViewportHandlers(map, madisController) {
    map.on('moveend', () => {
        if (madisController && madisController.updateScatterplotByBounds) {
            madisController.updateScatterplotByBounds();
        }
    });

    map.on('zoomend', () => {
        if (madisController && madisController.updateScatterplotByBounds) {
            madisController.updateScatterplotByBounds();
        }
    });
}
