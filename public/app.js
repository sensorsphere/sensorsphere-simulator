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

async function clearLogs(){ await api("/api/logs",{method:"DELETE"}); await refresh(); }

refresh();
setInterval(refresh, 3000);
