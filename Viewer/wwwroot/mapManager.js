/**
 * Map Manager Module
 * Handles Leaflet map initialization, basemap management, and overlay controls
 */

import { MAP_DEFAULTS, BASEMAPS, DEFAULT_OVERLAY_SETTINGS } from './config.js';

/**
 * Initializes the Leaflet map with default settings
 *
 * @param {string} containerId - The ID of the HTML element to contain the map
 * @returns {Object} Initialized Leaflet map instance
 */
export function initializeMap(containerId = 'map') {
    const map = L.map(containerId, {
        center: MAP_DEFAULTS.CENTER,
        zoom: MAP_DEFAULTS.ZOOM,
        zoomControl: MAP_DEFAULTS.ZOOM_CONTROL
    });

    return map;
}

/**
 * Creates all available basemap layers
 *
 * @returns {Object} Object containing all basemap layers keyed by name
 */
export function createBasemapLayers() {
    const basemapLayers = {};

    for (const [name, config] of Object.entries(BASEMAPS)) {
        basemapLayers[name] = L.tileLayer(config.url, {
            attribution: config.attribution,
            maxZoom: config.maxZoom
        });
    }

    return basemapLayers;
}

/**
 * Adds a basemap layer to the map
 *
 * @param {Object} map - Leaflet map instance
 * @param {Object} basemapLayer - Leaflet tile layer to add
 * @returns {Object} The added basemap layer
 */
export function addBasemapToMap(map, basemapLayer) {
    basemapLayer.addTo(map);
    return basemapLayer;
}

/**
 * Switches the active basemap on the map
 *
 * @param {Object} map - Leaflet map instance
 * @param {Object} currentBasemap - Currently active basemap layer
 * @param {Object} newBasemap - New basemap layer to activate
 * @param {Object} dataLayer - Optional data layer to bring to front after switch
 * @returns {Object} The new active basemap layer
 */
export function switchBasemap(map, currentBasemap, newBasemap, dataLayer = null) {
    if (currentBasemap) {
        map.removeLayer(currentBasemap);
    }

    newBasemap.addTo(map);

    // Ensure data layer stays on top if it exists
    if (dataLayer) {
        dataLayer.bringToFront();
    }

    return newBasemap;
}

/**
 * Initializes overlay modules (state boundaries, county lines, lat/lon grid)
 *
 * @param {Object} map - Leaflet map instance
 * @returns {Object} Object containing initialized overlay instances
 */
export function initializeOverlays(map) {
    return {
        states: new StateBoundaries(map),
        counties: new CountyBoundaries(map),
        latlon: new LatLonGrid(map)
    };
}

/**
 * Gets the default settings for a specific overlay type
 *
 * @param {string} overlayType - The type of overlay ('states', 'counties', 'latlon')
 * @returns {Object} Settings object with color, weight, and opacity
 */
export function getOverlaySettings(overlayType) {
    return DEFAULT_OVERLAY_SETTINGS[overlayType] || {};
}

/**
 * Gets all default overlay settings
 *
 * @returns {Object} Object containing all overlay default settings
 */
export function getAllOverlaySettings() {
    return { ...DEFAULT_OVERLAY_SETTINGS };
}

/**
 * Applies settings to an overlay
 *
 * @param {Object} overlay - Overlay instance with setColor, setWeight, setOpacity methods
 * @param {Object} settings - Settings object with color, weight, and opacity
 */
export function applyOverlaySettings(overlay, settings) {
    if (settings.color && overlay.setColor) {
        overlay.setColor(settings.color);
    }
    if (settings.weight !== undefined && overlay.setWeight) {
        overlay.setWeight(settings.weight);
    }
    if (settings.opacity !== undefined && overlay.setOpacity) {
        overlay.setOpacity(settings.opacity);
    }
}

/**
 * Toggles an overlay on or off
 *
 * @param {Object} overlay - Overlay instance with toggle method
 * @param {boolean} enabled - Whether to enable or disable the overlay
 */
export function toggleOverlay(overlay, enabled) {
    if (overlay && overlay.toggle) {
        overlay.toggle(enabled);
    }
}

/**
 * Gets the human-readable label for an overlay type
 *
 * @param {string} overlayType - The overlay type ('states', 'counties', 'latlon')
 * @returns {string} Human-readable label
 */
export function getOverlayLabel(overlayType) {
    const labels = {
        states: 'Show State Lines',
        counties: 'Show County Lines',
        latlon: 'Show Lat/Lon Grid'
    };
    return labels[overlayType] || 'Show Overlay';
}

/**
 * Creates a tile layer for MRMS data
 *
 * @param {string} cacheKey - Cache key for the tile layer
 * @param {number} opacity - Opacity of the tile layer (0-1)
 * @returns {Object} Leaflet tile layer
 */
export function createDataTileLayer(cacheKey = 'default', opacity = 0.7) {
    const cacheBuster = Date.now();
    return L.tileLayer(`/api/tiles/{z}/{x}/{y}.png?dataset=${cacheKey}&_=${cacheBuster}`, {
        maxZoom: 20,
        opacity: opacity
    });
}

/**
 * Replaces the current data layer with a new one
 *
 * @param {Object} map - Leaflet map instance
 * @param {Object} currentDataLayer - Current data layer to remove (can be null)
 * @param {Object} newDataLayer - New data layer to add
 * @returns {Object} The newly added data layer
 */
export function replaceDataLayer(map, currentDataLayer, newDataLayer) {
    if (currentDataLayer) {
        map.removeLayer(currentDataLayer);
    }

    newDataLayer.addTo(map);
    return newDataLayer;
}
