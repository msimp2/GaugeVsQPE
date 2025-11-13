/**
 * Colorbar Manager Module
 * Handles the display and management of colorbars for QPE products and bias visualization
 */

import { QPE_COLORBARS } from './config.js';

/**
 * Determines which colorbar type to use based on the product name
 *
 * @param {string} product - The QPE product name (e.g., 'RadarOnly_QPE_24H_00.00')
 * @returns {Object} Colorbar configuration object with title, bands, and labels
 */
export function getColorbarTypeForProduct(product) {
    if (product === 'bias') {
        return QPE_COLORBARS.GaugeBias;
    }

    if (product.includes('72H') || product.includes('72hr')) {
        return QPE_COLORBARS.QPE72Hr;
    }

    if (product.includes('48H') || product.includes('48hr')) {
        return QPE_COLORBARS.QPE48Hr;
    }

    if (product.includes('24H') || product.includes('24hr')) {
        return QPE_COLORBARS.QPE24Hr;
    }

    if (product.includes('06H') || product.includes('6hr') ||
        product.includes('12H') || product.includes('12hr')) {
        return QPE_COLORBARS.QPE6Hr;
    }

    // Default for 15min, 1hr, 3hr periods
    return QPE_COLORBARS.QPE15Min;
}

/**
 * Generates HTML for a colorbar display
 *
 * @param {Object} colorbar - Colorbar configuration with title, bands, and labels
 * @returns {string} HTML string for the colorbar
 */
function generateColorbarHTML(colorbar) {
    let html = `<h3>${colorbar.title}</h3><div class="colorbar-scale">`;

    for (let i = 0; i < colorbar.bands.length; i++) {
        html += `
            <div class="colorbar-item">
                <div class="colorbar-color" style="background-color: ${colorbar.bands[i]}"></div>
                <div class="colorbar-label">${colorbar.labels[i]}</div>
            </div>
        `;
    }

    html += '</div>';
    return html;
}

/**
 * Updates the main QPE colorbar based on the selected product
 *
 * @param {string} product - The QPE product name
 */
export function updateQPEColorbar(product) {
    const colorbarElement = document.getElementById('colorbar');
    if (!colorbarElement) {
        console.error('Colorbar element not found');
        return;
    }

    const colorbar = getColorbarTypeForProduct(product);
    colorbarElement.innerHTML = generateColorbarHTML(colorbar);
}

/**
 * Updates the bias colorbar display
 * Shows gauge/QPE bias ratio color scale
 */
export function updateBiasColorbar() {
    const colorbarElement = document.getElementById('bias-colorbar');
    if (!colorbarElement) {
        console.error('Bias colorbar element not found');
        return;
    }

    const colorbar = QPE_COLORBARS.GaugeBias;
    colorbarElement.innerHTML = generateColorbarHTML(colorbar);
}

/**
 * Shows the bias colorbar on the map
 */
export function showBiasColorbar() {
    const biasColorbarElement = document.getElementById('bias-colorbar');
    if (biasColorbarElement) {
        updateBiasColorbar();
        biasColorbarElement.style.display = 'block';
    }
}

/**
 * Hides the bias colorbar from the map
 */
export function hideBiasColorbar() {
    const biasColorbarElement = document.getElementById('bias-colorbar');
    if (biasColorbarElement) {
        biasColorbarElement.style.display = 'none';
    }
}

/**
 * Toggles the bias colorbar visibility
 *
 * @param {boolean} show - Whether to show or hide the bias colorbar
 */
export function toggleBiasColorbar(show) {
    if (show) {
        showBiasColorbar();
    } else {
        hideBiasColorbar();
    }
}
