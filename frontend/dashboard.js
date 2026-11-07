const SESSION_KEY = "lgmc.uiSession.v1";
const NODES = ["START", "MEMORY", "INTENT ANALYZER", "KNOWLEDGE RETRIEVER", "ROUTER", "BILLING", "TECHNICAL SUPPORT", "ORDER", "ACCOUNT", "GENERAL", "RESPONSE", "END"];
const NODE_IDS = {
    "START": "node-start", "MEMORY": "node-memory", "INTENT ANALYZER": "node-intent",
    "KNOWLEDGE RETRIEVER": "node-retrieval", "ROUTER": "node-router",
    "BILLING": "node-billing", "TECHNICAL SUPPORT": "node-tech", "ORDER": "node-order",
    "ACCOUNT": "node-account", "GENERAL": "node-general", "RESPONSE": "node-response", "END": "node-end"
};
const NODE_INFO = {
    "START": ["LangGraph entry point. The workflow begins with the user's input.", "User request", "Initial state", "Intent Analyzer"],
    "MEMORY": ["Loads recent successful turns from this session's persistent SQLite conversation store.", "session_id", "memory_context, current_node, step_count", "Intent Analyzer"],
    "INTENT ANALYZER": ["Classifies the request using Gemini when configured, otherwise deterministic keyword routing.", "input", "intent, confidence, reasoning, current_node, step_count", "Conditional Router"],
    "KNOWLEDGE RETRIEVER": ["Searches indexed local documents with SQLite full-text search and returns matched chunks as citations.", "input", "sources, documents_retrieved, tools_used", "Conditional Router"],
    "ROUTER": ["A conditional edge—not a graph node—chooses exactly one specialist after retrieval.", "intent", "selected_route (trace projection)", "One specialist agent"],
    "BILLING": ["Specialist branch for payment and billing requests; cannot access external payment systems.", "input, intent, sources", "selected_route, current_node, step_count", "Response Generator"],
    "TECHNICAL SUPPORT": ["Specialist branch for technical/application requests; cannot inspect external logs.", "input, intent, sources", "selected_route, current_node, step_count", "Response Generator"],
    "ORDER": ["Specialist branch for order and delivery requests; no order-management API is connected.", "input, intent, sources", "selected_route, current_node, step_count", "Response Generator"],
    "ACCOUNT": ["Specialist branch for account and credential requests; cannot access external accounts.", "input, intent, sources", "selected_route, current_node, step_count", "Response Generator"],
    "GENERAL": ["Fallback specialist branch for requests without a matching category.", "input, intent, sources", "selected_route, current_node, step_count", "Response Generator"],
    "RESPONSE": ["Generates a grounded response with Gemini when configured or deterministic guidance in fallback mode.", "input, intent, sources, memory_context", "response, response_mode, tokens_used", "END"],
    "END": ["Terminates the graph run and emits the final state and summary.", "Final graph state", "status: Completed", "Workflow complete"]
};
const EDGES = {
    "START": ["edge-start-memory"],
    "MEMORY": ["edge-memory-intent"],
    "INTENT ANALYZER": ["edge-intent-retrieval"],
    "KNOWLEDGE RETRIEVER": ["edge-retrieval-router"],
    "ROUTER": [],
    "BILLING": ["edge-router-billing"],
    "TECHNICAL SUPPORT": ["edge-router-tech"],
    "ORDER": ["edge-router-order"],
    "ACCOUNT": ["edge-router-account"],
    "GENERAL": ["edge-router-general"],
    "RESPONSE": ["edge-resp-end"],
    "END": []
};
const ROUTE_EDGE = {
    "BILLING": "edge-router-billing",
    "TECHNICAL SUPPORT": "edge-router-tech",
    "ORDER": "edge-router-order",
    "ACCOUNT": "edge-router-account",
    "GENERAL": "edge-router-general"
};
const MERGE_EDGE = {
    "BILLING": "edge-billing-resp",
    "TECHNICAL SUPPORT": "edge-tech-resp",
    "ORDER": "edge-order-resp",
    "ACCOUNT": "edge-account-resp",
    "GENERAL": "edge-general-resp"
};
const state = {
    source: null, timer: null, startedAt: 0, activeRun: null, steps: [],
    completed: new Set(), selectedNode: "START", backendOnline: null, modelMode: "Unknown",
    sessionId: getSessionId(), lastEventAt: 0, lastAgentState: {}, lastRunId: null
};

