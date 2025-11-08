using Viewer.DataSources.Mrms;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Register tile generator as singleton
builder.Services.AddSingleton<MrmsTileGenerator>();

// Add CORS for development
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

// Map default file (must come before UseStaticFiles)
app.UseDefaultFiles();

// Serve static files (our web interface)
app.UseStaticFiles();

app.MapControllers();

app.Run();
