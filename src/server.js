import express from "express";
import mqtt from "mqtt";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT ?? 8090);
const DATA_FILE = process.env.DATA_FILE ?? "/app/data/simulator.json";
const MQTT_URL = process.env.MQTT_URL ??
  `mqtt://${process.env.MQTT_HOST ?? "100.64.0.9"}:${process.env.MQTT_PORT ?? "1883"}`;
const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX ?? "sensors/ble_gateway/sensor";
const LOG_LIMIT = Number(process.env.LOG_LIMIT ?? 250);

const APP_VERSION =
  process.env.SIMULATOR_VERSION
  ?? "SIM-004";

const BUILD_NUMBER =
  process.env.SIMULATOR_BUILD
  ?? "004";

const defaultState = {
  sensors: [{
    id: crypto.randomUUID(),
    uid: "11_22_33",
    name: "Test Sensor 01",
    enabled: false,
    intervalSeconds: 15,
    metrics: [
      { id: crypto.randomUUID(), key: "temperature", value: "28.2", unit: "°C", enabled: true },
      { id: crypto.randomUUID(), key: "humidity", value: "38", unit: "%", enabled: true },
      { id: crypto.randomUUID(), key: "battery_level", value: "94", unit: "%", enabled: true },
      { id: crypto.randomUUID(), key: "battery_voltage", value: "3.058", unit: "V", enabled: true },
      { id: crypto.randomUUID(), key: "rssi", value: "-81", unit: "dBm", enabled: true }
    ]
  }],
  logs: []
};

let state;
const timers = new Map();

async function loadState() {
  try {
    state = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    state.logs ??= [];
    state.sensors ??= [];
    for (const sensor of state.sensors) {
      sensor.enabled = false;

      for (const metric of sensor.metrics ?? []) {
        metric.mode ??= "manual";
        metric.randomMin ??= String(metric.value ?? 0);
        metric.randomMax ??= String(metric.value ?? 0);
        metric.rampStart ??= String(metric.value ?? 0);
        metric.rampEnd ??= String(metric.value ?? 0);
        metric.rampStep ??= "1";
        metric.rampDirection ??= 1;
        metric.timeline ??= [];
        metric.timelineStartedAt = null;
      }
    }
  } catch {
    state = structuredClone(defaultState);
    await saveState();
  }
}

async function saveState() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2));
}

function publicState() {
  return {
    application: {
      version: APP_VERSION,
      build: BUILD_NUMBER
    },

    mqtt: {
      url: MQTT_URL.replace(/\/\/.*@/, "//***@"),
      connected: client.connected
    },

    sensors: state.sensors,
    logs: state.logs.slice(0, LOG_LIMIT)
  };
}

function addLog(entry) {
  state.logs.unshift({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    ...entry
  });
  state.logs = state.logs.slice(0, LOG_LIMIT);
}

