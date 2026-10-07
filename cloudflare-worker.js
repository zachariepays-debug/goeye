import { DurableObject } from "cloudflare:workers";

const BACKEND_PORT = 4173;
const STARTUP_ATTEMPTS = 90;
const STARTUP_WAIT_MS = 250;
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function containerEnv(env) {
  const values = {
    HOST: "0.0.0.0",
    PORT: String(BACKEND_PORT),
    OPENSKY_AUTH_MODE: "anon",
    VITE_AIS_LIVE_API_URL: "/api/vessels",
    VITE_AIS_LIVE_MAX_ROWS: "12000",
    VITE_AIS_LIVE_LABEL_MAX_ROWS: "900",
  };

  // Forward configured Worker vars/secrets to the Node/Vite backend.
  // Non-string bindings such as ASSETS and BACKEND are ignored.
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.length > 0) {
      values[key] = value;
    }
  }

  return values;
}

function isApiRequest(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export class GoEyeBackend extends DurableObject {
  starting;

  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    void ctx.blockConcurrencyWhile(async () => {
      await ctx.container.setInactivityTimeout(IDLE_TIMEOUT_MS);
    });
  }

  async startAndWaitForPort() {
    const container = this.ctx.container;

    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: "lite",
        enableInternet: true,
        env: containerEnv(this.env),
      });
    }

    await container.setInactivityTimeout(IDLE_TIMEOUT_MS);

    const port = container.getTcpPort(BACKEND_PORT);
    let lastError;

    for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt += 1) {
      try {
        const response = await port.fetch(
          new Request("http://container/", {
            method: "GET",
            headers: { "X-GEV-Health": "1" },
          }),
          { signal: AbortSignal.timeout(1000) },
        );
        await response.body?.cancel();
        if (response.ok) return;
        lastError = new Error(`Backend returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }

      await scheduler.wait(STARTUP_WAIT_MS);
    }

    throw new Error("God's Eye backend container did not become ready", {
      cause: lastError,
    });
  }

  async fetch(request) {
    this.starting ??= this.startAndWaitForPort().finally(() => {
      this.starting = undefined;
    });

    await this.starting;
    return this.ctx.container.getTcpPort(BACKEND_PORT).fetch(request);
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;

    if (isApiRequest(pathname)) {
      return env.BACKEND.getByName("default").fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
