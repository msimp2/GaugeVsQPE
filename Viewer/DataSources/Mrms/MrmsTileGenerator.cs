using Grib;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using System.Collections.Concurrent;

namespace Viewer.DataSources.Mrms;

/// <summary>
/// Generates map tiles from MRMS GRIB2 data
/// Assumes MRMS data is always 0.01 x 0.01 degrees (3500 x 7000 grid)
/// Covering approximately 20-55°N, -130 to -60°E
/// </summary>
public class MrmsTileGenerator
{
    private readonly ILogger<MrmsTileGenerator> _logger;
    private readonly ConcurrentDictionary<string, float[]> _dataCache = new();
    private readonly ConcurrentDictionary<string, VariableMetadata> _metadataCache = new();

    public class VariableMetadata
    {
        public string Abbreviation { get; set; } = "Unknown";
        public string Name { get; set; } = "Unknown";
        public string Units { get; set; } = "";
        public byte Discipline { get; set; }
        public int Category { get; set; }
        public int Number { get; set; }
    }

    // MRMS grid constants
    private const int GRID_WIDTH = 7000;   // Longitude points
    private const int GRID_HEIGHT = 3500;  // Latitude points
    private const double GRID_RES = 0.01;  // degrees per grid point

    // Geographic bounds (approximate CONUS coverage)
    private const double MIN_LAT = 20.0;
    private const double MAX_LAT = 55.0;
    private const double MIN_LON = -130.0;
    private const double MAX_LON = -60.0;

    // Tile constants
    private const int TILE_SIZE = 256;

    public MrmsTileGenerator(ILogger<MrmsTileGenerator> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Load GRIB2 data into cache
    /// </summary>
    public async Task<bool> LoadGribDataAsync(string gribFilePath, string cacheKey = "default")
    {
        try
        {
            _logger.LogDebug("Loading GRIB2 file: {FilePath}", gribFilePath);

            await Task.Run(() =>
            {
                using var gribFile = new GribFile(gribFilePath);
                var messages = gribFile.ReadAllMessages(suppressErrors: true);

                if (messages.Count == 0)
                {
                    throw new Exception("No messages found in GRIB2 file");
                }

                // Get the first message's data
                var message = messages[0];
                var values = message.GetValues();

                // Extract variable metadata
                var paramInfo = Grib2ParameterTable.GetParameterInfo(
                    message.DisciplineCode,
                    (byte)message.ParameterCategory,
                    (byte)message.ParameterNumber);

                var metadata = new VariableMetadata
                {
                    Discipline = message.DisciplineCode,
                    Category = message.ParameterCategory,
                    Number = message.ParameterNumber,
                    Abbreviation = paramInfo?.Abbreviation ?? "Unknown",
                    Name = paramInfo?.Name ?? "Unknown",
                    Units = paramInfo?.Units ?? ""
                };

                // Log GRIB2 codes for debugging Unknown products
                if (metadata.Abbreviation == "Unknown")
                {
                    _logger.LogWarning("Unknown GRIB2 Product: Discipline={Disc}, Category={Cat}, Number={Num} in file {File}",
                        metadata.Discipline, metadata.Category, metadata.Number, gribFilePath);
                }

                _logger.LogInformation(
                    "Loaded: {Name}",
                    metadata.Name);

                // Convert meters to kilometers for Height products that have units in meters
                var name = metadata.Name;
                var abbrev = metadata.Abbreviation;
                var units = metadata.Units;

                // Height Composite Reflectivity products
                if (name.Contains("HeightCompositeReflectivity") || name.Contains("HeightLowLevelCompositeReflectivity") ||
                    name.Contains("Height Composite Reflectivity") || name.Contains("Height Low Level Composite Reflectivity"))
                {
                    _logger.LogInformation("Converting Height Composite Reflectivity values from meters to kilometers");
                    for (int i = 0; i < values.Length; i++)
                    {
                        if (!float.IsNaN(values[i]) && values[i] > -999f)
                        {
                            values[i] = values[i] / 1000.0f;
                        }
                    }
                    metadata.Units = "km"; // Update units in metadata
                }
                // Bright Band products (units are in meters, need to convert to km for SHSRH colormap)
                else if (abbrev.Contains("BrightBand") || name.Contains("Bright Band"))
                {
                    _logger.LogInformation("Converting Bright Band values from meters to kilometers");
                    for (int i = 0; i < values.Length; i++)
                    {
                        if (!float.IsNaN(values[i]) && values[i] > -999f)
                        {
                            values[i] = values[i] / 1000.0f;
                        }
                    }
                    metadata.Units = "km"; // Update units in metadata
                }
                // Model 0°C Height products (units are in meters, need to convert to km for SHSRH colormap)
                else if (abbrev.Contains("Model_0degC") || name.Contains("Model_0degC") ||
                         name.Contains("Model 0degC") || name.Contains("Model 0°C"))
                {
                    _logger.LogInformation("Converting Model 0°C Height values from meters to kilometers");
                    for (int i = 0; i < values.Length; i++)
                    {
                        if (!float.IsNaN(values[i]) && values[i] > -999f)
                        {
                            values[i] = values[i] / 1000.0f;
                        }
                    }
                    metadata.Units = "km"; // Update units in metadata
                }

                // VIL data correction - apply formula: (value - 768) / 256 (preserve special -3 values)
                // This converts the encoded values to kg/m²
                // NOTE: VIL Max products (VILMAX) are already correctly decoded, so exclude them
                if ((abbrev == "VIL" || abbrev == "VII" || (name.Contains("VIL") && !name.Contains("Density"))) && abbrev != "VILMAX")
                {
                    _logger.LogInformation("Applying VIL data correction: (value - 768) / 256, preserving -3 values");
                    _logger.LogInformation("Sample values BEFORE correction: {V1}, {V2}, {V3}, {V4}, {V5}",
                        values.Length > 0 ? values[0] : float.NaN,
                        values.Length > 1000 ? values[1000] : float.NaN,
                        values.Length > 5000 ? values[5000] : float.NaN,
                        values.Length > 10000 ? values[10000] : float.NaN,
                        values.Length > 15000 ? values[15000] : float.NaN);

                    for (int i = 0; i < values.Length; i++)
                    {
                        // Only apply correction to non-special values (not -3, not NaN, not missing)
                        if (!float.IsNaN(values[i]) && values[i] > -999f && Math.Abs(values[i] - (-3.0f)) > 0.001f)
                        {
                            values[i] = (values[i] - 768.0f) / 256.0f;
                        }
                    }

                    _logger.LogInformation("Sample values AFTER correction: {V1}, {V2}, {V3}, {V4}, {V5}",
                        values.Length > 0 ? values[0] : float.NaN,
                        values.Length > 1000 ? values[1000] : float.NaN,
                        values.Length > 5000 ? values[5000] : float.NaN,
                        values.Length > 10000 ? values[10000] : float.NaN,
                        values.Length > 15000 ? values[15000] : float.NaN);
                }

                // QPE products (Discipline=209, Category=6) - convert from mm to inches
                // Also handle Precipitation Rate products
                if ((metadata.Discipline == 209 && metadata.Category == 6) ||
                    abbrev == "PRATE" || abbrev == "PrecipRate" || name.Contains("QPE") ||
                    (name.Contains("Precip") && (name.Contains("Hour") || name.Contains("Minute") || name.Contains("Rate"))))
                {
                    _logger.LogInformation("Converting QPE values from mm to inches (dividing by 25.4)");
                    for (int i = 0; i < values.Length; i++)
                    {
                        if (!float.IsNaN(values[i]) && values[i] > -999f)
                        {
                            values[i] = values[i] / 25.4f;
                        }
                    }
                    // Update units in metadata
                    if (metadata.Units == "mm" || metadata.Units == "mm/hr")
                    {
                        metadata.Units = metadata.Units.Replace("mm", "in");
                    }
                }

                // RQI (Radar Quality Index) products - apply GRIB2 decoding: (value - 768) / 2.56
                // This converts from GRIB2 encoded values to 0-100 percentage
                if (abbrev == "RQI" || abbrev.Contains("RadarQualityIndex") || abbrev.Contains("RadarAccumQualityIndex") ||
                    name.Contains("Radar Quality Index") || name.Contains("Radar Accumulation Quality"))
                {
                    _logger.LogInformation("Converting RQI values using GRIB2 formula: (value - 768) / 2.56");
                    _logger.LogInformation("Sample values BEFORE RQI correction: {V1}, {V2}, {V3}, {V4}, {V5}",
                        values.Length > 0 ? values[0] : float.NaN,
                        values.Length > 1000 ? values[1000] : float.NaN,
                        values.Length > 5000 ? values[5000] : float.NaN,
                        values.Length > 10000 ? values[10000] : float.NaN,
                        values.Length > 15000 ? values[15000] : float.NaN);

                    for (int i = 0; i < values.Length; i++)
                    {
                        if (!float.IsNaN(values[i]) && values[i] > -999f)
                        {
                            values[i] = (values[i] - 768.0f) / 2.56f;
                        }
                    }

                    _logger.LogInformation("Sample values AFTER RQI correction: {V1}, {V2}, {V3}, {V4}, {V5}",
                        values.Length > 0 ? values[0] : float.NaN,
                        values.Length > 1000 ? values[1000] : float.NaN,
                        values.Length > 5000 ? values[5000] : float.NaN,
                        values.Length > 10000 ? values[10000] : float.NaN,
                        values.Length > 15000 ? values[15000] : float.NaN);
                }

                // RhoHV (Correlation Coefficient) - apply scale/offset conversion
                // Formula derived from GRIB2 encoding: (RAW + 740.975) / 18.5
                if (abbrev.Contains("RhoHV") || name.Contains("Correlation Coefficient"))
                {
                    _logger.LogDebug("Processing RhoHV data - applying conversion formula: (value + 740.975) / 18.5");

                    for (int i = 0; i < values.Length; i++)
                    {
                        if (!float.IsNaN(values[i]) && values[i] > -999f)
                        {
                            values[i] = (values[i] + 740.975f) / 18.5f;
                        }
                    }
                }

                _dataCache[cacheKey] = values;
                _metadataCache[cacheKey] = metadata;
            });

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading GRIB2 file");
            return false;
        }
    }

    /// <summary>
    /// Generate a tile for the given z/x/y coordinates
    /// </summary>
    public async Task<byte[]?> GenerateTileAsync(int z, int x, int y, string cacheKey = "default")
    {
        if (!_dataCache.TryGetValue(cacheKey, out var data))
        {
            _logger.LogWarning("No data loaded for cache key: {CacheKey}", cacheKey);
            return null;
        }

        // Get metadata to determine which colormap to use
        _metadataCache.TryGetValue(cacheKey, out var metadata);

        return await Task.Run(() => GenerateTile(z, x, y, data, metadata));
    }

    private byte[] GenerateTile(int z, int x, int y, float[] data, VariableMetadata? metadata)
    {
        // Log the metadata for debugging (only at Debug level to reduce noise)
        if (metadata != null)
        {
            _logger.LogDebug("Generating tile with colormap for: {Abbrev}", metadata.Abbreviation);
        }
        else
        {
            _logger.LogWarning("Generating tile with NO metadata - using default reflectivity colormap");
        }

        // Calculate tile bounds in lat/lon
        var tileBounds = GetTileBounds(z, x, y);

        // Create image
        using var image = new Image<Rgba32>(TILE_SIZE, TILE_SIZE);

        image.Mutate(ctx =>
        {
            // For each pixel in the tile, sample the GRIB data
            for (int py = 0; py < TILE_SIZE; py++)
            {
                for (int px = 0; px < TILE_SIZE; px++)
                {
                    // Calculate lat/lon for this pixel
                    double lon = tileBounds.MinLon + (px / (double)TILE_SIZE) * (tileBounds.MaxLon - tileBounds.MinLon);
                    double lat = tileBounds.MaxLat - (py / (double)TILE_SIZE) * (tileBounds.MaxLat - tileBounds.MinLat);

                    // Get grid coordinates
                    int gridX = (int)Math.Round((lon - MIN_LON) / GRID_RES);
                    int gridY = (int)Math.Round((MAX_LAT - lat) / GRID_RES);

                    // Check bounds
                    if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT)
                    {
                        int dataIndex = gridY * GRID_WIDTH + gridX;
                        if (dataIndex >= 0 && dataIndex < data.Length)
                        {
                            float value = data[dataIndex];

                            // Skip NaN or invalid values
                            if (!float.IsNaN(value) && !float.IsInfinity(value))
                            {
                                // Apply scaling for specific products
                                if (metadata != null)
                                {
                                    // Rotation track values need to be divided by ~1,000,000
                                    if (metadata.Abbreviation == "ROTTRK")
                                    {
                                        value = value / 1000000.0f;
                                    }

                                    // Bright Band products might be in meters, convert to km
                                    // Typical values should be single digits (km), not thousands (m)
                                    if ((metadata.Abbreviation.Contains("BB") || metadata.Name.Contains("Bright Band")) && value > 100)
                                    {
                                        value = value / 1000.0f;  // Convert meters to kilometers
                                    }
                                }

                                // Color the pixel based on value and product type
                                var color = GetColorForValue(value, metadata);
                                image[px, py] = color;
                            }
                        }
                    }
                }
            }
        });

        // Encode to PNG
        using var ms = new MemoryStream();
        image.SaveAsPng(ms);
        return ms.ToArray();
    }

