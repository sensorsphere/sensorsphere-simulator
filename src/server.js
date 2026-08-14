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
  ?? "SIM-009";

const BUILD_NUMBER =
  process.env.SIMULATOR_BUILD
  ?? "009";

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
  scenarios: [],
  logs: []
};

let state;
const timers = new Map();
const scenarioTimers = new Map();

async function loadState() {
  try {
    state = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    state.logs ??= [];
    state.sensors ??= [];
    state.scenarios ??= [];

    for (const scenario of state.scenarios) {
      scenario.status = "STOPPED";
      scenario.startedAt = null;
      scenario.pausedAt = null;
      scenario.elapsedBeforePause = 0;

      for (const action of scenario.actions ?? []) {
        if (!action.sensorUid && action.sensorId) {
          const sensor =
            state.sensors.find(
              current =>
                current.id ===
                action.sensorId
            );

          if (sensor) {
            action.sensorUid =
              sensor.uid;
          }
        }

        if (
          !action.metricKey &&
          action.metricId
        ) {
          const sensor =
            state.sensors.find(
              current =>
                current.id ===
                action.sensorId
            );

          const metric =
            sensor?.metrics.find(
              current =>
                current.id ===
                action.metricId
            );

          if (metric) {
            action.metricKey =
              metric.key;
          }
        }
      }
    }
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
    scenarios: state.scenarios,
    scenarioLocks:
      activeScenarioLocks(),
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

function scenarioControlsPair(
  scenario,
  sensorUid,
  metricKey
) {
  if (
    scenario.status !== "RUNNING" &&
    scenario.status !== "PAUSED"
  ) {
    return false;
  }

  return (scenario.actions ?? []).some(
    action =>
      action.sensorUid === sensorUid &&
      action.metricKey === metricKey &&
      [
        "SET_VALUE",
        "ENABLE_METRIC",
        "DISABLE_METRIC"
      ].includes(action.type)
  );
}

function controllingScenarios(
  sensorUid,
  metricKey
) {
  return (state.scenarios ?? []).filter(
    scenario =>
      scenarioControlsPair(
        scenario,
        sensorUid,
        metricKey
      )
  );
}

function activeScenarioLocks() {
  const locks = [];

  for (const sensor of state.sensors) {
    for (const metric of sensor.metrics ?? []) {
      const scenarios =
        controllingScenarios(
          sensor.uid,
          metric.key
        );

      if (scenarios.length === 0) {
        continue;
      }

      locks.push({
        sensorUid: sensor.uid,
        metricKey: metric.key,
        scenarios: scenarios.map(
          scenario => ({
            id: scenario.id,
            name: scenario.name,
            status: scenario.status
          })
        )
      });
    }
  }

  return locks;
}

async function publishMetric(
  sensor,
  metric,
  options = {}
) {
  const source =
    options.source ?? "basic";

  if (source === "basic") {
    const controllers =
      controllingScenarios(
        sensor.uid,
        metric.key
      );

    if (controllers.length > 0) {
      return {
        skipped: true,
        reason: "scenario_controlled"
      };
    }
  }

  const topic =
    topicFor(
      sensor,
      metric
    );

  const generated =
    options.value !== undefined
      ? String(options.value)
      : generatedValue(metric);

  try {
    await client.publishAsync(
      topic,
      generated,
      { retain: false }
    );

    addLog({
      sensor: sensor.name,
      uid: sensor.uid,
      metric: metric.key,
      value: generated,
      topic,
      status: "OK",
      source
    });

    return {
      skipped: false,
      value: generated
    };
  } catch (error) {
    addLog({
      sensor: sensor.name,
      uid: sensor.uid,
      metric: metric.key,
      value: generated,
      topic,
      status: "ERROR",
      source,
      message: error.message
    });

    return {
      skipped: false,
      error
    };
  }
}

async function publishSensor(sensor) {
  if (!client.connected) {
    addLog({ sensor: sensor.name, uid: sensor.uid, status: "ERROR", message: "MQTT disconnected" });
    return;
  }

  const metrics =
    sensor.metrics.filter(
      metric => metric.enabled
    );

  for (const metric of metrics) {
    await publishMetric(
      sensor,
      metric,
      { source: "basic" }
    );
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

function scenarioElapsedSeconds(
  scenario
) {
  if (
    scenario.status ===
    "PAUSED"
  ) {
    return Math.floor(
      (
        scenario.elapsedBeforePause
        ?? 0
      ) /
      1000
    );
  }

  if (
    scenario.status !==
      "RUNNING" ||
    !scenario.startedAt
  ) {
    return 0;
  }

  return Math.floor(
    (
      (
        Date.now() -
        scenario.startedAt
      ) +
      (
        scenario.elapsedBeforePause
        ?? 0
      )
    ) /
    1000
  );
}

async function applyScenarioAction(
  scenario,
  action
) {
  const sensor =
    state.sensors.find(
      current =>
        (
          action.sensorUid &&
          current.uid ===
            action.sensorUid
        ) ||
        (
          action.sensorId &&
          current.id ===
            action.sensorId
        )
    );

  if (!sensor) {
    addLog({
      status: "ERROR",
      message:
        `Scenario "${scenario.name}": sensor not found`
    });
    return;
  }

  switch (action.type) {
    case "SET_VALUE": {
      const metric =
        sensor.metrics.find(
          current =>
            (
              action.metricKey &&
              current.key ===
                action.metricKey
            ) ||
            (
              action.metricId &&
              current.id ===
                action.metricId
            )
        );

      if (!metric) {
        addLog({
          status: "ERROR",
          sensor: sensor.name,
          uid: sensor.uid,
          message:
            `Scenario "${scenario.name}": metric not found`
        });
        return;
      }

      metric.value =
        String(
          action.value ?? ""
        );

      metric.mode =
        "manual";

      addLog({
        status: "INFO",
        sensor: sensor.name,
        uid: sensor.uid,
        metric: metric.key,
        value: metric.value,
        message:
          `Scenario "${scenario.name}" set value`
      });

      await publishMetric(
        sensor,
        metric,
        {
          source:
            `scenario:${scenario.name}`,
          value:
            metric.value
        }
      );

      break;
    }

    case "ENABLE_METRIC": {
      const metric =
        sensor.metrics.find(
          current =>
            (
              action.metricKey &&
              current.key ===
                action.metricKey
            ) ||
            (
              action.metricId &&
              current.id ===
                action.metricId
            )
        );

      if (metric) {
        metric.enabled = true;

        addLog({
          status: "INFO",
          sensor: sensor.name,
          uid: sensor.uid,
          metric: metric.key,
          message:
            `Scenario "${scenario.name}" enabled metric`
        });
      }

      break;
    }

    case "DISABLE_METRIC": {
      const metric =
        sensor.metrics.find(
          current =>
            (
              action.metricKey &&
              current.key ===
                action.metricKey
            ) ||
            (
              action.metricId &&
              current.id ===
                action.metricId
            )
        );

      if (metric) {
        metric.enabled = false;

        addLog({
          status: "INFO",
          sensor: sensor.name,
          uid: sensor.uid,
          metric: metric.key,
          message:
            `Scenario "${scenario.name}" disabled metric`
        });
      }

      break;
    }

    case "START_SENSOR":
      startSensor(sensor);

      addLog({
        status: "INFO",
        sensor: sensor.name,
        uid: sensor.uid,
        message:
          `Scenario "${scenario.name}" started sensor`
      });

      break;

    case "STOP_SENSOR":
      stopSensor(sensor);

      addLog({
        status: "INFO",
        sensor: sensor.name,
        uid: sensor.uid,
        message:
          `Scenario "${scenario.name}" stopped sensor`
      });

      break;

    case "PUBLISH_SENSOR":
      for (
        const metric
        of sensor.metrics.filter(
          current => current.enabled
        )
      ) {
        await publishMetric(
          sensor,
          metric,
          {
            source:
              `scenario:${scenario.name}`
          }
        );
      }

      break;
  }
}

async function scenarioTick(
  scenario
) {
  if (
    scenario.status !==
    "RUNNING"
  ) {
    return;
  }

  const elapsed =
    scenarioElapsedSeconds(
      scenario
    );

  const actions =
    [...(scenario.actions ?? [])]
      .sort(
        (left, right) =>
          left.offsetSeconds -
          right.offsetSeconds
      );

  for (const action of actions) {
    if (
      action.executed ||
      action.offsetSeconds >
        elapsed
    ) {
      continue;
    }

    action.executed =
      true;

    await applyScenarioAction(
      scenario,
      action
    );
  }

  const pending =
    actions.some(
      action =>
        !action.executed
    );

  if (!pending) {
    scenario.status =
      "COMPLETED";

    const timer =
      scenarioTimers.get(
        scenario.id
      );

    if (timer) {
      clearInterval(timer);
    }

    scenarioTimers.delete(
      scenario.id
    );

    addLog({
      status: "INFO",
      message:
        `Scenario "${scenario.name}" completed`
    });
  }

  await saveState();
}

function resetScenarioActions(
  scenario
) {
  for (
    const action
    of scenario.actions ?? []
  ) {
    action.executed = false;
  }
}

function validateScenario(
  scenario
) {
  const issues = [];

  const actions =
    scenario.actions ?? [];

  if (
    actions.length === 0
  ) {
    issues.push({
      level: "ERROR",
      message: "Scenario has no actions"
    });
  }

  for (
    const action
    of actions
  ) {
    const sensor =
      state.sensors.find(
        current =>
          current.uid ===
            action.sensorUid
      );

    if (!sensor) {
      issues.push({
        level: "ERROR",
        actionId: action.id,
        message:
          `Sensor not found: ${action.sensorUid || "(empty)"}`
      });

      continue;
    }

    if (
      [
        "SET_VALUE",
        "ENABLE_METRIC",
        "DISABLE_METRIC"
      ].includes(
        action.type
      )
    ) {
      const metric =
        sensor.metrics.find(
          current =>
            current.key ===
            action.metricKey
        );

      if (!metric) {
        issues.push({
          level: "ERROR",
          actionId: action.id,
          message:
            `Metric not found on ${sensor.uid}: ${action.metricKey || "(empty)"}`
        });
      }
    }

    if (
      action.type ===
        "SET_VALUE" &&
      (
        action.value ===
          null ||
        action.value ===
          undefined ||
        String(
          action.value
        ).trim() ===
          ""
      )
    ) {
      issues.push({
        level: "ERROR",
        actionId: action.id,
        message:
          "SET_VALUE requires a value"
      });
    }

    if (
      ![
        "SET_VALUE",
        "ENABLE_METRIC",
        "DISABLE_METRIC",
        "START_SENSOR",
        "STOP_SENSOR",
        "PUBLISH_SENSOR"
      ].includes(
        action.type
      )
    ) {
      issues.push({
        level: "ERROR",
        actionId: action.id,
        message:
          `Unknown action type: ${action.type}`
      });
    }
  }

  return {
    valid:
      issues.every(
        issue =>
          issue.level !==
          "ERROR"
      ),

    issues
  };
}

function startScenario(
  scenario
) {
  const validation =
    validateScenario(
      scenario
    );

  if (
    !validation.valid
  ) {
    scenario.status =
      "INVALID";

    addLog({
      status: "ERROR",
      message:
        `Scenario "${scenario.name}" is invalid`
    });

    return validation;
  }

  const previous =
    scenarioTimers.get(
      scenario.id
    );

  if (previous) {
    clearInterval(previous);
  }

  resetScenarioActions(
    scenario
  );

  scenario.startedAt =
    Date.now();

  scenario.pausedAt =
    null;

  scenario.elapsedBeforePause =
    0;

  scenario.status =
    "RUNNING";

  scenarioTick(
    scenario
  );

  scenarioTimers.set(
    scenario.id,
    setInterval(
      () =>
        scenarioTick(
          scenario
        ),
      1000
    )
  );

  return validation;
}

function pauseScenario(
  scenario
) {
  if (
    scenario.status !==
    "RUNNING"
  ) {
    return;
  }

  scenario.elapsedBeforePause =
    (
      scenario.elapsedBeforePause
      ?? 0
    ) +
    (
      Date.now() -
      scenario.startedAt
    );

  scenario.startedAt =
    null;

  scenario.pausedAt =
    Date.now();

  scenario.status =
    "PAUSED";

  const timer =
    scenarioTimers.get(
      scenario.id
    );

  if (timer) {
    clearInterval(timer);
  }

  scenarioTimers.delete(
    scenario.id
  );
}

function resumeScenario(
  scenario
) {
  if (
    scenario.status !==
    "PAUSED"
  ) {
    return;
  }

  scenario.startedAt =
    Date.now();

  scenario.pausedAt =
    null;

  scenario.status =
    "RUNNING";

  scenarioTimers.set(
    scenario.id,
    setInterval(
      () =>
        scenarioTick(
          scenario
        ),
      1000
    )
  );
}

function stopScenario(
  scenario
) {
  const timer =
    scenarioTimers.get(
      scenario.id
    );

  if (timer) {
    clearInterval(timer);
  }

  scenarioTimers.delete(
    scenario.id
  );

  scenario.status =
    "STOPPED";

  scenario.startedAt =
    null;

  scenario.pausedAt =
    null;

  scenario.elapsedBeforePause =
    0;

  resetScenarioActions(
    scenario
  );
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

app.post("/api/scenarios", async (req, res) => {
  const scenario = {
    id: crypto.randomUUID(),
    name: String(
      req.body.name
      || "New scenario"
    ),
    description: String(
      req.body.description
      || ""
    ),
    status: "STOPPED",
    startedAt: null,
    pausedAt: null,
    elapsedBeforePause: 0,
    actions: []
  };

  state.scenarios.push(
    scenario
  );

  await saveState();

  res.status(201).json(
    scenario
  );
});

app.patch("/api/scenarios/:id", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.id
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  if (
    req.body.name !==
    undefined
  ) {
    scenario.name =
      String(
        req.body.name
      );
  }

  if (
    req.body.description !==
    undefined
  ) {
    scenario.description =
      String(
        req.body.description
      );
  }

  await saveState();

  res.json(
    scenario
  );
});

app.delete("/api/scenarios/:id", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.id
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  stopScenario(
    scenario
  );

  state.scenarios =
    state.scenarios.filter(
      current =>
        current.id !==
        scenario.id
    );

  await saveState();

  res.sendStatus(204);
});

app.get("/api/scenarios/:id/validate", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.id
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  const result =
    validateScenario(
      scenario
    );

  res.json(
    result
  );
});

app.post("/api/scenarios/:id/start", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.id
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  const validation =
    startScenario(
      scenario
    );

  await saveState();

  if (
    validation &&
    !validation.valid
  ) {
    return res
      .status(409)
      .json({
        scenario,
        validation
      });
  }

  res.json(
    scenario
  );
});

app.post("/api/scenarios/:id/pause", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.id
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  pauseScenario(
    scenario
  );

  await saveState();

  res.json(
    scenario
  );
});

