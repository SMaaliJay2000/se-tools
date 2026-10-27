// Copy-paste fix snippets per stack. Each returns { express, aspnet, nginx, iis }.

/** Generic "add these response headers" snippet. */
export function headersFix(map) {
  const entries = Object.entries(map);
  return {
    express:
      `// Quick option: npm i helmet && app.use(helmet())\n` +
      `app.use((req, res, next) => {\n` +
      entries.map(([k, v]) => `  res.setHeader("${k}", "${v}");`).join("\n") +
      `\n  next();\n});`,
    aspnet:
      `app.Use(async (context, next) =>\n{\n` +
      entries.map(([k, v]) => `    context.Response.Headers["${k}"] = "${v}";`).join("\n") +
      `\n    await next();\n});`,
    nginx: entries.map(([k, v]) => `add_header ${k} "${v}" always;`).join("\n"),
    iis:
      `<system.webServer>\n  <httpProtocol>\n    <customHeaders>\n` +
      entries.map(([k, v]) => `      <add name="${k}" value="${v}" />`).join("\n") +
      `\n    </customHeaders>\n  </httpProtocol>\n</system.webServer>`,
  };
}

export const CSP_VALUE =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

export const fixes = {
  csp: () => ({
    ...headersFix({ "Content-Security-Policy": CSP_VALUE }),
    express:
      `import helmet from "helmet";\n\n` +
      `app.use(helmet.contentSecurityPolicy({\n  directives: {\n` +
      `    defaultSrc: ["'self'"],\n    scriptSrc: ["'self'"],\n    styleSrc: ["'self'"],\n` +
      `    imgSrc: ["'self'", "data:"],\n    objectSrc: ["'none'"],\n    baseUri: ["'self'"],\n` +
      `    frameAncestors: ["'none'"],\n    formAction: ["'self'"],\n  },\n}));`,
  }),

  hsts: () => ({
    express:
      `import helmet from "helmet";\n\n` +
      `app.use(helmet.hsts({ maxAge: 63072000, includeSubDomains: true, preload: true }));`,
    aspnet:
      `builder.Services.AddHsts(o =>\n{\n    o.MaxAge = TimeSpan.FromDays(365);\n    o.IncludeSubDomains = true;\n    o.Preload = true;\n});\n\n` +
      `if (!app.Environment.IsDevelopment()) app.UseHsts();\napp.UseHttpsRedirection();`,
    nginx: `# inside the server { listen 443 ssl; } block\nadd_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;`,
    iis:
      `<system.webServer>\n  <httpProtocol>\n    <customHeaders>\n` +
      `      <add name="Strict-Transport-Security" value="max-age=63072000; includeSubDomains; preload" />\n` +
      `    </customHeaders>\n  </httpProtocol>\n</system.webServer>`,
  }),

  https: () => ({
    express:
      `app.set("trust proxy", 1);\napp.use((req, res, next) =>\n  req.secure ? next() : res.redirect(301, "https://" + req.headers.host + req.originalUrl));`,
    aspnet: `app.UseHttpsRedirection();\napp.UseHsts();`,
    nginx: `server {\n  listen 80;\n  server_name example.com;\n  return 301 https://$host$request_uri;\n}`,
    iis:
      `<system.webServer>\n  <rewrite>\n    <rules>\n      <rule name="HTTPS redirect" stopProcessing="true">\n` +
      `        <match url="(.*)" />\n        <conditions><add input="{HTTPS}" pattern="off" /></conditions>\n` +
      `        <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />\n` +
      `      </rule>\n    </rules>\n  </rewrite>\n</system.webServer>`,
  }),

  xfo: () => headersFix({ "X-Frame-Options": "DENY" }),
  xcto: () => headersFix({ "X-Content-Type-Options": "nosniff" }),
  referrer: () => headersFix({ "Referrer-Policy": "strict-origin-when-cross-origin" }),
  permissions: () =>
    headersFix({ "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()" }),
  isolation: () =>
    headersFix({ "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin" }),
  xxss: () => headersFix({ "X-XSS-Protection": "0" }),

  disclosure: () => ({
    express: `app.disable("x-powered-by");`,
    aspnet:
      `builder.WebHost.ConfigureKestrel(o => o.AddServerHeader = false);\n` +
      `// IIS: also remove X-Powered-By and X-AspNet-Version (see IIS tab)`,
    nginx: `server_tokens off;\nproxy_hide_header X-Powered-By;`,
    iis:
      `<system.webServer>\n  <httpProtocol>\n    <customHeaders>\n      <remove name="X-Powered-By" />\n    </customHeaders>\n  </httpProtocol>\n` +
      `  <security>\n    <requestFiltering removeServerHeader="true" />\n  </security>\n</system.webServer>\n\n` +
      `<system.web>\n  <httpRuntime enableVersionHeader="false" />\n</system.web>`,
  }),

  cookies: () => ({
    express:
      `res.cookie("sid", value, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });\n\n` +
      `// express-session\napp.use(session({ cookie: { httpOnly: true, secure: true, sameSite: "lax" } }));`,
    aspnet:
      `builder.Services.ConfigureApplicationCookie(o =>\n{\n    o.Cookie.HttpOnly = true;\n` +
      `    o.Cookie.SecurePolicy = CookieSecurePolicy.Always;\n    o.Cookie.SameSite = SameSiteMode.Lax;\n});\n\n` +
      `// Manually issued cookies\nResponse.Cookies.Append("name", value, new CookieOptions\n{\n    HttpOnly = true,\n    Secure = true,\n    SameSite = SameSiteMode.Lax\n});`,
    nginx: `# nginx >= 1.19.3, for proxied apps\nproxy_cookie_flags ~ secure httponly samesite=lax;`,
    iis:
      `<system.web>\n  <httpCookies httpOnlyCookies="true" requireSSL="true" />\n  <sessionState cookieSameSite="Lax" />\n</system.web>`,
  }),

  cors: (origin = "https://app.example.com") => ({
    express:
      `import cors from "cors";\n\nconst allowed = ["${origin}"];\n\napp.use(cors({\n` +
      `  origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)),\n  credentials: true,\n` +
      `  methods: ["GET", "POST", "PUT", "DELETE"],\n  allowedHeaders: ["Content-Type", "Authorization"],\n  maxAge: 600,\n}));`,
    aspnet:
      `builder.Services.AddCors(o => o.AddPolicy("Frontend", p => p\n    .WithOrigins("${origin}")\n` +
      `    .WithMethods("GET", "POST", "PUT", "DELETE")\n    .WithHeaders("Content-Type", "Authorization")\n` +
      `    .AllowCredentials()\n    .SetPreflightMaxAge(TimeSpan.FromMinutes(10))));\n\n` +
      `// after UseRouting(), before UseAuthorization()\napp.UseCors("Frontend");`,
    nginx:
      `map $http_origin $cors_origin {\n  default "";\n  "${origin}" $http_origin;\n}\n\nlocation /api/ {\n` +
      `  add_header Access-Control-Allow-Origin $cors_origin always;\n  add_header Access-Control-Allow-Credentials "true" always;\n  add_header Vary Origin always;\n\n` +
      `  if ($request_method = OPTIONS) {\n    add_header Access-Control-Allow-Origin $cors_origin always;\n` +
      `    add_header Access-Control-Allow-Credentials "true" always;\n    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE" always;\n` +
      `    add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;\n    add_header Access-Control-Max-Age 600 always;\n    add_header Vary Origin always;\n    return 204;\n  }\n}`,
    iis:
      `<!-- Requires the IIS CORS Module -->\n<system.webServer>\n  <cors enabled="true" failUnlistedOrigins="true">\n` +
      `    <add origin="${origin}" allowCredentials="true" maxAge="600">\n      <allowMethods>\n        <add method="GET" />\n        <add method="POST" />\n      </allowMethods>\n` +
      `      <allowHeaders>\n        <add header="Content-Type" />\n        <add header="Authorization" />\n      </allowHeaders>\n    </add>\n  </cors>\n</system.webServer>`,
  }),

  vary: () => ({
    express: `res.vary("Origin"); // the cors package does this for you`,
    aspnet: `// ASP.NET Core CORS adds Vary: Origin automatically.\n// For custom middleware:\ncontext.Response.Headers.Append("Vary", "Origin");`,
    nginx: `add_header Vary Origin always;`,
    iis: `<add name="Vary" value="Origin" />  <!-- under system.webServer/httpProtocol/customHeaders -->`,
  }),
};