    /// <summary>
    /// Get tile bounds in Web Mercator (EPSG:3857)
    /// </summary>
    private (double MinLon, double MaxLon, double MinLat, double MaxLat) GetTileBounds(int z, int x, int y)
    {
        double n = Math.Pow(2, z);
        double minLon = x / n * 360.0 - 180.0;
        double maxLon = (x + 1) / n * 360.0 - 180.0;

        double minLat = Tile2Lat(y + 1, z);
        double maxLat = Tile2Lat(y, z);

        return (minLon, maxLon, minLat, maxLat);
    }

    private double Tile2Lat(double y, int z)
    {
        double n = Math.Pow(2, z);
        double latRad = Math.Atan(Math.Sinh(Math.PI * (1 - 2 * y / n)));
        return latRad * 180.0 / Math.PI;
    }

    /// <summary>
    /// Color mapping router - selects appropriate colormap based on product type
    /// </summary>
    private Rgba32 GetColorForValue(float value, VariableMetadata? metadata)
    {
        // Determine which colormap to use based on parameter
        if (metadata != null)
        {
            string abbrev = metadata.Abbreviation;
            string name = metadata.Name;

            // Debug logging (disabled by default, only shows if log level is set to Debug)
            // Uncomment the line below only if you need to debug product routing issues:
            // _logger.LogDebug("Product routing: Abbrev='{Abbrev}', Name='{Name}', Discipline={Disc}, Category={Cat}, Number={Num}",
            //     abbrev, name, metadata.Discipline, metadata.Category, metadata.Number);

            // Check by Discipline/Category/Number first (most reliable)
            // MRMS products use Discipline=209

            // VIL: Discipline=209, Category=3, Number=41
            if (metadata.Discipline == 209 && metadata.Category == 3 && metadata.Number == 41)
            {
                return GetColorForVIL(value);
            }

            // VIL Density: Discipline=209, Category=3, Number=42
            if (metadata.Discipline == 209 && metadata.Category == 3 && metadata.Number == 42)
            {
                return GetColorForVILDensity(value);
            }

            // Echo Top products: Discipline=209, Category=3, Numbers=44-47
            if (metadata.Discipline == 209 && metadata.Category == 3 && metadata.Number >= 44 && metadata.Number <= 47)
            {
                return GetColorForEchoTop(value);
            }

            // Seamless HSR Height: Discipline=209, Category=8, Number=9
            if (metadata.Discipline == 209 && metadata.Category == 8 && metadata.Number == 9)
            {
                return GetColorForSHSRH(value);
            }

            // Model 0°C Height: Discipline=209, Category=7, Number=3
            if (metadata.Discipline == 209 && metadata.Category == 7 && metadata.Number == 3)
            {
                return GetColorForSHSRH(value);
            }

            // Seamless HSR (Reflectivity): Discipline=209, Category=8, Number=8
            if (metadata.Discipline == 209 && metadata.Category == 8 && metadata.Number == 8)
            {
                return GetColorForReflectivity(value);
            }

            // Rotation Track: Discipline=209, Category=7, Number=199
            if (metadata.Discipline == 209 && metadata.Category == 7 && metadata.Number == 199)
            {
                return GetColorForRotationTrack(value);
            }

            // QPE products: Discipline=209, Category=6
            if (metadata.Discipline == 209 && metadata.Category == 6)
            {
                // 15-minute: Number=45
                if (metadata.Number == 45)
                {
                    return GetColorForQPE15Min(value);
                }
                // 1-hour: Number=2
                else if (metadata.Number == 2)
                {
                    return GetColorForQPE1H3H(value);
                }
                // 3-hour: Number=3
                else if (metadata.Number == 3)
                {
                    return GetColorForQPE1H3H(value);
                }
                // 6-hour: Number=4
                else if (metadata.Number == 4)
                {
                    return GetColorForQPE6H12H(value);
                }
                // 12-hour: Number=5
                else if (metadata.Number == 5)
                {
                    return GetColorForQPE6H12H(value);
                }
                // 24-hour: Number=6
                else if (metadata.Number == 6)
                {
                    return GetColorForQPE24H(value);
                }
                // 48-hour: Number=7
                else if (metadata.Number == 7)
                {
                    return GetColorForQPE48H(value);
                }
                // 72-hour: Number=8
                else if (metadata.Number == 8)
                {
                    return GetColorForQPE72H(value);
                }
                // Multi-sensor QPE Pass1 and Pass2 products (30-43)
                else if (metadata.Number >= 30 && metadata.Number <= 43)
                {
                    // Route based on name patterns
                    if (name.Contains("01H"))
                        return GetColorForQPE1H3H(value);
                    else if (name.Contains("03H"))
                        return GetColorForQPE1H3H(value);
                    else if (name.Contains("06H"))
                        return GetColorForQPE6H12H(value);
                    else if (name.Contains("12H"))
                        return GetColorForQPE6H12H(value);
                    else if (name.Contains("24H"))
                        return GetColorForQPE24H(value);
                    else if (name.Contains("48H"))
                        return GetColorForQPE48H(value);
                    else if (name.Contains("72H"))
                        return GetColorForQPE72H(value);
                }
                // Precipitation Rate: Number=1
                else if (metadata.Number == 1)
                {
                    return GetColorForPrecipRate(value);
                }
            }

            // POSH colormap
            if (abbrev == "POSH")
            {
                return GetColorForPOSH(value);
            }
            // SHI colormap
            else if (abbrev == "SHI")
            {
                return GetColorForSHI(value);
            }
            // MESH colormap (for all MESH products)
            else if (abbrev == "MESH")
            {
                return GetColorForMESH(value);
            }
            // Lightning uses similar colormap to MESH but with transparency for values < 0
            else if (abbrev == "LTNG")
            {
                return GetColorForLightning(value);
            }
            // VIL products - check exact abbreviation match
            else if (abbrev == "VIL" || abbrev == "VII" || abbrev == "VILMAX")
            {
                return GetColorForVIL(value);
            }
            // VIL Density
            else if (abbrev == "VILD" || (abbrev == "VIL" && name.Contains("Density")))
            {
                return GetColorForVILDensity(value);
            }
            // VIL Max products (legacy check for products with different naming)
            else if (abbrev.StartsWith("VILMAX") || name.Contains("VIL Max") || name.Contains("VIL_Max"))
            {
                return GetColorForVIL(value);
            }
            // Echo Top products (all variants: 18, 30, 50, 60 dBZ)
            else if (abbrev == "RETOP" || abbrev == "ETOP" || abbrev.StartsWith("ECHOTOP"))
            {
                return GetColorForEchoTop(value);
            }
            // Height Composite Reflectivity (uses SHSRH colormap, already in km)
            else if (name.Contains("HeightCompositeReflectivity") || name.Contains("HeightLowLevelCompositeReflectivity") ||
                     name.Contains("Height Composite Reflectivity") || name.Contains("Height Low Level Composite Reflectivity"))
            {
                return GetColorForSHSRH(value); // Data already converted to km during load
            }
            // All Height products use SHSRH colormap
            // Includes: H50Above, H60Above, Bright Band, Seamless HSR Height, Model 0°C Height
            // NOTE: Must explicitly distinguish from Seamless HSR Reflectivity
            else if ((abbrev.StartsWith("H") && abbrev.Contains("Above")) ||
                     abbrev.Contains("BB") || abbrev.Contains("BrightBand") ||
                     abbrev == "HSRH" || abbrev == "SHSRH" ||
                     name == "Seamless Hybrid Scan Reflectivity Height" ||
                     name.Contains("Seamless HSR Height") ||
                     name.Contains("SeamlessHSRHeight") ||
                     name.Contains("Bright Band") || name.Contains("BrightBand") ||
                     name.Contains("0degC Height") || name.Contains("Model_0degC") ||
                     (name.Contains("Height") && (name.Contains("Above") || name.Contains("dBZ"))))
            {
                return GetColorForSHSRH(value);
            }
            // Precipitation Rate (instantaneous)
            else if (abbrev == "PRATE" || abbrev == "PRECRATE" || name.Contains("PrecipRate") || name.Contains("Precip Rate"))
            {
                return GetColorForPrecipRate(value);
            }
            // QPE products - check by name patterns
            else if (name.Contains("QPE") || name.Contains("Precip") && (name.Contains("Hour") || name.Contains("Minute")))
            {
                if (name.Contains("15M") || name.Contains("15-Minute"))
                {
                    return GetColorForQPE15Min(value);
                }
                else if (name.Contains("01H") || name.Contains("1-Hour") || name.Contains("1H"))
                {
                    return GetColorForQPE1H3H(value);
                }
                else if (name.Contains("03H") || name.Contains("3-Hour") || name.Contains("3H"))
                {
                    return GetColorForQPE1H3H(value);
                }
                else if (name.Contains("06H") || name.Contains("6-Hour") || name.Contains("6H"))
                {
                    return GetColorForQPE6H12H(value);
                }
                else if (name.Contains("12H") || name.Contains("12-Hour"))
                {
                    return GetColorForQPE6H12H(value);
                }
                else if (name.Contains("24H") || name.Contains("24-Hour"))
                {
                    return GetColorForQPE24H(value);
                }
                else if (name.Contains("48H") || name.Contains("48-Hour"))
                {
                    return GetColorForQPE48H(value);
                }
                else if (name.Contains("72H") || name.Contains("72-Hour"))
                {
                    return GetColorForQPE72H(value);
                }
            }
            // RQI (Radar Quality Index) products
            else if (abbrev == "RQI" || name.Contains("Radar Quality Index") || name.Contains("RadarQualityIndex"))
            {
                return GetColorForRQI(value);
            }
            // GII (Gauge Influence Index) products
            else if (abbrev == "GII" || name.Contains("Gauge Influence") || name.Contains("GaugeInfluence"))
            {
                return GetColorForGII(value);
            }
            // Zdr (Differential Reflectivity) products
            else if (abbrev == "ZDR" || abbrev.Contains("Zdr") || name.Contains("Differential Reflectivity"))
            {
                return GetColorForZdr(value);
            }
            // RhoHV (Correlation Coefficient) products
            else if (abbrev == "RHOHV" || abbrev == "RHO" || abbrev.Contains("RhoHV") || name.Contains("RhoHV") || name.Contains("Correlation Coefficient"))
            {
                return GetColorForRhoHV(value);
            }
            // Temperature products
            else if (abbrev == "TMP" || abbrev == "TEMP" || name.Contains("Temperature"))
            {
                return GetColorForTemperature(value);
            }
            // Warm Rain Probability
            else if (abbrev == "WRPROB" || name.Contains("Warm Rain") || name.Contains("WarmRain"))
            {
                return GetColorForWarmRainProbability(value);
            }
        }

        // Default to reflectivity colormap
        return GetColorForReflectivity(value);
    }