app.post("/api/scenarios/:id/resume", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.id
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  resumeScenario(
    scenario
  );

  await saveState();

  res.json(
    scenario
  );
});

app.post("/api/scenarios/:id/stop", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.id
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  stopScenario(
    scenario
  );

  await saveState();

  res.json(
    scenario
  );
});

app.post("/api/scenarios/:id/generate-ramp", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.id
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  const sensorUid =
    String(
      req.body.sensorUid
      || ""
    );

  const metricKey =
    String(
      req.body.metricKey
      || ""
    );

  const startValue =
    Number(
      req.body.startValue
    );

  const endValue =
    Number(
      req.body.endValue
    );

  const step =
    Math.abs(
      Number(
        req.body.step
      )
    );

  const everySeconds =
    Math.max(
      1,
      Number(
        req.body.everySeconds
      ) || 1
    );

  const startOffsetSeconds =
    Math.max(
      0,
      Number(
        req.body.startOffsetSeconds
      ) || 0
    );

  if (
    !sensorUid ||
    !metricKey ||
    !Number.isFinite(
      startValue
    ) ||
    !Number.isFinite(
      endValue
    ) ||
    !Number.isFinite(
      step
    ) ||
    step <= 0
  ) {
    return res
      .status(400)
      .json({
        error:
          "Invalid ramp parameters"
      });
  }

  const direction =
    endValue >= startValue
      ? 1
      : -1;

  const generated = [];

  let current =
    startValue;

  let offset =
    startOffsetSeconds;

  const decimals =
    Math.max(
      String(
        req.body.startValue
      ).split(".")[1]?.length
        ?? 0,
      String(
        req.body.endValue
      ).split(".")[1]?.length
        ?? 0,
      String(
        req.body.step
      ).split(".")[1]?.length
        ?? 0
    );

  const formatValue =
    value =>
      Number(
        value.toFixed(
          Math.min(
            decimals,
            6
          )
        )
      ).toString();

  while (
    direction > 0
      ? current <=
          endValue +
          step /
          1000
      : current >=
          endValue -
          step /
          1000
  ) {
    generated.push({
      id:
        crypto.randomUUID(),

      offsetSeconds:
        offset,

      type:
        "SET_VALUE",

      sensorUid,
      metricKey,

      sensorId:
        null,

      metricId:
        null,

      value:
        formatValue(
          current
        ),

      executed:
        false
    });

    current +=
      step *
      direction;

    offset +=
      everySeconds;

    if (
      generated.length >
      10000
    ) {
      return res
        .status(400)
        .json({
          error:
            "Ramp would generate too many actions"
        });
    }
  }

  scenario.actions.push(
    ...generated
  );

  await saveState();

  res.status(201).json({
    generated:
      generated.length,
    actions:
      generated
  });
});

