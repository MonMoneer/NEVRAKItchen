import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { passport } from "./auth";
import { pool } from "./db";

const _origExit = process.exit.bind(process);
process.exit = ((code?: number) => {
  console.error(`[CRASH] process.exit(${code}) called at:\n${new Error().stack}`);
  _origExit(code);
}) as typeof process.exit;

process.on("uncaughtException", (err) => {
  console.error(`[CRASH] uncaughtException: ${err?.stack || err}`);
});

process.on("unhandledRejection", (reason: any) => {
  console.error(`[CRASH] unhandledRejection: ${reason?.stack || reason}`);
});

process.on("SIGTERM", () => {
  console.error("[CRASH] received SIGTERM — workflow manager sending shutdown signal");
  setTimeout(() => _origExit(0), 200);
});

process.on("exit", (code) => {
  console.error(`[CRASH] process exiting with code ${code}`);
});

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({ pool, tableName: "session", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || "nivra-kitchen-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5000", 10);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
    httpServer.listen({ port, host: "0.0.0.0" }, () => {
      log(`serving on port ${port}`);
    });
  } else {
    // Register a pre-Vite catch-all BEFORE binding the port.
    // Replit's health check fires as soon as port 5000 opens (TCP check),
    // then immediately sends GET / and expects HTTP 200. Without this,
    // the request hangs until Vite is fully set up (~15-25s cold cache)
    // and Replit SIGKILL's the process after its connection timeout (~100s).
    let viteReady = false;
    app.use("/{*path}", (_req, res, next) => {
      if (viteReady) return next();
      res.status(200).type("html").send(
        `<!doctype html><html><head><title>Starting...</title>` +
        `<meta http-equiv="refresh" content="2"></head>` +
        `<body>Starting application, please wait...</body></html>`
      );
    });

    // Bind the port BEFORE setting up Vite so Replit's waitForPort check
    // passes immediately. Vite's dep optimization runs in the background.
    await new Promise<void>((resolve) => {
      httpServer.listen({ port, host: "0.0.0.0" }, () => {
        log(`serving on port ${port}`);
        resolve();
      });
    });

    // Replit's webview health check sends a WebSocket with protocol "vite-ping"
    // to the root path (/). Vite's HMR is configured to listen on /vite-hmr,
    // so we intercept the upgrade event BEFORE Vite registers its listener and
    // rewrite the URL so Vite handles the vite-ping correctly.
    // This allows the workflow to transition to RUNNING state.
    httpServer.on("upgrade", (req, _socket, _head) => {
      if (
        req.headers["sec-websocket-protocol"] === "vite-ping" &&
        req.url === "/"
      ) {
        log("rewriting vite-ping WebSocket / -> /vite-hmr for Replit health check", "vite");
        req.url = "/vite-hmr";
      }
    });

    // Pre-load vite config and inject known deps into optimizeDeps.include so
    // Vite pre-bundles them at startup instead of discovering them at runtime.
    // noDiscovery: true prevents Vite from calling server.restart() after
    // crawling source files for new imports, which would drop the HMR WebSocket.
    const viteConfigModule = await import("../vite.config");
    const viteConfigObj = viteConfigModule.default as any;
    const knownClientDeps = [
      "react", "react-dom", "react/jsx-dev-runtime", "react/jsx-runtime",
      "react-dom/client",
      "@radix-ui/react-dialog", "@radix-ui/react-label",
      "@radix-ui/react-scroll-area", "@radix-ui/react-select",
      "@radix-ui/react-separator", "@radix-ui/react-slider",
      "@radix-ui/react-slot", "@radix-ui/react-switch",
      "@radix-ui/react-tabs", "@radix-ui/react-toast",
      "@radix-ui/react-tooltip",
      "@tanstack/react-query",
      "class-variance-authority", "clsx", "tailwind-merge",
      "jspdf", "pdf-lib", "react-konva",
      "lucide-react", "wouter",
      "react-hook-form", "@hookform/resolvers/zod", "zod",
    ];
    viteConfigObj.optimizeDeps = {
      ...(viteConfigObj.optimizeDeps || {}),
      include: [
        ...((viteConfigObj.optimizeDeps || {}).include || []),
        ...knownClientDeps,
      ],
      noDiscovery: true,
    };

    viteConfigObj.plugins = [
      ...(Array.isArray(viteConfigObj.plugins) ? viteConfigObj.plugins : []),
      {
        name: "replit-startup-guard",
        configResolved(resolvedConfig: any) {
          const od = resolvedConfig.optimizeDeps;
          log(`resolved optimizeDeps: noDiscovery=${od?.noDiscovery}, include=${JSON.stringify(od?.include?.slice(0,3))}...`, "vite");
          const envOd = resolvedConfig.environments?.client?.optimizeDeps;
          log(`client env optimizeDeps: noDiscovery=${envOd?.noDiscovery}`, "vite");
        },
        configureServer(viteServer: any) {
          const _originalRestart = viteServer.restart?.bind(viteServer);
          viteServer.restart = async (forceOptimize?: boolean) => {
            log(`Vite server.restart(forceOptimize=${forceOptimize}) called — ${forceOptimize ? "allowing" : "suppressing"}`, "vite");
            if (forceOptimize && _originalRestart) {
              return _originalRestart(forceOptimize);
            }
          };
          const _origSend = viteServer.hot?.send?.bind(viteServer.hot);
          if (viteServer.hot?.send) {
            viteServer.hot.send = (payload: any) => {
              if (payload?.type === "full-reload") {
                log(`[DIAG] full-reload sent: ${JSON.stringify(payload)}`, "vite");
              }
              return _origSend?.(payload);
            };
          }
        },
      },
    ];

    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
    viteReady = true;
    log("Vite ready — full app is now serving", "vite");
  }

})();