function getSessionId() {
    try {
        let id = localStorage.getItem(SESSION_KEY);
        if (!id) {
            id = typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
            localStorage.setItem(SESSION_KEY, id);
        }
        return id;
    } catch {
        return `ui-${Date.now().toString(36)}`;
    }
}

function byId(id) { return document.getElementById(id); }
function elapsedText(ms) { return Number.isFinite(ms) && ms >= 0 ? `${(ms / 1000).toFixed(2)}s` : "—"; }
function timeText(value = Date.now()) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }
function setText(id, value) { const el = byId(id); if (el) el.textContent = value == null ? "—" : String(value); }

async function apiJSON(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", ...options });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${response.status})`);
    }
    return response.json();
}

async function renderMetrics() {
    setText("session-id", state.sessionId.slice(0, 15));
    try {
        const [metrics, history] = await Promise.all([
            apiJSON("/api/analytics"),
            apiJSON(`/api/agent/history?session_id=${encodeURIComponent(state.sessionId)}&limit=4`)
        ]);
        setText("metric-total", metrics.total_runs ?? 0);
        setText("metric-success", metrics.successful_runs ?? 0);
        setText("metric-failed", metrics.failed_runs ?? 0);
        setText("metric-latency", metrics.avg_latency_ms == null ? "—" : elapsedText(metrics.avg_latency_ms));
        setText("metric-tokens", metrics.tokens_used == null ? "Not reported" : metrics.tokens_used.toLocaleString());
        setText("metric-knowledge", metrics.documents ?? 0);
        renderHistory(history.runs || []);
    } catch (error) {
        renderHistory([]);
        showError(`Live metrics are unavailable: ${error.message}`);
    }
}

function renderHistory(runs) {
    const list = byId("history-list");
    if (!list) return;
    list.replaceChildren();
    if (!runs.length) {
        const empty = document.createElement("p");
        empty.className = "muted-empty";
        empty.textContent = "No runs recorded for this session.";
        list.append(empty);
        return;
    }
    runs.forEach(run => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "history-run";
        button.textContent = `${run.intent || "Run"} · ${String(run.input || "").slice(0, 30)}`;
        button.title = run.input || "";
        button.addEventListener("click", () => restoreRun(run));
        list.append(button);
    });
}

function restoreRun(run) {
    resetDisplay();
    state.steps = [];
    const steps = Array.isArray(run.steps) ? run.steps : [];
    steps.forEach(renderStep);
    setText("response-req-text", run.input || "");
    setText("response-ans-text", run.response || "No response recorded.");
    setText("response-status", run.status === "success" ? "Completed · restored from server history" : "Failed · restored from server history");
    setText("run-latency", elapsedText(run.duration_ms));
    state.lastRunId = run.id;
    setText("run-id", String(run.id).slice(0, 15));
    setExecutionStatus(run.status === "success" ? "COMPLETE" : "FAILED", run.status === "success" ? "complete" : "failed");
}

function setExecutionStatus(label, className = "") {
    const el = byId("execution-status");
    if (!el) return;
    el.textContent = label;
    el.className = `execution-pill${className ? ` ${className}` : ""}`;
}

function updateBackendStatus(online) {
    state.backendOnline = online;
    const badge = byId("system-status-badge");
    const label = byId("system-status-text");
    if (badge) badge.classList.toggle("offline", !online);
    if (label) label.textContent = online ? "SYSTEM ONLINE" : "BACKEND OFFLINE";
}

