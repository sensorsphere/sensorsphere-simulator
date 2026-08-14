let current;

async function api(url, options={}) {
  const response = await fetch(url, {
    headers: {"Content-Type":"application/json"},
    ...options
  });
  if (!response.ok && response.status !== 204) throw new Error(await response.text());
  return response.status === 204 ? null : response.json();
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function isEditingSensorForm() {
  const active =
    document.activeElement;

  return Boolean(
    active &&
    (
      active.tagName === "INPUT" ||
      active.tagName === "SELECT" ||
      active.tagName === "TEXTAREA"
    ) &&
    active.closest(".sensor")
  );
}

async function refresh() {
  try {
    current =
      await api(
        "/api/state"
      );

    renderStatus();

    // Do not rebuild sensor forms while the user is typing.
    // Replacing the DOM would move focus/cursor and interrupt input.
    if (!isEditingSensorForm()) {
      renderSensors();
    }

    renderScenarios();
    renderLogFilters();
    renderLogs();

  } catch (e) {
    const mqtt =
      document.getElementById(
        "mqtt"
      );

    mqtt.className =
      "status disconnected";

    mqtt.textContent =
      "API disconnected";
  }
}

function renderStatus() {
  const buildVersion =
    document.getElementById(
      "buildVersion"
    );

  if (
    buildVersion &&
    current.application
  ) {
    buildVersion.textContent =
      `${current.application.version} · build ${current.application.build}`;
  }

  const mqtt =
    document.getElementById(
      "mqtt"
    );

  mqtt.className =
    `status ${
      current.mqtt.connected
        ? "connected"
        : "disconnected"
    }`;

  mqtt.textContent =
    current.mqtt.connected
      ? "● MQTT connected"
      : "● MQTT disconnected";
}

function renderSensors() {
  document.getElementById("sensors").innerHTML = current.sensors.map(sensor => `
    <section class="sensor">
      <div class="sensor-head">
        <div class="grow">
          <h2>${esc(sensor.name)}</h2>
          <small>
            UID: ${esc(sensor.uid)} ·
            <span class="sensor-status ${sensor.enabled?"running":"stopped"}">
              ${sensor.enabled?"RUNNING":"STOPPED"}
            </span>
          </small>
        </div>
        <button
          class="${sensor.enabled?"btn-stop":"btn-start"}"
          onclick="sensorAction('${sensor.id}','${sensor.enabled?"stop":"start"}')"
        >
          ${sensor.enabled?"■ Stop":"▶ Start"}
        </button>
        <button
          class="btn-publish"
          onclick="sensorAction('${sensor.id}','publish')"
        >
          Publish now
        </button>
        <button class="danger" onclick="deleteSensor('${sensor.id}')">Delete</button>
      </div>
      <div class="config">
        <label>Name <input value="${esc(sensor.name)}" onchange="patchSensor('${sensor.id}',{name:this.value})"></label>
        <label>UID <input value="${esc(sensor.uid)}" onchange="patchSensor('${sensor.id}',{uid:this.value})"></label>
        <label>Interval <input class="interval" type="number" min="1" value="${sensor.intervalSeconds}" onchange="patchSensor('${sensor.id}',{intervalSeconds:Number(this.value)})"> s</label>
      </div>
      <div class="metrics">
        ${sensor.metrics.map(metric => `
          <div class="metric-card">
            <div class="metric-main">
              <input class="switch" type="checkbox" ${metric.enabled?"checked":""} onchange="patchMetric('${sensor.id}','${metric.id}',{enabled:this.checked})" title="Enable metric">
              <input value="${esc(metric.key)}" onchange="patchMetric('${sensor.id}','${metric.id}',{key:this.value})" placeholder="metric key">
              <input value="${esc(metric.value)}" onchange="patchMetric('${sensor.id}','${metric.id}',{value:this.value})" placeholder="value">
              <input value="${esc(metric.unit)}" onchange="patchMetric('${sensor.id}','${metric.id}',{unit:this.value})" placeholder="unit">
              <select onchange="patchMetric('${sensor.id}','${metric.id}',{mode:this.value})">
                <option value="manual" ${metric.mode==="manual"?"selected":""}>Manual</option>
                <option value="random" ${metric.mode==="random"?"selected":""}>Random</option>
                <option value="ramp" ${metric.mode==="ramp"?"selected":""}>Ramp</option>
                <option value="timeline" ${metric.mode==="timeline"?"selected":""}>Timeline</option>
              </select>
              <button class="danger" onclick="deleteMetric('${sensor.id}','${metric.id}')">×</button>
            </div>

            ${metric.mode==="random" ? `
              <div class="mode-config">
                <label>Min <input value="${esc(metric.randomMin)}" onchange="patchMetric('${sensor.id}','${metric.id}',{randomMin:this.value})"></label>
                <label>Max <input value="${esc(metric.randomMax)}" onchange="patchMetric('${sensor.id}','${metric.id}',{randomMax:this.value})"></label>
                <span>New random value on every publish</span>
              </div>` : ""}

            ${metric.mode==="ramp" ? `
              <div class="mode-config">
                <label>Start <input value="${esc(metric.rampStart)}" onchange="patchMetric('${sensor.id}','${metric.id}',{rampStart:this.value,value:this.value})"></label>
                <label>End <input value="${esc(metric.rampEnd)}" onchange="patchMetric('${sensor.id}','${metric.id}',{rampEnd:this.value})"></label>
                <label>Step <input value="${esc(metric.rampStep)}" onchange="patchMetric('${sensor.id}','${metric.id}',{rampStep:this.value})"></label>
                <span>Ping-pong ramp on each publish</span>
              </div>` : ""}

            ${metric.mode==="timeline" ? `
              <div class="mode-config timeline-editor">
                <div class="timeline-title">
                  <strong>Timeline</strong>
                  <button onclick="addTimelinePoint('${sensor.id}','${metric.id}')">+ Point</button>
                </div>
                ${(metric.timeline||[]).sort((a,b)=>a.offsetSeconds-b.offsetSeconds).map((point,index)=>`
                  <div class="timeline-point">
                    <label>At <input type="number" min="0" value="${point.offsetSeconds}" onchange="updateTimelinePoint('${sensor.id}','${metric.id}',${index},'offsetSeconds',Number(this.value))"> s</label>
                    <label>Value <input value="${esc(point.value)}" onchange="updateTimelinePoint('${sensor.id}','${metric.id}',${index},'value',this.value)"></label>
                    <button class="danger" onclick="deleteTimelinePoint('${sensor.id}','${metric.id}',${index})">×</button>
                  </div>`).join("")}
              </div>` : ""}

            <div class="topic">${esc(`sensors/ble_gateway/sensor/${metric.key}_${sensor.uid}/state`)}</div>
          </div>`).join("")}
      </div>
      <button class="addmetric" onclick="addMetric('${sensor.id}')">+ Add metric</button>
    </section>`).join("");

}

function scenarioElapsed(
  scenario
) {
  if (
    scenario.status ===
    "PAUSED"
  ) {
    return Math.floor(
      (
        scenario.elapsedBeforePause
        || 0
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
      Date.now() -
      scenario.startedAt +
      (
        scenario.elapsedBeforePause
        || 0
      )
    ) /
    1000
  );
}

function actionSensorOptions(
  selectedId
) {
  return current.sensors
    .map(
      sensor =>
        `<option value="${sensor.id}" ${
          sensor.id === selectedId
            ? "selected"
            : ""
        }>${esc(sensor.name)} · ${esc(sensor.uid)}</option>`
    )
    .join("");
}

function actionMetricOptions(
  sensorId,
  selectedId
) {
  const sensor =
    current.sensors.find(
      currentSensor =>
        currentSensor.id ===
        sensorId
    );

  return (sensor?.metrics || [])
    .map(
      metric =>
        `<option value="${metric.id}" ${
          metric.id === selectedId
            ? "selected"
            : ""
        }>${esc(metric.key)}</option>`
    )
    .join("");
}

function scenarioActionNeedsMetric(
  type
) {
  return [
    "SET_VALUE",
    "ENABLE_METRIC",
    "DISABLE_METRIC"
  ].includes(type);
}

function renderScenarios() {
  const target =
    document.getElementById(
      "scenarios"
    );

  if (!target) {
    return;
  }

  if (
    !current.scenarios ||
    current.scenarios.length === 0
  ) {
    target.innerHTML =
      `<div class="empty-state">
        No scenarios yet. Create one to automate alert and recovery tests.
      </div>`;
    return;
  }

  target.innerHTML =
    current.scenarios.map(
      scenario => {

        const elapsed =
          scenarioElapsed(
            scenario
          );

        const statusClass =
          `scenario-${String(
            scenario.status
          ).toLowerCase()}`;

        const actions =
          [...(scenario.actions || [])]
            .sort(
              (left, right) =>
                left.offsetSeconds -
                right.offsetSeconds
            );

        return `
          <article class="scenario-card">

            <div class="scenario-head">
              <div class="grow">

                <input
                  class="scenario-name"
                  value="${esc(scenario.name)}"
                  onchange="patchScenario('${scenario.id}',{name:this.value})"
                >

                <input
                  class="scenario-description"
                  value="${esc(scenario.description || "")}"
                  placeholder="Description"
                  onchange="patchScenario('${scenario.id}',{description:this.value})"
                >

              </div>

              <span class="scenario-status ${statusClass}">
                ${esc(scenario.status)}
              </span>

              <span class="scenario-elapsed">
                ${elapsed}s
              </span>

              ${
                scenario.status === "RUNNING"
                  ? `<button class="btn-pause" onclick="scenarioAction('${scenario.id}','pause')">Pause</button>`
                  : scenario.status === "PAUSED"
                    ? `<button class="btn-start" onclick="scenarioAction('${scenario.id}','resume')">Resume</button>`
                    : `<button class="btn-start" onclick="scenarioAction('${scenario.id}','start')">Start</button>`
              }

              <button
                class="btn-stop"
                onclick="scenarioAction('${scenario.id}','stop')"
              >
                Stop
              </button>

              <button
                class="danger"
                onclick="deleteScenario('${scenario.id}')"
              >
                Delete
              </button>

            </div>

            <div class="scenario-actions">
              ${
                actions.length === 0
                  ? `<div class="empty-inline">No actions configured.</div>`
                  : actions.map(
                      action => {

                        const needsMetric =
                          scenarioActionNeedsMetric(
                            action.type
                          );

                        return `
                          <div class="scenario-action">

                            <label>
                              At
                              <input
                                type="number"
                                min="0"
                                value="${action.offsetSeconds}"
                                onchange="patchScenarioAction('${scenario.id}','${action.id}',{offsetSeconds:Number(this.value)})"
                              >
                              s
                            </label>

                            <select
                              onchange="patchScenarioAction('${scenario.id}','${action.id}',{type:this.value})"
                            >
                              <option value="SET_VALUE" ${action.type==="SET_VALUE"?"selected":""}>Set value</option>
                              <option value="ENABLE_METRIC" ${action.type==="ENABLE_METRIC"?"selected":""}>Enable metric</option>
                              <option value="DISABLE_METRIC" ${action.type==="DISABLE_METRIC"?"selected":""}>Disable metric</option>
                              <option value="START_SENSOR" ${action.type==="START_SENSOR"?"selected":""}>Start sensor</option>
                              <option value="STOP_SENSOR" ${action.type==="STOP_SENSOR"?"selected":""}>Stop sensor</option>
                              <option value="PUBLISH_SENSOR" ${action.type==="PUBLISH_SENSOR"?"selected":""}>Publish sensor</option>
                            </select>

                            <select
                              onchange="patchScenarioAction('${scenario.id}','${action.id}',{sensorId:this.value,metricId:null})"
                            >
                              ${actionSensorOptions(action.sensorId)}
                            </select>

                            ${
                              needsMetric
                                ? `<select
                                    onchange="patchScenarioAction('${scenario.id}','${action.id}',{metricId:this.value})"
                                  >
                                    ${actionMetricOptions(action.sensorId, action.metricId)}
                                  </select>`
                                : `<span class="action-placeholder">—</span>`
                            }

                            ${
                              action.type === "SET_VALUE"
                                ? `<input
                                    class="action-value"
                                    value="${esc(action.value ?? "")}"
                                    placeholder="value"
                                    onchange="patchScenarioAction('${scenario.id}','${action.id}',{value:this.value})"
                                  >`
                                : `<span class="action-placeholder">—</span>`
                            }

                            <button
                              class="danger"
                              onclick="deleteScenarioAction('${scenario.id}','${action.id}')"
                            >
                              ×
                            </button>

                          </div>
                        `;
                      }
                    )
                    .join("")
              }
            </div>

            <button
              class="addmetric"
              onclick="addScenarioAction('${scenario.id}')"
            >
              + Add action
            </button>

          </article>
        `;
      }
    )
    .join("");
}

function setSelectOptions(
  id,
  values,
  allLabel
) {
  const select =
    document.getElementById(id);

  if (!select) {
    return;
  }

  const previous =
    select.value;

  select.innerHTML =
    [
      `<option value="">${esc(allLabel)}</option>`,
      ...values.map(
        value =>
          `<option value="${esc(value)}">${esc(value)}</option>`
      )
    ].join("");

  if (
    values.includes(previous)
  ) {
    select.value =
      previous;
  }
}

function renderLogFilters() {
  const sensors =
    [...new Set(
      current.logs
        .map(log => log.sensor)
        .filter(Boolean)
    )]
    .sort();

  const metrics =
    [...new Set(
      current.logs
        .map(log => log.metric)
        .filter(Boolean)
    )]
    .sort();

  setSelectOptions(
    "logSensor",
    sensors,
    "All sensors"
  );

  setSelectOptions(
    "logMetric",
    metrics,
    "All metrics"
  );
}

function renderLogs() {
  const periodMinutes =
    Number(
      document.getElementById(
        "logPeriod"
      )?.value ?? 5
    );

  const sensorFilter =
    document.getElementById(
      "logSensor"
    )?.value ?? "";

  const metricFilter =
    document.getElementById(
      "logMetric"
    )?.value ?? "";

  const statusFilter =
    document.getElementById(
      "logStatus"
    )?.value ?? "";

  const cutoff =
    Date.now() -
    periodMinutes *
    60 *
    1000;

  const logs =
    current.logs.filter(
      log =>
        new Date(
          log.time
        ).getTime() >= cutoff &&
        (
          !sensorFilter ||
          log.sensor ===
            sensorFilter
        ) &&
        (
          !metricFilter ||
          log.metric ===
            metricFilter
        ) &&
        (
          !statusFilter ||
          log.status ===
            statusFilter
        )
    );

  const count =
    document.getElementById(
      "logCount"
    );

  if (count) {
    count.textContent =
      `${logs.length} event${
        logs.length === 1
          ? ""
          : "s"
      }`;
  }

  document.getElementById(
    "logRows"
  ).innerHTML =
    logs.map(
      log => `
        <tr>
          <td>${new Date(log.time).toLocaleTimeString()}</td>
          <td>${esc(log.sensor||"—")}</td>
          <td>${esc(log.metric||"—")}</td>
          <td>${esc(log.value||"—")}</td>
          <td>
            <span class="log-status status-${String(log.status).toLowerCase()}">
              ${esc(log.status)}
            </span>
          </td>
          <td class="topic">${esc(log.topic||log.message||"")}</td>
        </tr>`
    )
    .join("");
}

async function action(url){ await api(url,{method:"POST"}); await refresh(); }
async function sensorAction(id, actionName){ await action(`/api/sensors/${id}/${actionName}`); }
async function patchSensor(id, body){ await api(`/api/sensors/${id}`,{method:"PATCH",body:JSON.stringify(body)}); await refresh(); }
async function patchMetric(sid, mid, body){ await api(`/api/sensors/${sid}/metrics/${mid}`,{method:"PATCH",body:JSON.stringify(body)}); await refresh(); }

async function addSensor(){
  const n = current.sensors.length + 1;
  await api("/api/sensors",{method:"POST",body:JSON.stringify({name:`Test Sensor ${String(n).padStart(2,"0")}`,uid:`test_${String(n).padStart(2,"0")}`,intervalSeconds:15})});
  await refresh();
}
async function deleteSensor(id){
  if(!confirm("Delete this sensor?")) return;
  await api(`/api/sensors/${id}`,{method:"DELETE"}); await refresh();
}
async function addMetric(id){
  await api(`/api/sensors/${id}/metrics`,{method:"POST",body:JSON.stringify({key:"temperature",value:"20",unit:"°C",enabled:true})}); await refresh();
}
async function deleteMetric(sid,mid){
  await api(`/api/sensors/${sid}/metrics/${mid}`,{method:"DELETE"}); await refresh();
}
async function addTimelinePoint(sensorId, metricId){
  const sensor = current.sensors.find(s => s.id === sensorId);
  const metric = sensor?.metrics.find(m => m.id === metricId);
  if(!metric) return;

  const timeline = [...(metric.timeline || [])];
  const last = timeline[timeline.length - 1];

  timeline.push({
    offsetSeconds: last ? Number(last.offsetSeconds) + 60 : 0,
    value: metric.value
  });

  await patchMetric(sensorId, metricId, {timeline});
}

async function updateTimelinePoint(sensorId, metricId, index, field, value){
  const sensor = current.sensors.find(s => s.id === sensorId);
  const metric = sensor?.metrics.find(m => m.id === metricId);
  if(!metric) return;

  const timeline = [...(metric.timeline || [])];
  timeline[index] = {...timeline[index], [field]: value};

  await patchMetric(sensorId, metricId, {timeline});
}

async function deleteTimelinePoint(sensorId, metricId, index){
  const sensor = current.sensors.find(s => s.id === sensorId);
  const metric = sensor?.metrics.find(m => m.id === metricId);
  if(!metric) return;

  const timeline = [...(metric.timeline || [])];
  timeline.splice(index, 1);

  await patchMetric(sensorId, metricId, {timeline});
}

async function addScenario(){
  await api(
    "/api/scenarios",
    {
      method:"POST",
      body:JSON.stringify({
        name:`Scenario ${(current.scenarios?.length || 0) + 1}`,
        description:""
      })
    }
  );

  await refresh();
}

async function patchScenario(id, body){
  await api(
    `/api/scenarios/${id}`,
    {
      method:"PATCH",
      body:JSON.stringify(body)
    }
  );

  await refresh();
}

async function deleteScenario(id){
  if(!confirm("Delete this scenario?")) return;

  await api(
    `/api/scenarios/${id}`,
    {
      method:"DELETE"
    }
  );

  await refresh();
}

async function scenarioAction(id, actionName){
  await api(
    `/api/scenarios/${id}/${actionName}`,
    {
      method:"POST"
    }
  );

  await refresh();
}

async function addScenarioAction(scenarioId){
  const firstSensor =
    current.sensors[0];

  if(!firstSensor){
    alert("Create at least one sensor first.");
    return;
  }

  const firstMetric =
    firstSensor.metrics?.[0];

  await api(
    `/api/scenarios/${scenarioId}/actions`,
    {
      method:"POST",
      body:JSON.stringify({
        offsetSeconds:0,
        type:"SET_VALUE",
        sensorId:firstSensor.id,
        metricId:firstMetric?.id || null,
        value:firstMetric?.value ?? ""
      })
    }
  );

  await refresh();
}

async function patchScenarioAction(scenarioId, actionId, body){
  await api(
    `/api/scenarios/${scenarioId}/actions/${actionId}`,
    {
      method:"PATCH",
      body:JSON.stringify(body)
    }
  );

  await refresh();
}

async function deleteScenarioAction(scenarioId, actionId){
  await api(
    `/api/scenarios/${scenarioId}/actions/${actionId}`,
    {
      method:"DELETE"
    }
  );

  await refresh();
}

async function clearLogs(){ await api("/api/logs",{method:"DELETE"}); await refresh(); }

refresh();
setInterval(refresh, 3000);