function topicFor(sensor, metric) {
  return `${TOPIC_PREFIX}/${metric.key}_${sensor.uid}/state`;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function randomValue(metric) {
  const min = numeric(metric.randomMin, 0);
  const max = numeric(metric.randomMax, min);
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const value = low + Math.random() * (high - low);

  const decimals = Math.max(
    String(metric.randomMin ?? "").split(".")[1]?.length ?? 0,
    String(metric.randomMax ?? "").split(".")[1]?.length ?? 0
  );

  return value.toFixed(Math.min(decimals, 6));
}

function rampValue(metric) {
  const start = numeric(metric.rampStart, numeric(metric.value, 0));
  const end = numeric(metric.rampEnd, start);
  const step = Math.abs(numeric(metric.rampStep, 1)) || 1;

  let current = numeric(metric.value, start);
  let direction = metric.rampDirection === -1 ? -1 : 1;

  if (current < Math.min(start, end) || current > Math.max(start, end)) {
    current = start;
    direction = start <= end ? 1 : -1;
  }

  let next = current + step * direction;

  if (direction > 0 && next >= end) {
    next = end;
    direction = -1;
  } else if (direction < 0 && next <= start) {
    next = start;
    direction = 1;
  }

  metric.rampDirection = direction;
  metric.value = String(next);

  return metric.value;
}

function timelineValue(metric) {
  const points = [...(metric.timeline ?? [])]
    .map(point => ({
      offsetSeconds: Math.max(0, Number(point.offsetSeconds) || 0),
      value: String(point.value ?? "")
    }))
    .sort((a, b) => a.offsetSeconds - b.offsetSeconds);

  if (points.length === 0) {
    return String(metric.value ?? "");
  }

  if (!metric.timelineStartedAt) {
    metric.timelineStartedAt = Date.now();
  }

  const elapsedSeconds =
    Math.floor((Date.now() - metric.timelineStartedAt) / 1000);

  let selected = points[0];

  for (const point of points) {
    if (point.offsetSeconds <= elapsedSeconds) {
      selected = point;
    } else {
      break;
    }
  }

  metric.value = selected.value;
  return metric.value;
}

function generatedValue(metric) {
  switch (metric.mode) {
    case "random":
      metric.value = randomValue(metric);
      return metric.value;

    case "ramp":
      return rampValue(metric);

    case "timeline":
      return timelineValue(metric);

    case "manual":
    default:
      return String(metric.value ?? "");
  }
}

async function publishSensor(sensor) {
  if (!client.connected) {
    addLog({ sensor: sensor.name, uid: sensor.uid, status: "ERROR", message: "MQTT disconnected" });
    return;
  }

  const metrics = sensor.metrics.filter(m => m.enabled);
  for (const metric of metrics) {
    const topic = topicFor(sensor, metric);
    const generated = generatedValue(metric);

    try {
      await client.publishAsync(topic, generated, { retain: false });
      addLog({
        sensor: sensor.name,
        uid: sensor.uid,
        metric: metric.key,
        value: generated,
        topic,
        status: "OK"
      });
    } catch (error) {
      addLog({
        sensor: sensor.name,
        uid: sensor.uid,
        metric: metric.key,
        value: generated,
        topic,
        status: "ERROR",
        message: error.message
      });
    }
  }
  await saveState();
}

function stopSensor(sensor) {
  const timer = timers.get(sensor.id);
  if (timer) clearInterval(timer);
  timers.delete(sensor.id);
  sensor.enabled = false;
}

function startSensor(sensor) {
  stopSensor(sensor);

  for (const metric of sensor.metrics ?? []) {
    if (metric.mode === "timeline") {
      metric.timelineStartedAt = Date.now();
    }
  }

  sensor.enabled = true;
  const intervalMs = Math.max(1, Number(sensor.intervalSeconds) || 15) * 1000;
  publishSensor(sensor);
  timers.set(sensor.id, setInterval(() => publishSensor(sensor), intervalMs));
}

function restartIfRunning(sensor, wasRunning) {
  if (wasRunning) startSensor(sensor);
}

const client = mqtt.connect(MQTT_URL, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  reconnectPeriod: 3000
});

client.on("connect", () => addLog({ status: "INFO", message: `MQTT connected: ${MQTT_URL}` }));
client.on("reconnect", () => addLog({ status: "INFO", message: "MQTT reconnecting" }));
client.on("error", error => addLog({ status: "ERROR", message: `MQTT: ${error.message}` }));

await loadState();

const app = express();

app.use(
  (
    _req,
    res,
    next
  ) => {

    // The simulator UI changes frequently during development.
    // Prevent stale app.js/styles.css/index.html after rebuilds.
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    res.setHeader(
      "Expires",
      "0"
    );

    next();
  }
);

app.use(express.json());
app.use(express.static("public"));

app.get("/api/state", (_req, res) => res.json(publicState()));

app.post("/api/sensors", async (req, res) => {
  const sensor = {
    id: crypto.randomUUID(),
    uid: String(req.body.uid || `test_${Date.now()}`),
    name: String(req.body.name || "New sensor"),
    enabled: false,
    intervalSeconds: Math.max(1, Number(req.body.intervalSeconds) || 15),
    metrics: []
  };
  state.sensors.push(sensor);
  await saveState();
  res.status(201).json(sensor);
});

app.patch("/api/sensors/:id", async (req, res) => {
  const sensor = state.sensors.find(s => s.id === req.params.id);
  if (!sensor) return res.sendStatus(404);
  const wasRunning = sensor.enabled;
  stopSensor(sensor);
  if (req.body.uid !== undefined) sensor.uid = String(req.body.uid);
  if (req.body.name !== undefined) sensor.name = String(req.body.name);
  if (req.body.intervalSeconds !== undefined)
    sensor.intervalSeconds = Math.max(1, Number(req.body.intervalSeconds) || 15);
  restartIfRunning(sensor, wasRunning);
  await saveState();
  res.json(sensor);
});

app.delete("/api/sensors/:id", async (req, res) => {
  const sensor = state.sensors.find(s => s.id === req.params.id);
  if (!sensor) return res.sendStatus(404);
  stopSensor(sensor);
  state.sensors = state.sensors.filter(s => s.id !== sensor.id);
  await saveState();
  res.sendStatus(204);
});