    /// <summary>
    /// Color mapping for reflectivity values (dBZ)
    /// Based on REFLECTIVITY_NAMES colormap from colormaps.py
    /// </summary>
    private Rgba32 GetColorForReflectivity(float value)
    {
        // Colormap from playground/viewer/colormaps.py REFLECTIVITY_NAMES
        // boundaries = [-30,-25,-20,-15,-10,-5,0,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75]

        // Values below -35 should be transparent
        if (value < -35) return new Rgba32(0, 0, 0, 0);
        if (value < -25) return new Rgba32(220, 255, 255, 200);  // -35 to -25
        if (value < -20) return new Rgba32(210, 180, 210, 200);  // -25 to -20
        if (value < -15) return new Rgba32(160, 130, 200, 200);  // -20 to -15
        if (value < -10) return new Rgba32(115, 70, 120, 200);   // -15 to -10
        if (value < -5) return new Rgba32(210, 210, 200, 200);   // -10 to -5
        if (value < 0) return new Rgba32(200, 200, 120, 200);    // -5 to 0
        if (value < 5) return new Rgba32(120, 120, 120, 200);    // 0 to 5
        if (value < 10) return new Rgba32(0, 240, 240, 220);     // 5 to 10
        if (value < 15) return new Rgba32(1, 160, 240, 220);     // 10 to 15
        if (value < 20) return new Rgba32(0, 0, 240, 230);       // 15 to 20
        if (value < 25) return new Rgba32(0, 255, 0, 230);       // 20 to 25
        if (value < 30) return new Rgba32(0, 200, 0, 230);       // 25 to 30
        if (value < 35) return new Rgba32(0, 140, 0, 240);       // 30 to 35
        if (value < 40) return new Rgba32(255, 255, 0, 240);     // 35 to 40
        if (value < 45) return new Rgba32(230, 190, 0, 240);     // 40 to 45
        if (value < 50) return new Rgba32(255, 140, 0, 250);     // 45 to 50
        if (value < 55) return new Rgba32(255, 0, 0, 250);       // 50 to 55
        if (value < 60) return new Rgba32(220, 0, 0, 250);       // 55 to 60
        if (value < 65) return new Rgba32(190, 0, 0, 250);       // 60 to 65
        if (value < 70) return new Rgba32(255, 0, 255, 255);     // 65 to 70
        if (value < 75) return new Rgba32(150, 85, 200, 255);    // 70 to 75
        return new Rgba32(255, 255, 255, 255);                   // 75+
    }

