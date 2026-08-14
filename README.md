# SensorSphere Simulator — SIM-002

Autonomous MQTT sensor simulator for SensorSphere testing.

## Features

- Multiple simulated sensors
- Arbitrary metrics per sensor
- Enable/disable each metric
- Editable values while running
- Per-sensor publication interval
- Start/stop/publish-now per sensor
- Start/stop/publish-all globally
- Persistent JSON configuration
- Persistent MQTT connection
- Publication log
- Docker deployment

## Start

```bash
docker compose -f docker-compose.simulator.yml up -d --build
```

Open:

```text
http://<VPS-IP>:8090
```

## MQTT configuration

Defaults:

- broker: `100.64.0.9`
- port: `1883`
- topic prefix: `sensors/ble_gateway/sensor`

Override before starting:

```bash
export SIMULATOR_MQTT_HOST=100.64.0.9
export SIMULATOR_MQTT_PORT=1883
docker compose -f docker-compose.simulator.yml up -d --build
```

Topics are generated as:

```text
sensors/ble_gateway/sensor/<metric>_<sensor_uid>/state
```

Example:

```text
sensors/ble_gateway/sensor/temperature_11_22_33/state
```

## Notes

Sensors intentionally start in STOPPED state after application restart.
Configuration and logs are stored in `data/simulator.json`.


## SIM-002 generation modes

Each metric supports four modes:

- `Manual`: publish the current value unchanged.
- `Random`: generate a value between Min and Max on every publication.
- `Ramp`: change by Step between Start and End, then reverse direction.
- `Timeline`: use time/value points relative to the moment the sensor starts.

Example timeline:

```text
0 s     20
60 s    24
120 s   28
300 s   35
600 s   20
```

Timeline mode is useful for automated validation of SensorSphere alert thresholds,
`durationSeconds`, `cooldownSeconds`, `NO_DATA` and recovery behavior.


## Build identification

From SIM-004 onward, every Simulator patch increments both:

```text
SIMULATOR_VERSION=SIM-004
SIMULATOR_BUILD=004
```

The value is visible in the application header and in container startup logs.

The HTTP server also sends `no-store` cache headers for the development UI,
to prevent stale JavaScript/CSS after rebuilding the container.


## SIM-005 scenarios

SIM-005 adds first-class reusable scenarios.

Supported scenario actions:

- `SET_VALUE`
- `ENABLE_METRIC`
- `DISABLE_METRIC`
- `START_SENSOR`
- `STOP_SENSOR`
- `PUBLISH_SENSOR`

Each action has an offset in seconds relative to scenario start.

Scenario states:

- `STOPPED`
- `RUNNING`
- `PAUSED`
- `COMPLETED`

Scenarios and actions are persisted in `data/simulator.json`.


## SIM-006 scenario portability

Scenario actions now persist readable identifiers:

```json
{
  "sensorUid": "11_22_33",
  "metricKey": "temperature"
}
```

instead of relying on internal UUIDs.

SIM-005 scenario actions using `sensorId` / `metricId` remain supported and
are migrated to UID/key references when the state file is loaded.

SIM-006 also prevents the automatic UI refresh from rebuilding scenario forms
while an input/select/textarea inside a scenario has focus.


## SIM-007 scenario validation and ramp generator

SIM-007 adds:

- `Validate` button for scenarios.
- Invalid sensor/metric references are detected before execution.
- Invalid scenarios cannot be started.
- `Generate ramp` creates a sequence of `SET_VALUE` actions automatically.

Example:

```text
Sensor: 11_22_33
Metric: temperature
Start: 25
End: 31
Step: 0.5
Every: 15 seconds
Start at: 0 seconds
```

This generates 13 actions from 25.0 through 31.0.


## SIM-008 ramp editor refresh protection

An open Ramp Generator is now considered an active editing session even when
no input currently has focus. Automatic polling continues to fetch API state
and logs, but the scenario DOM is not rebuilt until the Ramp Generator is
closed or a ramp has been generated.

This prevents Start / End / Step / Every / Start-at values from being reset
during editing.


## SIM-009 tabs and scenario/basic arbitration

The UI is split into three persisted tabs:

- Basic injection
- Scenarios
- Publication log

When a scenario is RUNNING or PAUSED, every sensorUid + metricKey pair
controlled by SET_VALUE, ENABLE_METRIC or DISABLE_METRIC is locked for
Basic Injection.

Basic Injection skips only the locked metric. Other metrics on the same
sensor continue publishing. SET_VALUE scenario actions publish directly
to MQTT. When the scenario becomes COMPLETED or STOPPED, the lock is
released and Basic Injection resumes on the next normal cycle.


## SIM-010 scenario runtime lock

Scenario configuration is read-only while status is RUNNING or PAUSED.

- RUNNING: Pause and Stop remain available.
- PAUSED: Resume and Stop remain available.
- Editing, deletion, validation, ramp generation and action changes are locked.
- The API also rejects edits with HTTP 409 until the scenario is stopped.


## SIM-011 scenario completion and runtime restore

SIM-011 snapshots each metric controlled by a scenario before execution.

When the scenario reaches `COMPLETED` or is explicitly `STOPPED`, the original
Basic Injection state is restored:

- value
- enabled state
- mode
- random/ramp/timeline generator configuration

This means a scenario's final `SET_VALUE` no longer becomes the permanent
Basic Injection value.

The scenario UI also displays:

- `Started at`
- `Expected end`
- `Elapsed`

`Expected end` is derived from the largest action offset.
