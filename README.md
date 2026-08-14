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