    /// <summary>
    /// Color mapping for POSH (Probability of Severe Hail) - percentage values 0-100
    /// Based on POSH.png colorbar
    /// </summary>
    private Rgba32 GetColorForPOSH(float value)
    {
        // POSH colorbar: 0-100%
        // Values below 0 should be transparent
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 1) return new Rgba32(0, 0, 0, 0);           // Transparent for near-zero
        if (value <= 10) return new Rgba32(0, 255, 255, 220);   // 0-10: cyan
        if (value <= 20) return new Rgba32(0, 0, 255, 230);     // 10-20: blue
        if (value <= 30) return new Rgba32(0, 128, 0, 230);     // 20-30: green
        if (value <= 40) return new Rgba32(0, 200, 0, 240);     // 30-40: brighter green
        if (value <= 50) return new Rgba32(0, 255, 0, 240);     // 40-50: bright green
        if (value <= 60) return new Rgba32(255, 255, 0, 250);   // 50-60: yellow
        if (value <= 70) return new Rgba32(255, 165, 0, 250);   // 60-70: orange
        if (value <= 80) return new Rgba32(255, 140, 0, 250);   // 70-80: darker orange
        if (value <= 90) return new Rgba32(255, 0, 0, 255);     // 80-90: red
        if (value <= 100) return new Rgba32(255, 0, 0, 255);    // 90-100: red
        return new Rgba32(255, 0, 0, 255);                      // 100+: red
    }

    /// <summary>
    /// Color mapping for SHI (Severe Hail Index) - index values 0-1600+
    /// Based on SHI.png colorbar
    /// </summary>
    private Rgba32 GetColorForSHI(float value)
    {
        // SHI colorbar: 0-1600+ index
        // Values below 0 should be transparent
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 1) return new Rgba32(0, 0, 0, 0);           // Transparent for near-zero
        if (value <= 5) return new Rgba32(0, 255, 255, 220);    // 0-5: cyan
        if (value <= 10) return new Rgba32(0, 128, 255, 220);   // 5-10: light blue
        if (value <= 20) return new Rgba32(0, 0, 255, 230);     // 10-20: blue
        if (value <= 30) return new Rgba32(0, 128, 0, 230);     // 20-30: green
        if (value <= 40) return new Rgba32(0, 200, 0, 240);     // 30-40: brighter green
        if (value <= 50) return new Rgba32(0, 255, 0, 240);     // 40-50: bright green
        if (value <= 60) return new Rgba32(150, 255, 0, 240);   // 50-60: yellow-green
        if (value <= 80) return new Rgba32(255, 255, 0, 250);   // 60-80: yellow
        if (value <= 100) return new Rgba32(255, 165, 0, 250);  // 80-100: orange
        if (value <= 150) return new Rgba32(255, 0, 0, 250);    // 100-150: red
        if (value <= 250) return new Rgba32(220, 0, 0, 255);    // 150-250: dark red
        if (value <= 500) return new Rgba32(255, 0, 255, 255);  // 250-500: magenta
        if (value <= 1500) return new Rgba32(180, 100, 255, 255);  // 500-1500: purple
        return new Rgba32(150, 85, 200, 255);                   // 1500+: dark purple
    }

    /// <summary>
    /// Color mapping for MESH (Maximum Estimated Size of Hail) - mm values 0-100+
    /// Based on MESH.png colorbar
    /// </summary>
    private Rgba32 GetColorForMESH(float value)
    {
        // MESH colorbar: 0-100+ mm
        // Values below 0 should be transparent
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 0.5f) return new Rgba32(0, 0, 0, 0);        // Transparent for near-zero
        if (value < 1) return new Rgba32(0, 240, 240, 220);     // 0-1: cyan
        if (value < 2) return new Rgba32(0, 160, 240, 220);     // 1-2: light blue
        if (value < 4) return new Rgba32(0, 0, 240, 230);       // 2-4: blue
        if (value < 6) return new Rgba32(0, 100, 0, 230);       // 4-6: dark green
        if (value < 8) return new Rgba32(0, 200, 0, 240);       // 6-8: green
        if (value < 12) return new Rgba32(0, 255, 0, 240);      // 8-12: bright green
        if (value < 15) return new Rgba32(150, 255, 0, 240);    // 12-15: yellow-green
        if (value < 20) return new Rgba32(255, 255, 0, 250);    // 15-20: yellow
        if (value < 30) return new Rgba32(255, 200, 0, 250);    // 20-30: orange-yellow
        if (value < 40) return new Rgba32(255, 140, 0, 250);    // 30-40: orange
        if (value < 50) return new Rgba32(255, 0, 0, 255);      // 40-50: red
        if (value < 75) return new Rgba32(220, 0, 100, 255);    // 50-75: pink-red
        if (value < 100) return new Rgba32(255, 0, 255, 255);   // 75-100: magenta
        return new Rgba32(200, 150, 255, 255);                  // 100+: purple
    }

    /// <summary>
    /// Color mapping for Lightning (flashes/km²) - uses same scale as MESH
    /// Values below 0 are transparent
    /// </summary>
    private Rgba32 GetColorForLightning(float value)
    {
        // Lightning colorbar: same as MESH but values < 0 are transparent
        // Values below 0 should be transparent
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid/negative
        if (value < 0.5f) return new Rgba32(0, 0, 0, 0);        // Transparent for near-zero
        if (value < 1) return new Rgba32(0, 240, 240, 220);     // 0-1: cyan
        if (value < 2) return new Rgba32(0, 160, 240, 220);     // 1-2: light blue
        if (value < 4) return new Rgba32(0, 0, 240, 230);       // 2-4: blue
        if (value < 6) return new Rgba32(0, 100, 0, 230);       // 4-6: dark green
        if (value < 8) return new Rgba32(0, 200, 0, 240);       // 6-8: green
        if (value < 12) return new Rgba32(0, 255, 0, 240);      // 8-12: bright green
        if (value < 15) return new Rgba32(150, 255, 0, 240);    // 12-15: yellow-green
        if (value < 20) return new Rgba32(255, 255, 0, 250);    // 15-20: yellow
        if (value < 30) return new Rgba32(255, 200, 0, 250);    // 20-30: orange-yellow
        if (value < 40) return new Rgba32(255, 140, 0, 250);    // 30-40: orange
        if (value < 50) return new Rgba32(255, 0, 0, 255);      // 40-50: red
        if (value < 75) return new Rgba32(220, 0, 100, 255);    // 50-75: pink-red
        if (value < 100) return new Rgba32(255, 0, 255, 255);   // 75-100: magenta
        return new Rgba32(200, 150, 255, 255);                  // 100+: purple
    }

    /// <summary>
    /// Color mapping for Rotation Track (1/sec) - values from 0.000 to 0.020
    /// Based on RotationTracks.png colorbar
    /// Also used for Azimuthal Shear products (low level and mid level)
    /// </summary>
    private Rgba32 GetColorForRotationTrack(float value)
    {
        // Rotation Track colorbar: 0.000-0.020 (1/sec)
        // Values at or below 0 should be transparent
        if (value <= 0) return new Rgba32(0, 0, 0, 0);             // Transparent for zero or invalid
        if (value < 0.003f) return new Rgba32(0, 0, 0, 0);         // Transparent for values < 0.003
        if (value < 0.004f) return new Rgba32(169, 169, 169, 230); // 0.003-0.004: gray
        if (value < 0.005f) return new Rgba32(184, 134, 11, 230);  // 0.004-0.005: dark goldenrod
        if (value < 0.006f) return new Rgba32(184, 134, 11, 240);  // 0.005-0.006: dark goldenrod
        if (value < 0.007f) return new Rgba32(255, 215, 0, 240);   // 0.006-0.007: gold
        if (value < 0.008f) return new Rgba32(255, 215, 0, 240);   // 0.007-0.008: gold
        if (value < 0.009f) return new Rgba32(255, 255, 0, 250);   // 0.008-0.009: yellow
        if (value < 0.010f) return new Rgba32(255, 255, 0, 250);   // 0.009-0.010: yellow
        if (value < 0.011f) return new Rgba32(139, 0, 0, 255);     // 0.010-0.011: dark red
        if (value < 0.012f) return new Rgba32(139, 0, 0, 255);     // 0.011-0.012: dark red
        if (value < 0.013f) return new Rgba32(200, 0, 0, 255);     // 0.012-0.013: red
        if (value < 0.014f) return new Rgba32(200, 0, 0, 255);     // 0.013-0.014: red
        if (value < 0.015f) return new Rgba32(255, 0, 0, 255);     // 0.014-0.015: bright red
        if (value < 0.020f) return new Rgba32(255, 0, 0, 255);     // 0.015-0.020: bright red
        return new Rgba32(0, 255, 255, 255);                       // 0.020+: cyan
    }

    /// <summary>
    /// Color mapping for Echo Top products (km) - values from 0 to 20 km
    /// Based on EchoTop.png colorbar
    /// </summary>
    private Rgba32 GetColorForEchoTop(float value)
    {
        // Echo Top colorbar: 0-20 km
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 2) return new Rgba32(0, 255, 255, 220);     // 0-2: cyan
        if (value < 4) return new Rgba32(0, 128, 255, 230);     // 2-4: light blue
        if (value < 6) return new Rgba32(0, 0, 255, 230);       // 4-6: blue
        if (value < 8) return new Rgba32(0, 255, 0, 240);       // 6-8: green
        if (value < 10) return new Rgba32(255, 255, 0, 240);    // 8-10: yellow
        if (value < 12) return new Rgba32(255, 165, 0, 250);    // 10-12: orange
        if (value < 14) return new Rgba32(255, 0, 0, 250);      // 12-14: red
        if (value < 16) return new Rgba32(200, 0, 0, 255);      // 14-16: dark red
        if (value < 18) return new Rgba32(255, 0, 255, 255);    // 16-18: magenta
        if (value < 20) return new Rgba32(128, 0, 128, 255);    // 18-20: purple
        return new Rgba32(128, 0, 128, 255);                    // 20+: purple
    }

    /// <summary>
    /// Color mapping for VIL (Vertically Integrated Liquid) (kg/m²) - values from 0 to 70 kg/m²
    /// Based on VIL.png colorbar
    /// </summary>
    private Rgba32 GetColorForVIL(float value)
    {
        // VIL colorbar: 0-70+ kg/m²
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 1) return new Rgba32(0, 255, 255, 220);     // 0-1: cyan
        if (value < 2) return new Rgba32(0, 200, 255, 220);     // 1-2: light cyan
        if (value < 3) return new Rgba32(0, 128, 255, 230);     // 2-3: light blue
        if (value < 4) return new Rgba32(0, 0, 255, 230);       // 3-4: blue
        if (value < 5) return new Rgba32(0, 200, 0, 235);       // 4-5: green
        if (value < 6) return new Rgba32(0, 255, 0, 240);       // 5-6: bright green
        if (value < 7) return new Rgba32(150, 255, 0, 240);     // 6-7: yellow-green
        if (value < 8) return new Rgba32(255, 255, 0, 245);     // 7-8: yellow
        if (value < 10) return new Rgba32(255, 200, 0, 245);    // 8-10: orange-yellow
        if (value < 12) return new Rgba32(255, 140, 0, 250);    // 10-12: orange
        if (value < 15) return new Rgba32(255, 0, 0, 250);      // 12-15: red
        if (value < 18) return new Rgba32(200, 0, 0, 255);      // 15-18: dark red
        if (value < 25) return new Rgba32(255, 0, 255, 255);    // 18-25: magenta
        if (value < 30) return new Rgba32(200, 0, 255, 255);    // 25-30: purple-magenta
        if (value < 40) return new Rgba32(150, 150, 150, 255);  // 30-40: gray
        if (value < 50) return new Rgba32(120, 120, 120, 255);  // 40-50: dark gray
        if (value < 60) return new Rgba32(90, 90, 90, 255);     // 50-60: darker gray
        if (value < 70) return new Rgba32(70, 70, 70, 255);     // 60-70: very dark gray
        return new Rgba32(50, 50, 50, 255);                     // 70+: nearly black
    }

    /// <summary>
    /// Color mapping for VIL Density (g/m³) - same colors as VIL but different units
    /// Based on VIL.png colorbar with g/m³ units
    /// </summary>
    private Rgba32 GetColorForVILDensity(float value)
    {
        // VIL Density uses same colorbar as VIL
        return GetColorForVIL(value);
    }

    /// <summary>
    /// Color mapping for Height/Thickness products (km) - values from 0 to 11 km
    /// Based on Thickness.png colorbar
    /// Used for Height of XX dBZ products
    /// </summary>
    private Rgba32 GetColorForThickness(float value)
    {
        // Thickness colorbar: 0-11 km
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 1) return new Rgba32(0, 0, 0, 0);           // Transparent for values < 1
        if (value < 2) return new Rgba32(128, 0, 128, 220);     // 1-2: purple
        if (value < 3) return new Rgba32(150, 100, 150, 220);   // 2-3: light purple
        if (value < 4) return new Rgba32(128, 128, 128, 230);   // 3-4: gray
        if (value < 5) return new Rgba32(0, 255, 255, 230);     // 4-5: cyan
        if (value < 6) return new Rgba32(0, 0, 255, 240);       // 5-6: blue
        if (value < 7) return new Rgba32(0, 255, 0, 240);       // 6-7: green
        if (value < 8) return new Rgba32(255, 255, 0, 245);     // 7-8: yellow
        if (value < 9) return new Rgba32(255, 140, 0, 250);     // 8-9: orange
        if (value < 10) return new Rgba32(255, 0, 0, 250);      // 9-10: red
        if (value < 11) return new Rgba32(200, 0, 0, 255);      // 10-11: dark red
        return new Rgba32(128, 0, 128, 255);                    // 11+: purple
    }

    /// <summary>
    /// Color mapping for Seamless HSR Height and Model 0C Height (km) - values from 0 to 15 km
    /// Based on SHSRH.png colorbar
    /// </summary>
    private Rgba32 GetColorForSHSRH(float value)
    {
        // SHSRH colorbar: 0-15 km
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 0.25f) return new Rgba32(0, 255, 255, 220); // 0-0.25: cyan
        if (value < 0.50f) return new Rgba32(0, 200, 255, 220); // 0.25-0.50: light cyan
        if (value < 0.75f) return new Rgba32(0, 128, 255, 225); // 0.50-0.75: light blue
        if (value < 1.0f) return new Rgba32(0, 0, 255, 230);    // 0.75-1.0: blue
        if (value < 1.5f) return new Rgba32(0, 0, 200, 230);    // 1.0-1.5: dark blue
        if (value < 2.0f) return new Rgba32(0, 150, 0, 235);    // 1.5-2.0: dark green
        if (value < 2.5f) return new Rgba32(0, 200, 0, 235);    // 2.0-2.5: green
        if (value < 3.0f) return new Rgba32(0, 255, 0, 240);    // 2.5-3.0: bright green
        if (value < 4.0f) return new Rgba32(255, 255, 0, 240);  // 3.0-4.0: yellow
        if (value < 5.0f) return new Rgba32(255, 200, 0, 245);  // 4.0-5.0: orange-yellow
        if (value < 6.0f) return new Rgba32(255, 165, 0, 245);  // 5.0-6.0: orange
        if (value < 7.0f) return new Rgba32(255, 100, 0, 250);  // 6.0-7.0: dark orange
        if (value < 8.0f) return new Rgba32(255, 50, 0, 250);   // 7.0-8.0: red-orange
        if (value < 9.0f) return new Rgba32(255, 0, 0, 250);    // 8.0-9.0: red
        if (value < 10.0f) return new Rgba32(200, 0, 0, 255);   // 9.0-10.0: dark red
        if (value < 11.0f) return new Rgba32(200, 0, 0, 255);   // 10.0-11.0: dark red
        if (value < 12.0f) return new Rgba32(255, 0, 255, 255); // 11.0-12.0: magenta
        if (value < 13.0f) return new Rgba32(200, 0, 255, 255); // 12.0-13.0: purple-magenta
        if (value < 14.0f) return new Rgba32(150, 0, 200, 255); // 13.0-14.0: purple
        if (value < 15.0f) return new Rgba32(128, 0, 128, 255); // 14.0-15.0: dark purple
        return new Rgba32(100, 0, 100, 255);                    // 15.0+: darker purple
    }

    /// <summary>
    /// Color mapping for Precipitation Rate (in/hr) - values from 0 to 8 in/hr
    /// Based on Rate.png colorbar
    /// </summary>
    private Rgba32 GetColorForPrecipRate(float value)
    {
        // Precipitation Rate colorbar: 0-8 in/hr
        if (value < 0.01f) return new Rgba32(0, 0, 0, 0);       // Transparent for values < 0.01
        if (value < 0.05f) return new Rgba32(0, 255, 255, 220); // 0.01-0.05: cyan
        if (value < 0.10f) return new Rgba32(0, 200, 255, 220); // 0.05-0.10: light cyan
        if (value < 0.20f) return new Rgba32(0, 128, 255, 230); // 0.10-0.20: light blue
        if (value < 0.40f) return new Rgba32(0, 0, 255, 230);   // 0.20-0.40: blue
        if (value < 0.60f) return new Rgba32(0, 150, 0, 235);   // 0.40-0.60: dark green
        if (value < 0.80f) return new Rgba32(0, 255, 0, 240);   // 0.60-0.80: green
        if (value < 1.00f) return new Rgba32(150, 255, 0, 240); // 0.80-1.00: yellow-green
        if (value < 1.25f) return new Rgba32(200, 255, 0, 240); // 1.00-1.25: lime
        if (value < 1.75f) return new Rgba32(255, 255, 0, 245); // 1.25-1.75: yellow
        if (value < 2.0f) return new Rgba32(255, 200, 0, 245);  // 1.75-2.0: orange-yellow
        if (value < 2.5f) return new Rgba32(255, 165, 0, 250);  // 2.0-2.5: orange
        if (value < 3.0f) return new Rgba32(255, 140, 0, 250);  // 2.5-3.0: dark orange
        if (value < 3.5f) return new Rgba32(255, 100, 0, 250);  // 3.0-3.5: red-orange
        if (value < 4.0f) return new Rgba32(255, 50, 0, 250);   // 3.5-4.0: orange-red
        if (value < 4.5f) return new Rgba32(255, 0, 0, 255);    // 4.0-4.5: red
        if (value < 5.5f) return new Rgba32(220, 0, 0, 255);    // 4.5-5.5: dark red
        if (value < 6.0f) return new Rgba32(180, 0, 0, 255);    // 5.5-6.0: darker red
        if (value < 6.5f) return new Rgba32(150, 0, 0, 255);    // 6.0-6.5: very dark red
        if (value < 7.0f) return new Rgba32(255, 0, 255, 255);  // 6.5-7.0: magenta
        if (value < 8.0f) return new Rgba32(200, 0, 255, 255);  // 7.0-8.0: purple
        return new Rgba32(128, 0, 128, 255);                    // 8.0+: dark purple
    }

    /// <summary>
    /// Color mapping for QPE 15-minute accumulation (in) - values from 0 to 8 in
    /// Based on 15min.png colorbar
    /// </summary>
    private Rgba32 GetColorForQPE15Min(float value)
    {
        // QPE 15-minute colorbar: 0-8 in
        if (value < 0.01f) return new Rgba32(0, 0, 0, 0);       // Transparent for values < 0.01
        if (value < 0.05f) return new Rgba32(0, 255, 255, 220); // 0.01-0.05: cyan
        if (value < 0.10f) return new Rgba32(0, 200, 255, 220); // 0.05-0.10: light cyan
        if (value < 0.20f) return new Rgba32(0, 128, 255, 230); // 0.10-0.20: light blue
        if (value < 0.40f) return new Rgba32(0, 0, 255, 230);   // 0.20-0.40: blue
        if (value < 0.60f) return new Rgba32(0, 150, 0, 235);   // 0.40-0.60: dark green
        if (value < 0.80f) return new Rgba32(0, 200, 0, 235);   // 0.60-0.80: green
        if (value < 1.00f) return new Rgba32(0, 255, 0, 240);   // 0.80-1.00: bright green
        if (value < 1.25f) return new Rgba32(150, 255, 0, 240); // 1.00-1.25: yellow-green
        if (value < 1.75f) return new Rgba32(255, 255, 0, 245); // 1.25-1.75: yellow
        if (value < 2.0f) return new Rgba32(255, 200, 0, 245);  // 1.75-2.0: orange-yellow
        if (value < 3.0f) return new Rgba32(255, 165, 0, 250);  // 2.0-3.0: orange
        if (value < 4.0f) return new Rgba32(255, 100, 0, 250);  // 3.0-4.0: dark orange
        if (value < 4.5f) return new Rgba32(255, 50, 0, 250);   // 4.0-4.5: red-orange
        if (value < 5.0f) return new Rgba32(255, 0, 0, 255);    // 4.5-5.0: red
        if (value < 5.5f) return new Rgba32(220, 0, 0, 255);    // 5.0-5.5: dark red
        if (value < 6.0f) return new Rgba32(180, 0, 0, 255);    // 5.5-6.0: darker red
        if (value < 6.5f) return new Rgba32(255, 0, 255, 255);  // 6.0-6.5: magenta
        if (value < 7.0f) return new Rgba32(200, 0, 255, 255);  // 6.5-7.0: purple
        if (value < 8.0f) return new Rgba32(150, 100, 200, 255);// 7.0-8.0: light purple
        return new Rgba32(255, 255, 200, 255);                  // 8.0+: light yellow
    }

    /// <summary>
    /// Color mapping for QPE 1-hour and 3-hour accumulation (in) - same as 15-minute
    /// Based on Rate.png and 15min.png colorbars (they appear similar)
    /// </summary>
    private Rgba32 GetColorForQPE1H3H(float value)
    {
        // Use same colorbar as 15-minute
        return GetColorForQPE15Min(value);
    }

    /// <summary>
    /// Color mapping for QPE 6-hour and 12-hour accumulation (in) - values from 0 to 16 in
    /// Based on 6hr.png colorbar
    /// </summary>
    private Rgba32 GetColorForQPE6H12H(float value)
    {
        // QPE 6/12-hour colorbar: 0-16 in
        if (value < 0.01f) return new Rgba32(0, 0, 0, 0);       // Transparent for values < 0.01
        if (value < 0.05f) return new Rgba32(0, 255, 255, 220); // 0.01-0.05: cyan
        if (value < 0.20f) return new Rgba32(0, 200, 255, 220); // 0.05-0.20: light cyan
        if (value < 0.40f) return new Rgba32(0, 128, 255, 230); // 0.20-0.40: light blue
        if (value < 0.60f) return new Rgba32(0, 0, 255, 230);   // 0.40-0.60: blue
        if (value < 0.80f) return new Rgba32(0, 150, 0, 235);   // 0.60-0.80: dark green
        if (value < 1.00f) return new Rgba32(0, 200, 0, 235);   // 0.80-1.00: green
        if (value < 1.25f) return new Rgba32(0, 255, 0, 240);   // 1.00-1.25: bright green
        if (value < 1.50f) return new Rgba32(150, 255, 0, 240); // 1.25-1.50: yellow-green
        if (value < 2.0f) return new Rgba32(200, 255, 0, 240);  // 1.50-2.0: lime
        if (value < 2.5f) return new Rgba32(255, 255, 0, 245);  // 2.0-2.5: yellow
        if (value < 3.0f) return new Rgba32(255, 200, 0, 245);  // 2.5-3.0: orange-yellow
        if (value < 3.5f) return new Rgba32(255, 165, 0, 250);  // 3.0-3.5: orange
        if (value < 4.0f) return new Rgba32(255, 140, 0, 250);  // 3.5-4.0: dark orange
        if (value < 5.0f) return new Rgba32(255, 100, 0, 250);  // 4.0-5.0: red-orange
        if (value < 6.0f) return new Rgba32(255, 50, 0, 250);   // 5.0-6.0: orange-red
        if (value < 7.0f) return new Rgba32(255, 0, 0, 255);    // 6.0-7.0: red
        if (value < 8.0f) return new Rgba32(200, 0, 0, 255);    // 7.0-8.0: dark red
        if (value < 9.0f) return new Rgba32(180, 0, 0, 255);    // 8.0-9.0: darker red
        if (value < 10.0f) return new Rgba32(255, 0, 255, 255); // 9.0-10.0: magenta
        if (value < 12.0f) return new Rgba32(200, 0, 255, 255); // 10.0-12.0: purple
        if (value < 14.0f) return new Rgba32(150, 100, 200, 255);// 12.0-14.0: light purple
        if (value < 16.0f) return new Rgba32(255, 255, 200, 255);// 14.0-16.0: light yellow
        return new Rgba32(255, 255, 200, 255);                  // 16.0+: light yellow
    }

    /// <summary>
    /// Color mapping for QPE 24-hour accumulation (in) - values from 0 to 24 in
    /// Based on 24hr.png colorbar
    /// </summary>
    private Rgba32 GetColorForQPE24H(float value)
    {
        // QPE 24-hour colorbar: 0-24 in
        if (value < 0.01f) return new Rgba32(0, 0, 0, 0);       // Transparent for values < 0.01
        if (value < 0.05f) return new Rgba32(0, 255, 255, 220); // 0.01-0.05: cyan
        if (value < 0.10f) return new Rgba32(0, 200, 255, 220); // 0.05-0.10: light cyan
        if (value < 0.30f) return new Rgba32(0, 128, 255, 230); // 0.10-0.30: light blue
        if (value < 0.75f) return new Rgba32(0, 0, 255, 230);   // 0.30-0.75: blue
        if (value < 1.0f) return new Rgba32(0, 150, 0, 235);    // 0.75-1.0: dark green
        if (value < 1.5f) return new Rgba32(0, 200, 0, 235);    // 1.0-1.5: green
        if (value < 2.0f) return new Rgba32(0, 255, 0, 240);    // 1.5-2.0: bright green
        if (value < 2.5f) return new Rgba32(150, 255, 0, 240);  // 2.0-2.5: yellow-green
        if (value < 3.0f) return new Rgba32(200, 255, 0, 240);  // 2.5-3.0: lime
        if (value < 4.0f) return new Rgba32(255, 255, 0, 245);  // 3.0-4.0: yellow
        if (value < 5.0f) return new Rgba32(255, 200, 0, 245);  // 4.0-5.0: orange-yellow
        if (value < 6.0f) return new Rgba32(255, 165, 0, 250);  // 5.0-6.0: orange
        if (value < 7.0f) return new Rgba32(255, 140, 0, 250);  // 6.0-7.0: dark orange
        if (value < 8.0f) return new Rgba32(255, 100, 0, 250);  // 7.0-8.0: red-orange
        if (value < 9.0f) return new Rgba32(255, 50, 0, 250);   // 8.0-9.0: orange-red
        if (value < 10.0f) return new Rgba32(255, 0, 0, 255);   // 9.0-10.0: red
        if (value < 12.0f) return new Rgba32(220, 0, 0, 255);   // 10.0-12.0: dark red
        if (value < 14.0f) return new Rgba32(180, 0, 0, 255);   // 12.0-14.0: darker red
        if (value < 16.0f) return new Rgba32(255, 0, 255, 255); // 14.0-16.0: magenta
        if (value < 18.0f) return new Rgba32(200, 0, 255, 255); // 16.0-18.0: purple
        if (value < 20.0f) return new Rgba32(150, 100, 200, 255);// 18.0-20.0: light purple
        if (value < 24.0f) return new Rgba32(255, 255, 200, 255);// 20.0-24.0: light yellow
        return new Rgba32(255, 255, 200, 255);                  // 24.0+: light yellow
    }

    /// <summary>
    /// Color mapping for QPE 48-hour accumulation (in) - values from 0 to 32 in
    /// Based on 48hr.png colorbar
    /// </summary>
    private Rgba32 GetColorForQPE48H(float value)
    {
        // QPE 48-hour colorbar: 0-32 in
        if (value < 0.01f) return new Rgba32(0, 0, 0, 0);       // Transparent for values < 0.01
        if (value < 0.10f) return new Rgba32(0, 255, 255, 220); // 0.01-0.10: cyan
        if (value < 0.25f) return new Rgba32(0, 200, 255, 220); // 0.10-0.25: light cyan
        if (value < 0.50f) return new Rgba32(0, 128, 255, 230); // 0.25-0.50: light blue
        if (value < 0.75f) return new Rgba32(0, 0, 255, 230);   // 0.50-0.75: blue
        if (value < 1.0f) return new Rgba32(0, 150, 0, 235);    // 0.75-1.0: dark green
        if (value < 1.5f) return new Rgba32(0, 200, 0, 235);    // 1.0-1.5: green
        if (value < 2.0f) return new Rgba32(0, 255, 0, 240);    // 1.5-2.0: bright green
        if (value < 2.5f) return new Rgba32(150, 255, 0, 240);  // 2.0-2.5: yellow-green
        if (value < 3.0f) return new Rgba32(200, 255, 0, 240);  // 2.5-3.0: lime
        if (value < 4.0f) return new Rgba32(255, 255, 0, 245);  // 3.0-4.0: yellow
        if (value < 5.0f) return new Rgba32(255, 200, 0, 245);  // 4.0-5.0: orange-yellow
        if (value < 6.0f) return new Rgba32(255, 165, 0, 250);  // 5.0-6.0: orange
        if (value < 7.0f) return new Rgba32(255, 140, 0, 250);  // 6.0-7.0: dark orange
        if (value < 8.0f) return new Rgba32(255, 100, 0, 250);  // 7.0-8.0: red-orange
        if (value < 10.0f) return new Rgba32(255, 50, 0, 250);  // 8.0-10.0: orange-red
        if (value < 12.0f) return new Rgba32(255, 0, 0, 255);   // 10.0-12.0: red
        if (value < 14.0f) return new Rgba32(220, 0, 0, 255);   // 12.0-14.0: dark red
        if (value < 16.0f) return new Rgba32(180, 0, 0, 255);   // 14.0-16.0: darker red
        if (value < 18.0f) return new Rgba32(255, 0, 255, 255); // 16.0-18.0: magenta
        if (value < 20.0f) return new Rgba32(200, 0, 255, 255); // 18.0-20.0: purple
        if (value < 24.0f) return new Rgba32(150, 100, 200, 255);// 20.0-24.0: light purple
        if (value < 28.0f) return new Rgba32(255, 255, 200, 255);// 24.0-28.0: light yellow
        if (value < 32.0f) return new Rgba32(255, 255, 150, 255);// 28.0-32.0: pale yellow
        return new Rgba32(255, 255, 100, 255);                  // 32.0+: very pale yellow
    }

    /// <summary>
    /// Color mapping for QPE 72-hour accumulation (in) - values from 0 to 40 in
    /// Based on 72hr.png colorbar
    /// </summary>
    private Rgba32 GetColorForQPE72H(float value)
    {
        // QPE 72-hour colorbar: 0-40 in
        if (value < 0.01f) return new Rgba32(0, 0, 0, 0);       // Transparent for values < 0.01
        if (value < 0.10f) return new Rgba32(0, 255, 255, 220); // 0.01-0.10: cyan
        if (value < 0.25f) return new Rgba32(0, 200, 255, 220); // 0.10-0.25: light cyan
        if (value < 0.50f) return new Rgba32(0, 128, 255, 230); // 0.25-0.50: light blue
        if (value < 1.0f) return new Rgba32(0, 0, 255, 230);    // 0.50-1.0: blue
        if (value < 1.5f) return new Rgba32(0, 150, 0, 235);    // 1.0-1.5: dark green
        if (value < 2.0f) return new Rgba32(0, 200, 0, 235);    // 1.5-2.0: green
        if (value < 3.0f) return new Rgba32(0, 255, 0, 240);    // 2.0-3.0: bright green
        if (value < 4.0f) return new Rgba32(150, 255, 0, 240);  // 3.0-4.0: yellow-green
        if (value < 5.0f) return new Rgba32(200, 255, 0, 240);  // 4.0-5.0: lime
        if (value < 6.0f) return new Rgba32(255, 255, 0, 245);  // 5.0-6.0: yellow
        if (value < 7.0f) return new Rgba32(255, 200, 0, 245);  // 6.0-7.0: orange-yellow
        if (value < 8.0f) return new Rgba32(255, 165, 0, 250);  // 7.0-8.0: orange
        if (value < 10.0f) return new Rgba32(255, 140, 0, 250); // 8.0-10.0: dark orange
        if (value < 12.0f) return new Rgba32(255, 100, 0, 250); // 10.0-12.0: red-orange
        if (value < 14.0f) return new Rgba32(255, 50, 0, 250);  // 12.0-14.0: orange-red
        if (value < 16.0f) return new Rgba32(255, 0, 0, 255);   // 14.0-16.0: red
        if (value < 18.0f) return new Rgba32(220, 0, 0, 255);   // 16.0-18.0: dark red
        if (value < 20.0f) return new Rgba32(180, 0, 0, 255);   // 18.0-20.0: darker red
        if (value < 24.0f) return new Rgba32(255, 0, 255, 255); // 20.0-24.0: magenta
        if (value < 28.0f) return new Rgba32(200, 0, 255, 255); // 24.0-28.0: purple
        if (value < 32.0f) return new Rgba32(150, 100, 200, 255);// 28.0-32.0: light purple
        if (value < 36.0f) return new Rgba32(255, 255, 200, 255);// 32.0-36.0: light yellow
        if (value < 40.0f) return new Rgba32(255, 255, 150, 255);// 36.0-40.0: pale yellow
        return new Rgba32(255, 255, 100, 255);                  // 40.0+: very pale yellow
    }

    /// <summary>
    /// Color mapping for RQI (Radar Quality Index) (%) - values from 0 to 100%
    /// Based on rqi.png colorbar
    /// </summary>
    private Rgba32 GetColorForRQI(float value)
    {
        // RQI colorbar: 0-100
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 5) return new Rgba32(120, 120, 120);        // 0-5: gray
        if (value < 10) return new Rgba32(0, 240, 240);         // 5-10: cyan
        if (value < 15) return new Rgba32(1, 160, 240);         // 10-15: light blue
        if (value < 20) return new Rgba32(0, 0, 240);           // 15-20: blue
        if (value < 30) return new Rgba32(0, 255, 0);           // 20-30: green
        if (value < 40) return new Rgba32(0, 200, 0);           // 30-40: dark green
        if (value < 50) return new Rgba32(0, 140, 0);           // 40-50: darker green
        if (value < 60) return new Rgba32(255, 255, 0);         // 50-60: yellow
        if (value < 70) return new Rgba32(230, 190, 0);         // 60-70: gold
        if (value < 75) return new Rgba32(255, 140, 0);         // 70-75: orange
        if (value < 80) return new Rgba32(255, 0, 0);           // 75-80: red
        if (value < 85) return new Rgba32(220, 0, 0);           // 80-85: dark red
        if (value < 90) return new Rgba32(190, 0, 0);           // 85-90: darker red
        if (value < 95) return new Rgba32(255, 0, 255);         // 90-95: magenta
        if (value < 100) return new Rgba32(150, 85, 200);       // 95-100: purple
        return new Rgba32(50, 50, 50);                          // 100: dark gray
    }

    /// <summary>
    /// Color mapping for GII (Gauge Influence Index) (fraction 0-1)
    /// Based on gii.png colorbar - same as existing GII_NAMES in colormaps.py
    /// </summary>
    private Rgba32 GetColorForGII(float value)
    {
        // GII colorbar: 0.0-1.0 fraction
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 0.1f) return new Rgba32(0, 255, 255, 220);  // 0.0-0.1: cyan
        if (value < 0.2f) return new Rgba32(0, 128, 255, 230);  // 0.1-0.2: light blue
        if (value < 0.3f) return new Rgba32(0, 0, 255, 230);    // 0.2-0.3: blue
        if (value < 0.4f) return new Rgba32(0, 200, 0, 235);    // 0.3-0.4: green
        if (value < 0.5f) return new Rgba32(0, 255, 0, 240);    // 0.4-0.5: bright green
        if (value < 0.6f) return new Rgba32(255, 255, 0, 245);  // 0.5-0.6: yellow
        if (value < 0.7f) return new Rgba32(255, 165, 0, 250);  // 0.6-0.7: orange
        if (value < 0.8f) return new Rgba32(255, 100, 0, 250);  // 0.7-0.8: dark orange
        if (value < 0.9f) return new Rgba32(255, 0, 0, 250);    // 0.8-0.9: red
        if (value < 1.0f) return new Rgba32(200, 0, 0, 255);    // 0.9-1.0: dark red
        return new Rgba32(255, 0, 255, 255);                    // 1.0: magenta
    }

    /// <summary>
    /// Color mapping for RhoHV/Correlation Coefficient - values from 0.20 to 3.00
    /// Based on Rho.png colorbar - matches RHOHV_NAMES in colormaps.py
    /// </summary>
    private Rgba32 GetColorForRhoHV(float value)
    {
        // RhoHV colorbar: 0.20-1.05 (matches existing RHOHV_NAMES)
        if (value < 0.20f) return new Rgba32(0, 0, 0, 0);       // Transparent for values < 0.20
        if (value < 0.45f) return new Rgba32(150, 150, 160, 220);// 0.20-0.45: gray
        if (value < 0.65f) return new Rgba32(20, 20, 140, 230); // 0.45-0.65: dark blue
        if (value < 0.75f) return new Rgba32(10, 0, 230, 235);  // 0.65-0.75: blue
        if (value < 0.80f) return new Rgba32(50, 220, 255, 235);// 0.75-0.80: cyan
        if (value < 0.85f) return new Rgba32(90, 255, 90, 240); // 0.80-0.85: green
        if (value < 0.90f) return new Rgba32(140, 210, 0, 245); // 0.85-0.90: yellow-green
        if (value < 0.93f) return new Rgba32(255, 250, 0, 245); // 0.90-0.93: yellow
        if (value < 0.95f) return new Rgba32(255, 200, 0, 250); // 0.93-0.95: orange
        if (value < 0.96f) return new Rgba32(255, 140, 0, 250); // 0.95-0.96: dark orange
        if (value < 0.97f) return new Rgba32(255, 40, 0, 250);  // 0.96-0.97: red-orange
        if (value < 0.98f) return new Rgba32(230, 0, 0, 255);   // 0.97-0.98: red
        if (value < 0.99f) return new Rgba32(160, 0, 0, 255);   // 0.98-0.99: dark red
        if (value < 1.00f) return new Rgba32(120, 0, 90, 255);  // 0.99-1.00: purple
        return new Rgba32(250, 200, 200, 255);                  // 1.00+: light pink
    }

    /// <summary>
    /// Color mapping for Zdr (Differential Reflectivity) - values from -2.0 to 20.0 dB
    /// Based on zdr.png colorbar
    /// </summary>
    private Rgba32 GetColorForZdr(float value)
    {
        // Zdr colorbar: -2.0 to 20.0 dB
        if (value < -2.0f) return new Rgba32(0, 0, 0, 0);        // Transparent for values < -2
        if (value < -0.5f) return new Rgba32(128, 128, 128, 220);// -2.0 to -0.5: gray
        if (value < 0.0f) return new Rgba32(160, 120, 180, 230); // -0.5 to 0.0: light purple
        if (value < 0.3f) return new Rgba32(120, 80, 200, 235);  // 0.0 to 0.3: purple
        if (value < 0.6f) return new Rgba32(60, 60, 240, 240);   // 0.3 to 0.6: blue
        if (value < 1.0f) return new Rgba32(0, 180, 255, 240);   // 0.6 to 1.0: cyan
        if (value < 1.5f) return new Rgba32(0, 240, 240, 245);   // 1.0 to 1.5: light cyan
        if (value < 2.0f) return new Rgba32(0, 255, 0, 245);     // 1.5 to 2.0: green
        if (value < 2.5f) return new Rgba32(150, 255, 0, 245);   // 2.0 to 2.5: yellow-green
        if (value < 3.0f) return new Rgba32(255, 255, 0, 250);   // 2.5 to 3.0: yellow
        if (value < 4.0f) return new Rgba32(255, 200, 0, 250);   // 3.0 to 4.0: yellow-orange
        if (value < 5.0f) return new Rgba32(255, 140, 0, 250);   // 4.0 to 5.0: orange
        if (value < 6.0f) return new Rgba32(255, 80, 0, 255);    // 5.0 to 6.0: red-orange
        if (value < 8.0f) return new Rgba32(255, 0, 0, 255);     // 6.0 to 8.0: red
        if (value < 20.0f) return new Rgba32(200, 0, 100, 255);  // 8.0 to 20.0: magenta
        return new Rgba32(255, 0, 255, 255);                     // 20.0+: bright magenta
    }

    /// <summary>
    /// Color mapping for Temperature (°C) - values from -36 to 45°C
    /// Based on t.png colorbar
    /// </summary>
    private Rgba32 GetColorForTemperature(float value)
    {
        // Temperature colorbar: -36 to 45°C
        if (value < -36) return new Rgba32(0, 0, 50, 230);      // < -36: very dark blue
        if (value < -27) return new Rgba32(0, 0, 100, 230);     // -36 to -27: dark blue
        if (value < -18) return new Rgba32(0, 0, 180, 235);     // -27 to -18: blue
        if (value < -9) return new Rgba32(0, 128, 255, 240);    // -18 to -9: light blue
        if (value < 0) return new Rgba32(0, 200, 255, 240);     // -9 to 0: cyan
        if (value < 9) return new Rgba32(200, 200, 200, 240);   // 0 to 9: light gray
        if (value < 18) return new Rgba32(255, 200, 150, 245);  // 9 to 18: light orange
        if (value < 27) return new Rgba32(255, 100, 50, 250);   // 18 to 27: orange-red
        if (value < 36) return new Rgba32(200, 0, 0, 250);      // 27 to 36: red
        if (value < 45) return new Rgba32(100, 0, 0, 255);      // 36 to 45: dark red
        return new Rgba32(50, 0, 0, 255);                       // 45+: very dark red
    }

    /// <summary>
    /// Color mapping for Warm Rain Probability (%) - values from 0 to 100%
    /// Based on trop.png colorbar
    /// </summary>
    private Rgba32 GetColorForWarmRainProbability(float value)
    {
        // Warm Rain Probability colorbar: 0-100%
        if (value < 0) return new Rgba32(0, 0, 0, 0);           // Transparent for invalid
        if (value < 10) return new Rgba32(0, 255, 255, 220);    // 0-10: cyan
        if (value < 20) return new Rgba32(0, 200, 255, 225);    // 10-20: light cyan
        if (value < 30) return new Rgba32(0, 128, 255, 230);    // 20-30: light blue
        if (value < 40) return new Rgba32(0, 0, 255, 235);      // 30-40: blue
        if (value < 50) return new Rgba32(0, 200, 0, 240);      // 40-50: green
        if (value < 60) return new Rgba32(0, 255, 0, 240);      // 50-60: bright green
        if (value < 70) return new Rgba32(255, 255, 0, 245);    // 60-70: yellow
        if (value < 80) return new Rgba32(255, 200, 0, 250);    // 70-80: orange-yellow
        if (value < 90) return new Rgba32(255, 140, 0, 250);    // 80-90: orange
        if (value < 100) return new Rgba32(255, 0, 0, 255);     // 90-100: red
        return new Rgba32(200, 0, 0, 255);                      // 100: dark red
    }

    /// <summary>
    /// Get variable metadata for a cached dataset
    /// </summary>
    public VariableMetadata? GetVariableMetadata(string cacheKey = "default")
    {
        return _metadataCache.TryGetValue(cacheKey, out var metadata) ? metadata : null;
    }

    /// <summary>
    /// Clear cached data
    /// </summary>
    public void ClearCache(string? cacheKey = null)
    {
        if (cacheKey == null)
        {
            _dataCache.Clear();
            _metadataCache.Clear();
            _logger.LogInformation("Cleared all cached data");
        }
        else
        {
            _dataCache.TryRemove(cacheKey, out _);
            _metadataCache.TryRemove(cacheKey, out _);
            _logger.LogInformation("Cleared cache key: {CacheKey}", cacheKey);
        }
    }

    /// <summary>
    /// Get cache statistics
    /// </summary>
    public Dictionary<string, int> GetCacheStats()
    {
        return _dataCache.ToDictionary(
            kvp => kvp.Key,
            kvp => kvp.Value.Length
        );
    }

    /// <summary>
    /// Get the data value at a specific latitude/longitude coordinate
    /// </summary>
    public float? GetValueAtCoordinate(double lat, double lon, string cacheKey)
    {
        if (!_dataCache.TryGetValue(cacheKey, out var data))
        {
            _logger.LogWarning("No data found for cache key: {CacheKey}", cacheKey);
            return null;
        }

        // Check if coordinate is within grid bounds
        if (lat < MIN_LAT || lat > MAX_LAT || lon < MIN_LON || lon > MAX_LON)
        {
            return null;
        }

        // Convert lat/lon to grid coordinates
        // MRMS grid starts at northwest corner (MIN_LON, MAX_LAT)
        int gridX = (int)((lon - MIN_LON) / GRID_RES);
        int gridY = (int)((MAX_LAT - lat) / GRID_RES);

        // Validate grid coordinates
        if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT)
        {
            return null;
        }

        // Get value from data array
        int index = gridY * GRID_WIDTH + gridX;
        if (index < 0 || index >= data.Length)
        {
            return null;
        }

        float value = data[index];

        // Check for no-data values
        if (float.IsNaN(value) || value < -999f)
        {
            return null;
        }

        // Data is already converted to km during load for Height Composite Reflectivity products
        return value;
    }
}