app.post("/api/sensors/:id/start", async (req, res) => {
  const sensor = state.sensors.find(s => s.id === req.params.id);
  if (!sensor) return res.sendStatus(404);
  startSensor(sensor);
  await saveState();
  res.json(sensor);
});

app.post("/api/sensors/:id/stop", async (req, res) => {
  const sensor = state.sensors.find(s => s.id === req.params.id);
  if (!sensor) return res.sendStatus(404);
  stopSensor(sensor);
  await saveState();
  res.json(sensor);
});

app.post("/api/sensors/:id/publish", async (req, res) => {
  const sensor = state.sensors.find(s => s.id === req.params.id);
  if (!sensor) return res.sendStatus(404);
  await publishSensor(sensor);
  res.json({ ok: true });
});

app.post("/api/start-all", async (_req, res) => {
  state.sensors.forEach(startSensor);
  await saveState();
  res.json({ ok: true });
});

app.post("/api/stop-all", async (_req, res) => {
  state.sensors.forEach(stopSensor);
  await saveState();
  res.json({ ok: true });
});

app.post("/api/publish-all", async (_req, res) => {
  for (const sensor of state.sensors) await publishSensor(sensor);
  res.json({ ok: true });
});

app.post("/api/sensors/:id/metrics", async (req, res) => {
  const sensor = state.sensors.find(s => s.id === req.params.id);
  if (!sensor) return res.sendStatus(404);
  const metric = {
    id: crypto.randomUUID(),
    key: String(req.body.key || "metric"),
    value: String(req.body.value ?? "0"),
    unit: String(req.body.unit ?? ""),
    enabled: req.body.enabled !== false,
    mode: "manual",
    randomMin: "0",
    randomMax: "100",
    rampStart: "0",
    rampEnd: "100",
    rampStep: "1",
    rampDirection: 1,
    timeline: [],
    timelineStartedAt: null
  };
  sensor.metrics.push(metric);
  await saveState();
  res.status(201).json(metric);
});

app.patch("/api/sensors/:sensorId/metrics/:metricId", async (req, res) => {
  const sensor = state.sensors.find(s => s.id === req.params.sensorId);
  const metric = sensor?.metrics.find(m => m.id === req.params.metricId);
  if (!metric) return res.sendStatus(404);
  if (req.body.key !== undefined) metric.key = String(req.body.key);
  if (req.body.value !== undefined) metric.value = String(req.body.value);
  if (req.body.unit !== undefined) metric.unit = String(req.body.unit);
  if (req.body.enabled !== undefined) metric.enabled = Boolean(req.body.enabled);

  if (req.body.mode !== undefined) {
    metric.mode = String(req.body.mode);

    if (metric.mode === "timeline") {
      metric.timelineStartedAt = Date.now();
    }
  }

  if (req.body.randomMin !== undefined) metric.randomMin = String(req.body.randomMin);
  if (req.body.randomMax !== undefined) metric.randomMax = String(req.body.randomMax);
  if (req.body.rampStart !== undefined) metric.rampStart = String(req.body.rampStart);
  if (req.body.rampEnd !== undefined) metric.rampEnd = String(req.body.rampEnd);
  if (req.body.rampStep !== undefined) metric.rampStep = String(req.body.rampStep);

  if (req.body.timeline !== undefined) {
    metric.timeline =
      Array.isArray(req.body.timeline)
        ? req.body.timeline.map(point => ({
            offsetSeconds: Math.max(0, Number(point.offsetSeconds) || 0),
            value: String(point.value ?? "")
          }))
        : [];

    metric.timelineStartedAt = Date.now();
  }

  await saveState();
  res.json(metric);
});

app.delete("/api/sensors/:sensorId/metrics/:metricId", async (req, res) => {
  const sensor = state.sensors.find(s => s.id === req.params.sensorId);
  if (!sensor) return res.sendStatus(404);
  sensor.metrics = sensor.metrics.filter(m => m.id !== req.params.metricId);
  await saveState();
  res.sendStatus(204);
});

app.delete("/api/logs", async (_req, res) => {
  state.logs = [];
  await saveState();
  res.sendStatus(204);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `SensorSphere Simulator ${APP_VERSION} build ${BUILD_NUMBER} listening on :${PORT}`
  );

  console.log(
    `MQTT target: ${MQTT_URL}`
  );
});
