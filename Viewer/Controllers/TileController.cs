using Microsoft.AspNetCore.Mvc;
using Viewer.DataSources.Mrms;

namespace Viewer.Controllers;

[ApiController]
[Route("api/tiles")]
public class TileController : ControllerBase
{
    private readonly MrmsTileGenerator _mrmsTileGenerator;
    private readonly ILogger<TileController> _logger;

    public TileController(MrmsTileGenerator mrmsTileGenerator, ILogger<TileController> logger)
    {
        _mrmsTileGenerator = mrmsTileGenerator;
        _logger = logger;
    }

    /// <summary>
    /// Get a map tile at the specified z/x/y coordinates
    /// Standard XYZ tile format: /tiles/{z}/{x}/{y}.png
    /// </summary>
    [HttpGet("{z}/{x}/{y}.png")]
    public async Task<IActionResult> GetTile(int z, int x, int y, [FromQuery] string? dataset = "default")
    {
        try
        {
            // Validate tile coordinates
            if (z < 0 || z > 20)
            {
                return BadRequest("Invalid zoom level");
            }

            int maxTileIndex = (int)Math.Pow(2, z) - 1;
            if (x < 0 || x > maxTileIndex || y < 0 || y > maxTileIndex)
            {
                return BadRequest("Invalid tile coordinates");
            }

            // Generate tile
            byte[]? tileData = await _mrmsTileGenerator.GenerateTileAsync(z, x, y, dataset ?? "default");

            if (tileData == null)
            {
                // Return empty transparent tile instead of 404
                return File(CreateEmptyTile(), "image/png");
            }

            // Cache the tile for 5 minutes
            Response.Headers.Append("Cache-Control", "public, max-age=300");

            return File(tileData, "image/png");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating tile {Z}/{X}/{Y}", z, x, y);
            return StatusCode(500, "Error generating tile");
        }
    }

    /// <summary>
    /// Load a GRIB2 file into the cache
    /// </summary>
    [HttpPost("load")]
    public async Task<IActionResult> LoadData([FromQuery] string filePath, [FromQuery] string? cacheKey = "default")
    {
        if (string.IsNullOrEmpty(filePath))
        {
            return BadRequest("File path is required");
        }

        _logger.LogInformation("Received file path: '{Path}'", filePath);
        _logger.LogInformation("File exists check: {Exists}", System.IO.File.Exists(filePath));

        if (!System.IO.File.Exists(filePath))
        {
            // Log the current working directory for debugging
            _logger.LogWarning("File not found: '{Path}'. Current directory: '{CurrentDir}'", filePath, Directory.GetCurrentDirectory());
            return NotFound($"File not found: {filePath}");
        }

        try
        {
            var success = await _mrmsTileGenerator.LoadGribDataAsync(filePath, cacheKey ?? "default");

            if (success)
            {
                return Ok(new { message = "Data loaded successfully", cacheKey = cacheKey ?? "default" });
            }

            return StatusCode(500, "Failed to load data");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading GRIB file: {Path}", filePath);
            return StatusCode(500, $"Error loading file: {ex.Message}");
        }
    }

    /// <summary>
    /// Get variable metadata for a cached dataset
    /// </summary>
    [HttpGet("metadata")]
    public IActionResult GetMetadata([FromQuery] string? cacheKey = "default")
    {
        var metadata = _mrmsTileGenerator.GetVariableMetadata(cacheKey ?? "default");

        if (metadata == null)
        {
            return NotFound($"No metadata found for cache key: {cacheKey ?? "default"}");
        }

        return Ok(metadata);
    }

    /// <summary>
    /// Get cache statistics
    /// </summary>
    [HttpGet("cache/stats")]
    public IActionResult GetCacheStats()
    {
        var stats = _mrmsTileGenerator.GetCacheStats();
        return Ok(stats);
    }

    /// <summary>
    /// Clear cache
    /// </summary>
    [HttpDelete("cache")]
    public IActionResult ClearCache([FromQuery] string? cacheKey = null)
    {
        _mrmsTileGenerator.ClearCache(cacheKey);
        return Ok(new { message = "Cache cleared" });
    }