async function checkHealth() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch("/api/health", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Health check returned ${response.status}`);
        const data = await response.json();
        updateBackendStatus(data.status === "ok");
        state.modelMode = data.model_mode || "Not reported";
        setText("model-mode", state.modelMode);
    } catch (error) {
        updateBackendStatus(false);
        state.modelMode = "Unavailable";
        setText("model-mode", state.modelMode);
    } finally {
        clearTimeout(timeout);
    }
}

function clearGraph() {
    state.completed.clear();
    document.querySelectorAll(".graph-node").forEach(node => {
        node.classList.remove("active", "done");
        node.classList.add("pending");
    });
    document.querySelectorAll(".graph-edge").forEach(edge => edge.classList.remove("active", "done"));
}

function clearTrace() {
    const list = byId("trace-list");
    if (list) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Waiting for a workflow run…";
        list.replaceChildren(empty);
    }
}

function resetDisplay() {
    clearGraph();
    clearTrace();
    byId("route-badge").hidden = true;
    setText("route-badge-text", "—");
    setText("response-req-text", "No request executed in this view.");
    setText("response-ans-text", "Gemini response generation is used when configured; otherwise the workflow returns deterministic support guidance.");
    setText("response-status", "Waiting for a request");
    setText("run-latency", "—");
    setText("source-list", "None retrieved");
    setText("tools-list", "None used");
    setText("run-id", "—");
    setExecutionStatus("IDLE");
    updateState({});
    showNodeInfo("START");
}

function updateState(agentState) {
    const actualState = agentState && typeof agentState === "object" ? agentState : {};
    state.lastAgentState = actualState;
    setText("state-intent", actualState.intent && actualState.intent !== "Pending" ? actualState.intent : "—");
    setText("state-confidence", typeof actualState.confidence === "number" ? actualState.confidence.toFixed(2) : "—");
    setText("state-node", actualState.current_node || "START");
    setText("state-route", actualState.selected_route && actualState.selected_route !== "Pending" ? actualState.selected_route : "—");
    setText("state-steps", actualState.step_count ?? 0);
    setText("state-status", actualState.status || "Idle");
    setText("documents-retrieved", actualState.documents_retrieved ?? 0);
    setText("tokens-used", actualState.tokens_used == null ? "Not reported" : actualState.tokens_used.toLocaleString());
    const sources = Array.isArray(actualState.sources) ? actualState.sources : [];
    const tools = Array.isArray(actualState.tools_used) ? actualState.tools_used : [];
    setText("source-list", sources.length
        ? sources.map(source => `${source.document || "Document"} · ${source.page ? `page ${source.page}` : `chunk ${(source.chunk ?? 0) + 1}`}`).join(" · ")
        : "None retrieved");
    setText("tools-list", tools.length ? tools.join(" · ") : "None used");
    setText("model-mode", actualState.response_mode || actualState.model || state.modelMode);
    setText("metric-tokens", actualState.tokens_used == null ? "Not reported" : actualState.tokens_used.toLocaleString());
    const json = byId("json-content");
    if (json) json.textContent = JSON.stringify(actualState, null, 2);
}

function showNodeInfo(key) {
    const name = NODE_INFO[key] ? key : "START";
    state.selectedNode = name;
    const info = NODE_INFO[name];
    const nodeEvent = [...state.steps].reverse().find(step => String(step.node || "").toUpperCase() === name);
    const nodeState = nodeEvent && nodeEvent.state && typeof nodeEvent.state === "object"
        ? nodeEvent.state
        : {};
    setText("info-title", name);
    setText("info-desc", info[0]);
    setText("info-reads", info[1]);
    setText("info-updates", info[2]);
    setText("info-next", info[3]);
    const tools = Array.isArray(nodeState.tools_used) ? nodeState.tools_used : [];
    setText("info-tools", tools.length ? tools.join(", ") : "None reported for this node");
    setText("info-status", nodeEvent ? nodeState.status || "Completed" : "Not executed");
    setText("info-model", nodeState.response_mode || nodeState.model || state.modelMode);
    setText("info-duration", Number.isFinite(nodeEvent?.duration_ms)
        ? elapsedText(nodeEvent.duration_ms)
        : "Not reported by API");
    const index = NODES.indexOf(name);
    document.querySelectorAll(".graph-node").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.node === name)));
    document.querySelectorAll(".inspector-arrows button").forEach((button, i) => {
        button.dataset.direction = i === 0 ? "-1" : "1";
    });
    state.nodeIndex = index;
}

function stepEdgeIds(step) {
    const node = String(step.node || "").toUpperCase();
    if (node === "ROUTER") return ["edge-retrieval-router"];
    if (node === "RESPONSE") {
        const route = String(step.state?.selected_route || "").toUpperCase();
        return [MERGE_EDGE[route]].filter(Boolean);
    }
    if (node === "END") return ["edge-resp-end"];
    if (step.node_type === "router" && step.route_info) {
        const route = String(step.route_info.decision || step.route_info.intent || "").toUpperCase();
        return EDGES[route] || [];
    }
    return EDGES[node] || [];
}

function addTraceItem(step) {
    const list = byId("trace-list");
    if (!list) return;
    if (list.querySelector(".empty-state")) list.replaceChildren();
    list.querySelectorAll(".trace-item.active").forEach(item => {
        item.classList.remove("active");
        item.classList.add("done");
    });
    const item = document.createElement("article");
    item.className = `trace-item ${step.node === "END" ? "done" : "active"}`;
    const rail = document.createElement("span");
    rail.className = "trace-rail";
    const dot = document.createElement("span");
    dot.className = "trace-dot";
    const copy = document.createElement("div");
    copy.className = "trace-copy";
    const title = document.createElement("strong");
    title.textContent = step.node || "Workflow event";
    const detail = document.createElement("p");
    detail.textContent = step.description || step.log || "";
    copy.append(title, detail);
    const stamp = document.createElement("time");
    stamp.className = "trace-stamp";
    const receivedAt = performance.now();
    const gap = state.lastEventAt ? `${Math.round(receivedAt - state.lastEventAt)} ms` : "start";
    state.lastEventAt = receivedAt;
    stamp.textContent = `${timeText()} · ${gap}`;
    stamp.title = "Client-observed gap between streamed events; not server node execution time.";
    item.append(rail, dot, copy, stamp);
    list.append(item);
    list.scrollTop = list.scrollHeight;
}

function renderStep(step) {
    if (!step || typeof step.node !== "string") return;
    state.steps.push(step);
    addTraceItem(step);
    if (step.state) updateState(step.state);
    const key = step.node.toUpperCase();
    const activeId = NODE_IDS[key];
    state.completed.forEach(doneKey => {
        const node = byId(NODE_IDS[doneKey]);
        if (node) { node.classList.remove("active"); node.classList.add("done"); }
    });
    if (activeId) {
        const activeNode = byId(activeId);
        if (activeNode) {
            activeNode.classList.remove("pending", "done");
            activeNode.classList.add(key === "END" ? "done" : "active");
        }
    }
    const routeEdges = stepEdgeIds(step);
    if (key === "ROUTER" && step.route_info) {
        const route = String(step.route_info.decision || step.route_info.intent || "GENERAL").toUpperCase();
        byId("route-badge").hidden = false;
        setText("route-badge-text", route);
        document.querySelectorAll(".branch-edge,.merge-edge").forEach(edge => edge.classList.remove("active"));
        const selectedEdge = byId(ROUTE_EDGE[route]);
        if (selectedEdge) selectedEdge.classList.add("active");
    }
    if (key === "RESPONSE") {
        const route = String(step.state?.selected_route || "").toUpperCase();
        const mergeEdge = byId(MERGE_EDGE[route]);
        if (mergeEdge) mergeEdge.classList.add("done");
    }
    routeEdges.forEach(id => {
        const edge = byId(id);
        if (edge) { edge.classList.remove("active"); edge.classList.add("done"); }
    });
    if (activeId) state.completed.add(key);
    showNodeInfo(key);
    if (key === "END") setExecutionStatus("COMPLETE", "complete");
}

function showError(message) {
    const banner = byId("error-banner");
    if (!banner) return;
    banner.textContent = message;
    banner.hidden = false;
}

function finishRun(status, responseText = "") {
    if (!state.activeRun) return;
    clearTimeout(state.timer);
    const durationMs = Date.now() - state.startedAt;
    state.activeRun = null;
    setText("run-latency", elapsedText(durationMs));
    setText("response-status", status === "success" ? "Workflow completed" : "Workflow failed");
    setExecutionStatus(status === "success" ? "COMPLETE" : "FAILED", status === "success" ? "complete" : "failed");
    byId("btn-run").disabled = false;
    byId("btn-run").innerHTML = "<span aria-hidden=\"true\">▶</span> RUN AGENT";
    renderMetrics();
}

function runAgent() {
    const input = byId("prompt-input");
    const query = input ? input.value.trim() : "";
    const error = byId("error-banner");
    if (error) error.hidden = true;
    if (!query) {
        showError("Enter a request before starting the workflow.");
        if (input) input.focus();
        return;
    }
    if (query.length > 2000) {
        showError("Requests must be 2,000 characters or fewer.");
        return;
    }
    if (state.backendOnline === false) {
        showError("The backend health check failed. Reconnect to the API before running a workflow.");
        return;
    }
    if (state.source) state.source.close();
    clearTimeout(state.timer);
    resetDisplay();
    state.steps = [];
    state.completed.clear();
    state.startedAt = Date.now();
    state.lastEventAt = 0;
    state.activeRun = { id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `run-${Date.now()}`, input: query };
    state.lastRunId = state.activeRun.id;
    setText("run-id", state.lastRunId.slice(0, 15));
    setText("response-req-text", query);
    setText("response-ans-text", "Waiting for the first LangGraph event…");
    setText("response-status", "Streaming from backend");
    setExecutionStatus("RUNNING", "running");
    const button = byId("btn-run");
    button.disabled = true;
    button.textContent = "RUNNING…";
    state.source = new EventSource(`/api/agent/stream?prompt=${encodeURIComponent(query)}&session_id=${encodeURIComponent(state.sessionId)}&run_id=${encodeURIComponent(state.activeRun.id)}`);
    state.timer = setTimeout(() => {
        if (state.source) state.source.close();
        state.source = null;
        showError("Workflow timed out while waiting for the event stream.");
        finishRun("failed");
    }, 120000);
    state.source.onmessage = event => {
        let step;
        try {
            step = JSON.parse(event.data);
        } catch {
            if (state.source) state.source.close();
            state.source = null;
            showError("The server returned an unreadable workflow event.");
            finishRun("failed");
            return;
        }
        if (step.error) {
            if (state.source) state.source.close();
            state.source = null;
            showError("The graph could not finish this request. Check the backend logs and try again.");
            finishRun("failed");
            return;
        }
        renderStep(step);
        if (step.node === "END") {
            if (state.source) state.source.close();
            state.source = null;
            const answer = step.summary && step.summary.final_response ? step.summary.final_response : "The workflow ended without a response payload.";
            setText("response-ans-text", answer);
            finishRun("success", answer);
        }
    };
    state.source.onerror = () => {
        if (!state.source || !state.activeRun) return;
        state.source.close();
        state.source = null;
        showError("The event stream disconnected before the workflow completed. Check the backend connection and retry.");
        finishRun("failed");
    };
}

function newConversation() {
    if (state.source) state.source.close();
    state.source = null;
    clearTimeout(state.timer);
    const wasRunning = Boolean(state.activeRun);
    state.activeRun = null;
    byId("btn-run").disabled = false;
    byId("btn-run").innerHTML = "<span aria-hidden=\"true\">▶</span> RUN AGENT";
    if (wasRunning) setText("response-status", "Run cancelled by user");
    const input = byId("prompt-input");
    input.value = "";
    setText("input-count", "0 / 2000");
    byId("error-banner").hidden = true;
    state.steps = [];
    resetDisplay();
    state.sessionId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    state.lastRunId = null;
    try { localStorage.setItem(SESSION_KEY, state.sessionId); } catch { /* Session remains available in memory. */ }
    setText("session-id", state.sessionId.slice(0, 15));
    renderMetrics();
    if (wasRunning) setText("response-status", "Run cancelled by user");
    input.focus();
}

function setPrompt(prompt) {
    const input = byId("prompt-input");
    input.value = prompt;
    setText("input-count", `${prompt.length} / 2000`);
    input.focus();
}

function bindUI() {
    byId("btn-run").addEventListener("click", runAgent);
    byId("btn-new-chat").addEventListener("click", newConversation);
    byId("btn-clear-trace").addEventListener("click", () => {
        clearTrace();
        clearGraph();
        state.steps = [];
        updateState({});
        setExecutionStatus("IDLE");
        setText("response-status", "Trace cleared");
    });
    byId("btn-reset-graph").addEventListener("click", newConversation);
    byId("prompt-input").addEventListener("input", event => setText("input-count", `${event.target.value.length} / 2000`));
    byId("prompt-input").addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            runAgent();
        }
    });
    document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => setPrompt(button.dataset.prompt)));
    document.querySelectorAll(".graph-node").forEach(node => {
        const activate = () => showNodeInfo(node.dataset.node);
        node.addEventListener("click", activate);
        node.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
        });
    });
    document.querySelectorAll(".inspector-arrows button").forEach(button => button.addEventListener("click", () => {
        const index = (state.nodeIndex + Number(button.dataset.direction) + NODES.length) % NODES.length;
        showNodeInfo(NODES[index]);
    }));
}

document.addEventListener("DOMContentLoaded", () => {
    bindUI();
    clearGraph();
    setText("session-id", state.sessionId.slice(0, 15));
    renderMetrics();
    showNodeInfo("START");
    updateState({});
    checkHealth();
    const selectedRun = new URLSearchParams(location.search).get("run");
    if (selectedRun) apiJSON(`/api/agent/history/${encodeURIComponent(selectedRun)}`)
        .then(restoreRun)
        .catch(error => showError(`Could not restore this run: ${error.message}`));
});
