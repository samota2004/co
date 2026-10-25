import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "node:http";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

import apiRouter from "./routes/index.js";
import {securityHttp,allowedOrigins} from './middleware/security-http.js';
import {securityErrorHandler} from './services/security-common.js';
import { endpointRequestContext, endpointPayloadError } from './middleware/endpoint-errors.js';
import {configureProxy} from './services/proxy-policy.js';
import {
  notFoundHandler,
  errorHandler
} from "./middleware/error-handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error('[CyberOrbit SOC] PORT must be a number between 0 and 65535.');
  process.exit(1);
}
let ready = false;
app.use((req, res, next) => {
  if (ready) return next();
  res.set('Retry-After', '1').status(503).json({ success: false, error: 'Server is starting. Retry shortly.' });
});
console.info('[trusted-proxy-policy]',JSON.stringify(configureProxy(app)));
app.use(securityHttp);
// CORS
app.use(
  cors({
    origin: (origin,callback)=>callback(null,!origin||allowedOrigins().has(origin)),
    credentials: true
  })
);

// Body parsing
// Endpoint limits apply before the legacy general body parser.
app.use('/api/endpoint', endpointRequestContext, express.json({ limit: '256kb' }), endpointPayloadError);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    service: "CyberOrbit API"
  });
});

// API routes
app.use("/api", apiRouter);

// Reserve the API port before starting Vite. A duplicate launch must fail
// before it creates file watchers or a second development WebSocket server.
const httpServer = createServer(app);
try {
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, '0.0.0.0', () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });
} catch (error) {
  console.error(error.code === 'EADDRINUSE'
    ? `[CyberOrbit SOC] Port ${PORT} is already in use. Stop the existing backend with Ctrl+C in its terminal before starting another copy.`
    : `[CyberOrbit SOC] Cannot listen on port ${PORT}: ${error.code || error.message}`);
  process.exit(1);
}
httpServer.on('error', error => {
  console.error(`[CyberOrbit SOC] HTTP server error: ${error.code || error.message}`);
  process.exit(1);
});

// Vite development server / production static files
try {
  if (process.env.NODE_ENV !== "production") {
    const viteConfigFile = path.resolve(__dirname, "../client/vite.config.js");

    const vite = await createViteServer({
      configFile: viteConfigFile,
      server: {
        middlewareMode: true,
        // Share the HTTP listener instead of opening Vite's default port 24678.
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer }
      },
      appType: "spa"
    });

    app.use(vite.middlewares);
  } else {
    // Frontend build stays inside the client module.
    const distPath = path.resolve(__dirname, '../client/dist');

    app.use(express.static(distPath));

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
} catch (error) {
  console.error(`[CyberOrbit SOC] Frontend startup failed: ${error.message}`);
  httpServer.close();
  process.exit(1);
}

// Error handlers
app.use(notFoundHandler);
app.use(securityErrorHandler);
app.use(errorHandler);

export default app;

const {scheduleEndpointRetention}=await import('./services/endpoint-retention.js');
const {prisma:retentionDb}=await import('./models/prisma.js');
const stopRetention=scheduleEndpointRetention(retentionDb);
httpServer.once('close',stopRetention);
const {finalizeDailyRiskSnapshots}=await import('./services/daily-risk-snapshot-service.js');
let snapshotRefreshRunning=false;
const refreshSnapshots=async()=>{if(snapshotRefreshRunning)return;snapshotRefreshRunning=true;try{const outcome=await finalizeDailyRiskSnapshots(retentionDb);if(outcome.truncated)console.warn('Daily risk snapshot catch-up reached its 50,000-row per-source safety cap.');}catch(error){console.warn('Daily risk snapshot catch-up deferred:',error?.code||error?.name||'unavailable');}finally{snapshotRefreshRunning=false;}};
void refreshSnapshots();
const snapshotTimer=setInterval(refreshSnapshots,5*60*1000);snapshotTimer.unref();
httpServer.once('close',()=>clearInterval(snapshotTimer));
ready = true;
console.log(`[CyberOrbit SOC] Server running on http://localhost:${httpServer.address().port}`);