    /// <summary>
    /// Download GRIB2 file from AWS S3, decompress, and load into cache
    /// </summary>
    [HttpPost("download-s3")]
    public async Task<IActionResult> DownloadFromS3(
        [FromQuery] string product,
        [FromQuery] string date,
        [FromQuery] string time,
        [FromQuery] string? cacheKey = "default")
    {
        if (string.IsNullOrEmpty(product) || string.IsNullOrEmpty(date) || string.IsNullOrEmpty(time))
        {
            return BadRequest("Product, date, and time are required");
        }

        try
        {
            _logger.LogDebug("Downloading from S3: Product={Product}, Date={Date}, Time={Time}", product, date, time);

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromMinutes(5);

            // Build S3 URL for requested time
            var fileName = $"MRMS_{product}_{date}-{time}.grib2.gz";
            var s3Url = $"https://noaa-mrms-pds.s3.amazonaws.com/CONUS/{product}/{date}/{fileName}";

            _logger.LogInformation("S3 URL: {Url}", s3Url);

            // Try to download the exact file first
            var response = await httpClient.GetAsync(s3Url);
            string actualTime = time;
            string actualFileName = fileName;
            string actualUrl = s3Url;

            // If exact file not found, search for closest match
            if (!response.IsSuccessStatusCode && response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                _logger.LogInformation("Exact file not found. Searching for closest available time...");

                // List files in the S3 directory (using XML API)
                var listUrl = $"https://noaa-mrms-pds.s3.amazonaws.com?list-type=2&prefix=CONUS/{product}/{date}/&delimiter=/";
                var listResponse = await httpClient.GetAsync(listUrl);

                if (!listResponse.IsSuccessStatusCode)
                {
                    return StatusCode((int)listResponse.StatusCode, $"Failed to list S3 directory: {listResponse.StatusCode}");
                }

                var xmlContent = await listResponse.Content.ReadAsStringAsync();

                // Parse XML to extract file names and find closest time
                var closestFile = FindClosestFile(xmlContent, product, date, time);

                if (closestFile == null)
                {
                    return NotFound($"No files found for product {product} on date {date}");
                }

                actualFileName = closestFile;
                actualTime = ExtractTimeFromFileName(closestFile);
                actualUrl = $"https://noaa-mrms-pds.s3.amazonaws.com/CONUS/{product}/{date}/{actualFileName}";

                _logger.LogInformation("Found closest file: {FileName} (requested: {RequestedTime}, actual: {ActualTime})",
                    actualFileName, time, actualTime);

                // Download the closest file
                response = await httpClient.GetAsync(actualUrl);
                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode, $"Failed to download closest match: {response.StatusCode}");
                }
            }

            // Create temp directory for downloads
            var tempDir = Path.Combine(Path.GetTempPath(), "mrms_downloads");
            Directory.CreateDirectory(tempDir);

            var gzFilePath = Path.Combine(tempDir, actualFileName);
            var gribFilePath = Path.Combine(tempDir, actualFileName.Replace(".gz", ""));

            // Save compressed file
            _logger.LogDebug("Saving downloaded file...");
            using (var fileStream = new FileStream(gzFilePath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                await response.Content.CopyToAsync(fileStream);
            }

            _logger.LogDebug("Download complete. Decompressing...");

            // Decompress .gz file
            using (var gzStream = new System.IO.Compression.GZipStream(
                new FileStream(gzFilePath, FileMode.Open, FileAccess.Read),
                System.IO.Compression.CompressionMode.Decompress))
            {
                using (var outputStream = new FileStream(gribFilePath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    await gzStream.CopyToAsync(outputStream);
                }
            }

            _logger.LogDebug("Decompression complete. Loading GRIB2 data...");

            // Load GRIB2 file
            var success = await _mrmsTileGenerator.LoadGribDataAsync(gribFilePath, cacheKey ?? "default");

            // Clean up temp files
            try
            {
                if (System.IO.File.Exists(gzFilePath))
                    System.IO.File.Delete(gzFilePath);
                if (System.IO.File.Exists(gribFilePath))
                    System.IO.File.Delete(gribFilePath);
            }
            catch (Exception cleanupEx)
            {
                _logger.LogWarning(cleanupEx, "Failed to clean up temporary files");
            }

            if (success)
            {
                var responseObj = new {
                    message = actualTime == time
                        ? "Data downloaded and loaded successfully"
                        : $"Requested time not available. Loaded closest match: {actualTime}",
                    cacheKey = cacheKey ?? "default",
                    product = product,
                    requestedTime = time,
                    actualTime = actualTime,
                    dateTime = $"{date}-{actualTime}",
                    wasApproximated = actualTime != time
                };

                return Ok(responseObj);
            }

            return StatusCode(500, "Failed to load data");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error downloading from S3");
            return StatusCode(500, $"Error downloading from S3: {ex.Message}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing S3 download");
            return StatusCode(500, $"Error processing download: {ex.Message}");
        }
    }

