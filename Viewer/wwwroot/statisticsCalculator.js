/**
 * Statistics Calculator Module
 * Performs statistical calculations for gauge vs radar QPE comparison
 */

/**
 * Calculates comprehensive statistics comparing gauge and radar QPE data
 *
 * Statistics computed:
 * - Mean Bias (multiplicative): ratio of sum(gauge) / sum(radar)
 * - Additive Bias: difference of sum(gauge) - sum(radar)
 * - MAE (Mean Absolute Error): average of absolute differences
 * - RMSE (Root Mean Square Error): square root of average squared differences
 * - CC (Correlation Coefficient): Pearson's correlation coefficient
 *
 * @param {Array<Object>} data - Array of data points with x (gauge) and y (radar) values
 * @returns {Object} Statistics object with meanBias, additiveBias, mae, rmse, and cc
 */
export function calculateStatistics(data) {
    if (!data || data.length === 0) {
        return {
            meanBias: null,
            additiveBias: null,
            mae: null,
            rmse: null,
            cc: null
        };
    }

    const n = data.length;

    // Initialize accumulators for various sums
    let sumGauge = 0;
    let sumRadar = 0;
    let sumAbsoluteError = 0;
    let sumSquaredError = 0;
    let sumGaugeRadarProduct = 0;
    let sumGaugeSquared = 0;
    let sumRadarSquared = 0;

    // Calculate all required sums in a single pass
    for (const point of data) {
        const gaugeValue = point.x;
        const radarValue = point.y;
        const error = gaugeValue - radarValue;

        sumGauge += gaugeValue;
        sumRadar += radarValue;
        sumAbsoluteError += Math.abs(error);
        sumSquaredError += error * error;
        sumGaugeRadarProduct += gaugeValue * radarValue;
        sumGaugeSquared += gaugeValue * gaugeValue;
        sumRadarSquared += radarValue * radarValue;
    }

    // Calculate Mean Bias (multiplicative): sum(gauge) / sum(radar)
    const meanBias = sumRadar > 0 ? sumGauge / sumRadar : null;

    // Calculate Additive Bias: sum(gauge) - sum(radar)
    const additiveBias = sumGauge - sumRadar;

    // Calculate MAE: mean of absolute errors
    const mae = sumAbsoluteError / n;

    // Calculate RMSE: root mean square error
    const rmse = Math.sqrt(sumSquaredError / n);

    // Calculate Pearson's Correlation Coefficient
    const cc = calculateCorrelationCoefficient(
        data,
        sumGauge / n,
        sumRadar / n
    );

    return {
        meanBias,
        additiveBias,
        mae,
        rmse,
        cc
    };
}

/**
 * Calculates Pearson's correlation coefficient
 *
 * @param {Array<Object>} data - Array of data points with x (gauge) and y (radar) values
 * @param {number} meanGauge - Mean of gauge values
 * @param {number} meanRadar - Mean of radar values
 * @returns {number|null} Correlation coefficient (-1 to 1), or null if cannot be calculated
 */
function calculateCorrelationCoefficient(data, meanGauge, meanRadar) {
    let numerator = 0;
    let denominatorGauge = 0;
    let denominatorRadar = 0;

    // Calculate deviations from mean
    for (const point of data) {
        const gaugeDiff = point.x - meanGauge;
        const radarDiff = point.y - meanRadar;

        numerator += gaugeDiff * radarDiff;
        denominatorGauge += gaugeDiff * gaugeDiff;
        denominatorRadar += radarDiff * radarDiff;
    }

    // Check for division by zero
    if (denominatorGauge > 0 && denominatorRadar > 0) {
        return numerator / Math.sqrt(denominatorGauge * denominatorRadar);
    }

    return null;
}

/**
 * Updates the statistics display in the UI
 *
 * @param {Object} stats - Statistics object from calculateStatistics
 */
export function updateStatisticsDisplay(stats) {
    updateStatElement('stat-mean-bias', stats.meanBias, 2);
    updateStatElement('stat-add-bias', stats.additiveBias, 2);
    updateStatElement('stat-mae', stats.mae, 2);
    updateStatElement('stat-rmse', stats.rmse, 2);
    updateStatElement('stat-cc', stats.cc, 2);
}

/**
 * Updates a single statistic element in the UI
 *
 * @param {string} elementId - ID of the HTML element to update
 * @param {number|null} value - The statistic value
 * @param {number} decimalPlaces - Number of decimal places to display
 */
function updateStatElement(elementId, value, decimalPlaces = 2) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value !== null && value !== undefined
            ? value.toFixed(decimalPlaces)
            : '--';
    }
}

/**
 * Updates gauge count statistics in the UI
 *
 * @param {number} totalLoaded - Total number of gauges loaded
 * @param {number} totalWithData - Number of gauges with data > 0
 */
export function updateGaugeCountStatistics(totalLoaded, totalWithData) {
    const totalLoadedElement = document.getElementById('stat-total-loaded');
    if (totalLoadedElement) {
        totalLoadedElement.textContent = totalLoaded;
    }

    const totalWithDataElement = document.getElementById('stat-total-with-data');
    if (totalWithDataElement) {
        totalWithDataElement.textContent = totalWithData;
    }
}

/**
 * Clears all statistics display (sets to default '--' values)
 */
export function clearStatisticsDisplay() {
    updateStatisticsDisplay({
        meanBias: null,
        additiveBias: null,
        mae: null,
        rmse: null,
        cc: null
    });
}
