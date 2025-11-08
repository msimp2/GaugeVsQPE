using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class MadisProxyController : ControllerBase
{
    private readonly HttpClient _httpClient;

    public MadisProxyController(IHttpClientFactory httpClientFactory)
    {
        _httpClient = httpClientFactory.CreateClient();
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return BadRequest("Missing url parameter.");

        var response = await _httpClient.GetAsync(url);
        if (!response.IsSuccessStatusCode)
            return StatusCode((int)response.StatusCode, "Failed to fetch MADIS data.");

        var content = await response.Content.ReadAsStringAsync();
        return Content(content, "text/csv");
    }
}