    /// <summary>
    /// Extract time from GRIB2 filename (format: MRMS_Product_YYYYMMDD-HHMMSS.grib2.gz)
    /// </summary>
    private string ExtractTimeFromFileName(string fileName)
    {
        // Example: MRMS_MergedBaseReflectivity_00.50_20251001-000019.grib2.gz
        var parts = fileName.Split('-');
        if (parts.Length >= 2)
        {
            var timePart = parts[1].Split('.')[0]; // Get HHMMSS before .grib2.gz
            return timePart;
        }
        return "000000";
    }

    /// <summary>
    /// Find the file with the closest time to the requested time
    /// </summary>
    private string? FindClosestFile(string xmlContent, string product, string date, string requestedTime)
    {
        // Parse S3 XML response to extract file keys
        var filePattern = $"MRMS_{product}_{date}-";
        var files = new List<(string fileName, string time, int timeDiff)>();

        // Simple XML parsing to find <Key> elements
        var keyStartTag = "<Key>";
        var keyEndTag = "</Key>";
        var startIndex = 0;

        while ((startIndex = xmlContent.IndexOf(keyStartTag, startIndex)) != -1)
        {
            startIndex += keyStartTag.Length;
            var endIndex = xmlContent.IndexOf(keyEndTag, startIndex);
            if (endIndex == -1) break;

            var key = xmlContent.Substring(startIndex, endIndex - startIndex);

            // Extract just the filename from the full key path
            var fileName = Path.GetFileName(key);

            if (fileName.StartsWith($"MRMS_{product}_") && fileName.EndsWith(".grib2.gz"))
            {
                var fileTime = ExtractTimeFromFileName(fileName);
                var timeDiff = CalculateTimeDifference(requestedTime, fileTime);
                files.Add((fileName, fileTime, timeDiff));
            }

            startIndex = endIndex;
        }

        // Find file with minimum time difference
        if (files.Count == 0)
            return null;

        var closest = files.OrderBy(f => f.timeDiff).First();
        return closest.fileName;
    }

    /// <summary>
    /// Calculate absolute difference in seconds between two times (HHMMSS format)
    /// </summary>
    private int CalculateTimeDifference(string time1, string time2)
    {
        int ToSeconds(string time)
        {
            if (time.Length != 6) return int.MaxValue;

            if (int.TryParse(time.Substring(0, 2), out int hours) &&
                int.TryParse(time.Substring(2, 2), out int minutes) &&
                int.TryParse(time.Substring(4, 2), out int seconds))
            {
                return hours * 3600 + minutes * 60 + seconds;
            }
            return int.MaxValue;
        }

        var seconds1 = ToSeconds(time1);
        var seconds2 = ToSeconds(time2);

        return Math.Abs(seconds1 - seconds2);
    }

    /// <summary>
    /// Get pixel value at a specific latitude/longitude coordinate
    /// </summary>
    [HttpGet("value")]
    public IActionResult GetValueAtCoordinate(
        [FromQuery] double lat,
        [FromQuery] double lon,
        [FromQuery] string? cacheKey = "default")
    {
        try
        {
            float? value = _mrmsTileGenerator.GetValueAtCoordinate(lat, lon, cacheKey ?? "default");

            if (value == null)
            {
                return Ok(new { value = (float?)null, lat, lon, message = "No data at this location" });
            }

            return Ok(new { value, lat, lon });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting value at coordinate ({Lat}, {Lon})", lat, lon);
            return StatusCode(500, $"Error getting value: {ex.Message}");
        }
    }

    private byte[] CreateEmptyTile()
    {
        // Return a 1x1 transparent PNG
        return Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    }
}