app.post("/api/scenarios/:id/actions", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.id
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  const action = {
    id: crypto.randomUUID(),
    offsetSeconds:
      Math.max(
        0,
        Number(
          req.body.offsetSeconds
        ) || 0
      ),
    type:
      String(
        req.body.type
        || "SET_VALUE"
      ),
    sensorUid:
      String(
        req.body.sensorUid
        || ""
      ),
    metricKey:
      req.body.metricKey
        ? String(
            req.body.metricKey
          )
        : null,

    // Backward compatibility with SIM-005 scenarios.
    sensorId:
      req.body.sensorId
        ? String(
            req.body.sensorId
          )
        : null,
    metricId:
      req.body.metricId
        ? String(
            req.body.metricId
          )
        : null,

    value:
      req.body.value !==
        undefined
        ? String(
            req.body.value
          )
        : null,
    executed: false
  };

  scenario.actions.push(
    action
  );

  await saveState();

  res.status(201).json(
    action
  );
});

app.patch("/api/scenarios/:scenarioId/actions/:actionId", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.scenarioId
    );

  const action =
    scenario?.actions.find(
      current =>
        current.id ===
        req.params.actionId
    );

  if (!action) {
    return res.sendStatus(404);
  }

  if (
    req.body.offsetSeconds !==
    undefined
  ) {
    action.offsetSeconds =
      Math.max(
        0,
        Number(
          req.body.offsetSeconds
        ) || 0
      );
  }

  if (
    req.body.type !==
    undefined
  ) {
    action.type =
      String(
        req.body.type
      );
  }

  if (
    req.body.sensorUid !==
    undefined
  ) {
    action.sensorUid =
      String(
        req.body.sensorUid
      );

    action.sensorId =
      null;
  }

  if (
    req.body.metricKey !==
    undefined
  ) {
    action.metricKey =
      req.body.metricKey
        ? String(
            req.body.metricKey
          )
        : null;

    action.metricId =
      null;
  }

  if (
    req.body.sensorId !==
    undefined
  ) {
    action.sensorId =
      String(
        req.body.sensorId
      );
  }

  if (
    req.body.metricId !==
    undefined
  ) {
    action.metricId =
      req.body.metricId
        ? String(
            req.body.metricId
          )
        : null;
  }

  if (
    req.body.value !==
    undefined
  ) {
    action.value =
      req.body.value ===
        null
        ? null
        : String(
            req.body.value
          );
  }

  action.executed =
    false;

  await saveState();

  res.json(
    action
  );
});

app.delete("/api/scenarios/:scenarioId/actions/:actionId", async (req, res) => {
  const scenario =
    state.scenarios.find(
      current =>
        current.id ===
        req.params.scenarioId
    );

  if (!scenario) {
    return res.sendStatus(404);
  }

  scenario.actions =
    scenario.actions.filter(
      current =>
        current.id !==
        req.params.actionId
    );

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
