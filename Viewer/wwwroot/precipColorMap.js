// Jet colormap function: returns a hex color for a value between vmin and vmax
export function jetColor(value, vmin = 0, vmax = 50) {
    value = Math.max(vmin, Math.min(vmax, value));
    const dv = vmax - vmin;
    let r = 1, g = 1, b = 1;
    if (dv === 0) {
        r = g = b = 0.5;
    } else {
        let v = (value - vmin) / dv;
        if (v < 0.25) {
            r = 0;
            g = 4 * v;
            b = 1;
        } else if (v < 0.5) {
            r = 0;
            g = 1;
            b = 1 + 4 * (0.25 - v);
        } else if (v < 0.75) {
            r = 4 * (v - 0.5);
            g = 1;
            b = 0;
        } else {
            r = 1;
            g = 1 + 4 * (0.75 - v);
            b = 0;
        }
        r = Math.max(0, Math.min(1, r));
        g = Math.max(0, Math.min(1, g));
        b = Math.max(0, Math.min(1, b));
    }
    const toHex = x => {
        const h = Math.round(x * 255).toString(16);
        return h.length === 1 ? '0' + h : h;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function addJetColormapLegend(options = {}) {
    // Remove existing legend if present
    const existing = document.getElementById('jet-colormap-legend');
    if (existing) existing.remove();

    // Options
    const vmin = options.vmin ?? 0;
    const vmax = options.vmax ?? 50;
    const steps = options.steps ?? 50;
    const title = options.title ?? 'Precip';
    const units = options.units ?? 'mm';

    // Create legend container
    const legend = document.createElement('div');
    legend.id = 'jet-colormap-legend';
    legend.style.position = 'absolute';
    legend.style.top = '60px';
    legend.style.right = '30px';
    legend.style.width = '40px';
    legend.style.height = '300px';
    legend.style.background = 'white';
    legend.style.border = '1px solid #888';
    legend.style.borderRadius = '6px';
    legend.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    legend.style.zIndex = 1000;
    legend.style.display = 'flex';
    legend.style.flexDirection = 'column';
    legend.style.alignItems = 'center';
    legend.style.padding = '8px 4px';

    // Title
    const legendTitle = document.createElement('div');
    legendTitle.innerHTML = title;
    legendTitle.style.fontSize = '13px';
    legendTitle.style.fontWeight = 'bold';
    legendTitle.style.marginBottom = '2px';
    legend.appendChild(legendTitle);

    // Units (always below title)
    const legendUnits = document.createElement('div');
    legendUnits.textContent = units;
    legendUnits.style.fontSize = '12px';
    legendUnits.style.marginBottom = '6px';
    legend.appendChild(legendUnits);

    // Colorbar (canvas)
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 200;
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < canvas.height; y++) {
        const value = vmax - ((y / (canvas.height - 1)) * (vmax - vmin));
        ctx.fillStyle = jetColor(value, vmin, vmax);
        ctx.fillRect(0, y, canvas.width, 1);
    }
    legend.appendChild(canvas);

    // Min/Max labels
    const minLabel = document.createElement('div');
    minLabel.textContent = vmin;
    minLabel.style.fontSize = '12px';
    minLabel.style.marginTop = '2px';
    minLabel.style.alignSelf = 'flex-end';

    const maxLabel = document.createElement('div');
    maxLabel.textContent = vmax;
    maxLabel.style.fontSize = '12px';
    maxLabel.style.marginBottom = '2px';
    maxLabel.style.alignSelf = 'flex-end';

    // Place max label above, min label below
    legend.insertBefore(maxLabel, canvas);
    legend.appendChild(minLabel);

    // Add to map container (assumes Leaflet map is in #map or window.map._container)
    let mapContainer = document.getElementById('map');
    if (!mapContainer && window.map && window.map._container) {
        mapContainer = window.map._container;
    }
    if (mapContainer) {
        mapContainer.style.position = 'relative';
        mapContainer.appendChild(legend);
    } else {
        // fallback: add to body
        document.body.appendChild(legend);
    }
}