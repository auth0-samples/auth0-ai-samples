using Auth0.AspNetCore.Authentication.Api;
using Microsoft.AspNetCore.Authentication.JwtBearer;
//using Microsoft.IdentityModel.Tokens;
using ModelContextProtocol.AspNetCore.Authentication;

var builder = WebApplication.CreateBuilder(args);

var authority = $"https://{builder.Configuration["Auth0:Domain"]}/";
var audience = builder.Configuration["Auth0:Audience"];
var mcpServerBaseUrl = builder.Configuration["McpServer:BaseUrl"];

var authBuilder = builder.Services.AddAuthentication(options =>
{
    options.DefaultChallengeScheme = McpAuthenticationDefaults.AuthenticationScheme;
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
});

authBuilder.AddAuth0ApiAuthentication(  //👈 changed code
    JwtBearerDefaults.AuthenticationScheme,
    builder.Configuration.GetSection("Auth0"),
    configureJwtBearer: jwt =>
    {
        jwt.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                Console.WriteLine("Token validated successfully.");
                return Task.CompletedTask;
            },
            OnAuthenticationFailed = context =>
            {
                Console.WriteLine($"Authentication failed: {context.Exception.Message}");
                return Task.CompletedTask;
            }
        };
    });

authBuilder.AddMcp(options =>
{
    options.ResourceMetadata = new()
    {
        Resource = mcpServerBaseUrl ?? audience ?? string.Empty,
        AuthorizationServers = { authority },
        ScopesSupported = ["tool:getsystemstate", "tool:setsystemstate"],
    };
});

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("GetSystemStatePolicy", policy =>
        policy.RequireClaim("permissions", "tool:getsystemstate"));

    options.AddPolicy("SetSystemStatePolicy", policy =>
        policy.RequireClaim("permissions", "tool:setsystemstate"));
});

// Add the MCP services: the transport to use (http) and the tools to register.
builder.Services
    .AddMcpServer()
    .WithHttpTransport()
    .AddAuthorizationFilters()
    .WithTools<RandomNumberTools>()
    .WithTools<SystemTools>();

var app = builder.Build();

app.MapMcp().RequireAuthorization();

app.Run(mcpServerBaseUrl);
