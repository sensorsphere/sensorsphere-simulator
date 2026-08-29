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
docker compose up -d --build
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
docker compose up -d --build
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


## Instance identification

Each Simulator instance can be given a friendly name with:

```text
APP_INSTANCE_NAME=DEV
```

The default is `DEV`. The instance name is visible in the application header and
in container startup logs, which makes multiple Simulator deployments easier to
distinguish.

The MQTT status badge also displays the effective broker endpoint, for example
`MQTT 100.64.0.9:1883 connected`.

The HTTP server sends `no-store` cache headers for the development UI,
to prevent stale JavaScript/CSS after rebuilding the container.

Publication log retention is configurable with:

```text
LOG_RETENTION_MINUTES=60
LOG_LIMIT=10000
```

By default, log entries are retained for up to 60 minutes, with a hard safety cap
of 10,000 entries. Age-based retention is applied before the entry-count limit, so
short Publication log filters such as `Last 5 minutes` are not truncated merely
because many MQTT messages were published during that period.


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


## SIM-012 scenario controls and Basic Injection lock styling

Scenario runtime controls are now displayed first:

1. Start / Pause / Resume
2. Stop
3. Validate
4. Generate ramp
5. Delete

In Basic Injection, a metric controlled by a RUNNING or PAUSED scenario is now
fully greyed out and its controls are disabled. The banner also displays the
scenario name controlling that metric.

When the scenario ends or is stopped, the metric automatically returns to its
normal editable appearance.

## SIM-014 branding fix

Adds the missing SVG branding asset and fixes the favicon HTML newline.

## SIM-015 favicon compatibility

Adds cache-busted favicon references and PNG fallbacks:

- SVG favicon: `/sensorsphere-simulator.svg?v=15`
- PNG favicon: `/favicon-32.png?v=15`
- shortcut icon fallback
- Apple touch icon: `/apple-touch-icon.png?v=15`

This avoids stale browser favicon caches and improves compatibility.

## SIM-016 copy Basic Injection and scenarios

Basic Injection sensors can now be duplicated with `Copy`.

The copy:
- is named `Copy of <source name>`;
- is created STOPPED;
- receives new sensor and metric IDs;
- preserves metric configuration;
- receives a unique MQTT UID using `_copy`, `_copy_2`, etc.

Scenarios can also be duplicated with `Copy`.

The copied scenario:
- is named `Copy of <source name>`;
- is created STOPPED;
- receives new scenario/action IDs;
- resets action execution state;
- preserves sensorUid / metricKey references and scenario configuration.

## SIM-017 tab icons

Adds inline SVG icons to the three main Simulator tabs:

- Basic injection
- Scenarios
- Publication log

No external icon package or web dependency is required.

## SIM-018 persistent Basic Injection state

Basic Injection RUNNING / STOPPED state is now persisted in `data/simulator.json`.

At backend startup:
- sensors persisted with `enabled: true` are automatically restarted;
- their publication timers are recreated using their configured interval;
- sensors persisted with `enabled: false` remain stopped;
- an INFO publication log entry records each automatic restart.

This applies to backend/container restarts as long as the simulator data volume is preserved.

## SIM-019 collapsible cards

Basic Injection and Scenario cards can be collapsed independently. The card header
and runtime/action controls remain visible while details are hidden. Collapse state
is persisted per browser in localStorage and restored after refresh.

## SIM-020 folders and portable libraries

SIM-020 adds organization and portability for both Basic injections and Scenarios.

Each tab has an independent folder tree with:

- nested folders
- create / rename / delete
- direct item counts
- `All` and `Unfiled` views
- per-item folder assignment

Deleting a folder never deletes Basic injections or Scenarios. Direct items and child
folders are moved to the deleted folder's parent (or to `Unfiled` at the root).

Basic injections and Scenarios can be exported/imported as versioned JSON documents:

```json
{
  "format": "sensorsphere-simulator",
  "version": 1,
  "type": "basic-injections",
  "folders": [],
  "items": []
}
```

Imports always create new internal UUIDs so they do not overwrite existing content.
Imported Basic injections are STOPPED and imported Scenarios are reset to STOPPED.

A Basic injection metric can also define an optional exact MQTT `topic`. When present,
it overrides the generated `<topicPrefix>/<metric>_<uid>/state` topic. This is useful
for gateway metadata topics that do not include a sensor UID.

The example file:

```text
examples/basic-injections-ble-gateway-t1-t2.json
```

contains two gateways:

- `BLE Gateway MQTT T1` / `ble-gateway-t1`
- `BLE Gateway MQTT T2` / `ble-gateway-t2`

Both publish gateway metadata with WiFi SSID `WifiTest` and observe the same three BLE
sensor UIDs. Their RSSI values are deliberately different so Gateway Coverage can
produce different gateway recommendations. Start the imported injections and allow
roughly 80 seconds at the configured 10-second interval to exceed an 8-sample
recommendation minimum.
