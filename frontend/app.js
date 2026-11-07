/* ============================================================
   app.js — LangGraph AI Mission Control Demo Logic
   Real SSE integration with LangGraph backend
   ============================================================ */

const NODE_INFO = {
    "START": {
        title: "START NODE",
        desc: "Entry point for the LangGraph workflow. Receives the user's natural language request and initializes the AgentState.",
        reads: "—",
        updates: "input, status, current_node",
        next: "intent_analyzer",
        used: "Workflow Initialization"
    },
    "INTENT ANALYZER": {
        title: "INTENT ANALYZER",
        desc: "Classifies the user's request using Gemini LLM (or deterministic fallback). Extracts intent, confidence score, and reasoning.",
        reads: "input",
        updates: "intent, confidence, reasoning, current_node",
        next: "router",
        used: "Intent Classification"
    },
    "ROUTER": {
        title: "ROUTER (Conditional Edge)",
        desc: "Reads detected intent from state and routes execution to the appropriate specialist agent using LangGraph conditional edges.",
        reads: "intent",
        updates: "selected_route, current_node",
        next: "Dynamic: BILLING | TECHNICAL | ORDER | ACCOUNT | GENERAL",
        used: "Conditional Workflow Routing"
    },
    "BILLING": {
        title: "BILLING AGENT",
        desc: "Specialist node handling payment issues: failed charges, refunds, duplicate transactions, subscription billing, and invoices.",
        reads: "input, intent",
        updates: "response, selected_route, current_node",
        next: "response_generator",
        used: "Payment & billing issues"
    },
    "TECHNICAL SUPPORT": {
        title: "TECHNICAL SUPPORT AGENT",
        desc: "Specialist node handling application errors, crashes, bugs, slow performance, broken features, and software issues.",
        reads: "input, intent",
        updates: "response, selected_route, current_node",
        next: "response_generator",
        used: "Technical problems"
    },
    "ORDER": {
        title: "ORDER AGENT",
        desc: "Specialist node tracking shipments, deliveries, order status, package whereabouts, and delivery ETA.",
        reads: "input, intent",
        updates: "response, selected_route, current_node",
        next: "response_generator",
        used: "Order tracking & delivery"
    },
    "ACCOUNT": {
        title: "ACCOUNT AGENT",
        desc: "Specialist node assisting with password resets, login issues, 2FA, profile updates, and credential management.",
        reads: "input, intent",
        updates: "response, selected_route, current_node",
        next: "response_generator",
        used: "Account management"
    },
    "GENERAL": {
        title: "GENERAL AGENT",
        desc: "Fallback specialist node handling all inquiries not matched by specialized agents — general questions and support.",
        reads: "input, intent",
        updates: "response, selected_route, current_node",
        next: "response_generator",
        used: "General inquiries"
    },
    "RESPONSE": {
        title: "RESPONSE GENERATOR",
        desc: "Collects the response from the specialist agent and formats it as the final natural-language output sent back to the user.",
        reads: "response",
        updates: "current_node, status",
        next: "END",
        used: "Response formulation"
    },
    "END": {
        title: "END NODE",
        desc: "Terminal node. Workflow execution is complete. The final AgentState is returned including the response, intent, and execution trace.",
        reads: "status",
        updates: "status",
        next: "—",
        used: "Workflow termination"
    }
};

// All node IDs in order for prev/next navigation
const NODE_ORDER = ["START","INTENT ANALYZER","ROUTER","BILLING","TECHNICAL SUPPORT","ORDER","ACCOUNT","GENERAL","RESPONSE","END"];

let currentNodeIndex = 0;
let currentWorkflowSteps = [];
let conversationHistory = [];
let activeSource = null;

// ──────────────────────────────────────────────────────────────
// UTILITY
// ──────────────────────────────────────────────────────────────

function setPrompt(text) {
    const el = document.getElementById("prompt-input");
    if (el) { el.value = text; el.focus(); }
}

function timeStr() {
    return new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ──────────────────────────────────────────────────────────────
// NODE INSPECTOR
// ──────────────────────────────────────────────────────────────

function showNodeInfo(nodeKey) {
    const key = nodeKey ? nodeKey.toUpperCase() : "START";
    const info = NODE_INFO[key] || NODE_INFO["GENERAL"];
    
    const titleEl    = document.getElementById("info-title");
    const descEl     = document.getElementById("info-desc");
    const readsEl    = document.getElementById("info-reads");
    const updatesEl  = document.getElementById("info-updates");
    const nextEl     = document.getElementById("info-next");
    const usedEl     = document.getElementById("info-used");

    if (titleEl)   titleEl.innerText   = info.title;
    if (descEl)    descEl.innerText    = info.desc;
    if (readsEl)   readsEl.innerText   = info.reads;
    if (updatesEl) updatesEl.innerText = info.updates;
    if (nextEl)    nextEl.innerText    = info.next;
    if (usedEl)    usedEl.innerText    = info.used;

    // Update nav index
    const idx = NODE_ORDER.indexOf(key);
    if (idx !== -1) currentNodeIndex = idx;
}

function navigateNode(dir) {
    currentNodeIndex = (currentNodeIndex + dir + NODE_ORDER.length) % NODE_ORDER.length;
    showNodeInfo(NODE_ORDER[currentNodeIndex]);
}

// ──────────────────────────────────────────────────────────────
// SVG NODE HIGHLIGHTING
// ──────────────────────────────────────────────────────────────

const NODE_TO_SVG_ID = {
    "START":             "node-start",
    "INTENT ANALYZER":   "node-intent",
    "ROUTER":            "node-router",
    "BILLING":           "node-billing",
    "TECHNICAL SUPPORT": "node-tech",
    "ORDER":             "node-order",
    "ACCOUNT":           "node-account",
    "GENERAL":           "node-general",
    "RESPONSE":          "node-response",
    "END":               "node-end"
};

function highlightNode(nodeKey, done) {
    const id = NODE_TO_SVG_ID[nodeKey ? nodeKey.toUpperCase() : ""];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;

    if (done) {
        el.classList.remove("wf-active");
        el.classList.add("wf-done");
        // tint to green
        const shapes = el.querySelectorAll("rect, circle, polygon");
        shapes.forEach(s => {
            if (!s.dataset.origStroke) s.dataset.origStroke = s.getAttribute("stroke") || "";
            s.setAttribute("stroke", "#10b981");
            s.setAttribute("stroke-width", "1.5");
            s.setAttribute("opacity", "0.7");
        });
    } else {
        el.classList.add("wf-active");
        el.classList.remove("wf-done");
        const shapes = el.querySelectorAll("rect, circle, polygon");
        shapes.forEach(s => {
            s.setAttribute("stroke", "#f97316");
            s.setAttribute("stroke-width", "2.5");
            s.setAttribute("opacity", "1");
            s.style.filter = "drop-shadow(0 0 6px #f97316)";
        });
    }
}

function resetAllNodes() {
    const defaults = {
        "node-start":    { stroke: "#10b981", sw: "1.5" },
        "node-intent":   { stroke: "#06b6d4", sw: "1.5" },
        "node-router":   { stroke: "#8b5cf6", sw: "1.5" },
        "node-billing":  { stroke: "rgba(100,116,139,0.4)", sw: "1.5" },
        "node-tech":     { stroke: "rgba(100,116,139,0.4)", sw: "1.5" },
        "node-order":    { stroke: "rgba(100,116,139,0.4)", sw: "1.5" },
        "node-account":  { stroke: "rgba(100,116,139,0.4)", sw: "1.5" },
        "node-general":  { stroke: "rgba(100,116,139,0.4)", sw: "1.5" },
        "node-response": { stroke: "#8b5cf6", sw: "1.5" },
        "node-end":      { stroke: "#10b981", sw: "1.5" }
    };
    Object.entries(defaults).forEach(([id, d]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove("wf-active", "wf-done");
        const shapes = el.querySelectorAll("rect, circle, polygon");
        shapes.forEach(s => {
            s.setAttribute("stroke", d.stroke);
            s.setAttribute("stroke-width", d.sw);
            s.setAttribute("opacity", "1");
            s.style.filter = "";
        });
    });
    // Also reset text colors
    ["node-billing","node-tech","node-order","node-account","node-general"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelectorAll("text").forEach(t => { t.setAttribute("fill", "#94a3b8"); });
    });
}

// ──────────────────────────────────────────────────────────────
// RESET EDGE COLORS
// ──────────────────────────────────────────────────────────────

function resetEdges() {
    const defaultEdgeColor = "rgba(100,116,139,0.5)";
    const defaultBranchColor = "rgba(100,116,139,0.4)";
    ["edge-start-intent","edge-intent-router","edge-resp-end"].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute("stroke", defaultEdgeColor); el.setAttribute("stroke-width", "2"); }
    });
    ["edge-router-billing","edge-router-tech","edge-router-order","edge-router-account","edge-router-general",
     "edge-billing-resp","edge-tech-resp","edge-order-resp","edge-account-resp","edge-general-resp"].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute("stroke", defaultBranchColor); el.setAttribute("stroke-width", "1.5"); el.style.filter = ""; }
    });
}

function highlightRoute(route) {
    const routeEdgeMap = {
        "BILLING":           ["edge-router-billing","edge-billing-resp"],
        "TECHNICAL SUPPORT": ["edge-router-tech","edge-tech-resp"],
        "ORDER":             ["edge-router-order","edge-order-resp"],
        "ACCOUNT":           ["edge-router-account","edge-account-resp"],
        "GENERAL":           ["edge-router-general","edge-general-resp"]
    };
    const edges = routeEdgeMap[route ? route.toUpperCase() : "GENERAL"] || routeEdgeMap["GENERAL"];
    edges.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.setAttribute("stroke", "#f97316");
            el.setAttribute("stroke-width", "2.5");
            el.style.filter = "drop-shadow(0 0 4px #f97316)";
        }
    });
}

// ──────────────────────────────────────────────────────────────
// STATE VIEW
// ──────────────────────────────────────────────────────────────

function updateStateView(state) {
    const filtered = {
        input:         state.input         || "",
        intent:        state.intent        || "Pending",
        confidence:    state.confidence    || 0.0,
        current_node:  state.current_node  || "START",
        selected_route: state.selected_route || "Pending",
        step_count:    state.step_count    || 0,
        status:        state.status        || "Idle"
    };
    if (state.response) filtered.response = state.response;

    const jsonStr = JSON.stringify(filtered, null, 2);
    const jsonEl = document.getElementById("json-content");
    if (jsonEl) jsonEl.innerText = jsonStr;
    
    const lines = jsonStr.split('\n').length;
    const linesEl = document.getElementById("json-lines");
    if (linesEl) {
        let h = '';
        for (let i = 1; i <= lines; i++) h += i + '<br>';
        linesEl.innerHTML = h;
    }
}

// ──────────────────────────────────────────────────────────────
// TRACE
// ──────────────────────────────────────────────────────────────

function clearTrace() {
    const tl = document.getElementById("trace-list");
    if (tl) tl.innerHTML = '<div class="empty-trace">Waiting for execution...</div>';
    const reqEl = document.getElementById("response-req-text");
    const ansEl = document.getElementById("response-ans-text");
    const loadEl = document.getElementById("response-loading");
    const routeEl = document.getElementById("route-badge");
    if (reqEl) reqEl.innerText = "-";
    if (ansEl) ansEl.innerText = "-";
    if (loadEl) loadEl.style.display = "none";
    if (routeEl) routeEl.style.display = "none";
    resetAllNodes();
    resetEdges();
    updateStateView({ input: "", intent: "Pending", confidence: 0.0, current_node: "START", selected_route: "Pending", step_count: 0, status: "Idle" });
}

function addTraceItem(step) {
    const tl = document.getElementById("trace-list");
    if (!tl) return;
    
    // Mark previous active items as done
    tl.querySelectorAll(".trace-item.active").forEach(el => {
        el.classList.remove("active");
        el.classList.add("done");
    });
    // Remove empty-trace placeholder
    const empty = tl.querySelector(".empty-trace");
    if (empty) empty.remove();

    const item = document.createElement("div");
    item.className = "trace-item active";
    item.innerHTML = `
        <div class="trace-time">${timeStr()}</div>
        <div class="trace-icon"></div>
        <div class="trace-content">
            <h4>${step.description || step.node}</h4>
            <p>${(step.log || "").replace(/\n/g, '<br>').replace(/[✅🔍🔀📋⚡🏁]/g, '')}</p>
        </div>
    `;
    tl.appendChild(item);
    tl.scrollTop = tl.scrollHeight;
}

// ──────────────────────────────────────────────────────────────
// RENDER STEP (called per SSE event)
// ──────────────────────────────────────────────────────────────

let completedNodes = new Set();

function renderStep(step) {
    if (!step || !step.node) return;
    
    addTraceItem(step);

    if (step.state) {
        updateStateView(step.state);
        showNodeInfo(step.node);
    }

    // Mark previously active node as done
    completedNodes.forEach(n => highlightNode(n, true));
    
    if (step.node !== "END") {
        highlightNode(step.node, false);
    } else {
        highlightNode("END", true);
    }
    completedNodes.add(step.node);

    // Show route badge + highlight edge when router fires
    if (step.node_type === "router" && step.route_info) {
        const badge = document.getElementById("route-badge");
        const badgeText = document.getElementById("route-badge-text");
        if (badge) badge.style.display = "block";
        if (badgeText) badgeText.innerText = (step.route_info.decision || "GENERAL") + " Workflow";
    }

    // When agent node fires, highlight the route edge
    if (step.node_type === "branch" && step.state && step.state.selected_route) {
        highlightRoute(step.state.selected_route);
    }

    // Agent node color highlight
    if (step.node_type === "branch") {
        const el = document.getElementById(NODE_TO_SVG_ID[step.node.toUpperCase()]);
        if (el) {
            el.querySelectorAll("text").forEach(t => {
                if (t.getAttribute("font-size") === "10") t.setAttribute("fill", "#f97316");
            });
        }
    }

    // Update intent info label
    const intentInfo = document.getElementById("intent-info");
    if (intentInfo && step.state && step.state.intent && step.state.intent !== "Pending") {
        intentInfo.innerHTML = `Intent: <strong>${step.state.intent}</strong> · Confidence: ${(step.state.confidence || 0).toFixed(2)}`;
    }
}

// ──────────────────────────────────────────────────────────────
// RUN AGENT (real SSE call)
// ──────────────────────────────────────────────────────────────

async function runAgent() {
    const inputStr = (document.getElementById("prompt-input") || {}).value;
    if (!inputStr || !inputStr.trim()) {
        showInputError("Please type a message first.");
        return;
    }
    const query = inputStr.trim();
    
    // Reset state
    clearTrace();
    completedNodes = new Set();
    
    const reqEl = document.getElementById("response-req-text");
    const ansEl = document.getElementById("response-ans-text");
    const loadEl = document.getElementById("response-loading");
    const statusEl = document.getElementById("response-status");
    const runBtn = document.getElementById("btn-run");

    if (reqEl) reqEl.innerText = query;
    if (ansEl) ansEl.innerText = "Analyzing your request through LangGraph…";
    if (loadEl) loadEl.style.display = "block";
    if (statusEl) { statusEl.innerHTML = '<span class="dot" style="background:var(--accent-orange)"></span> Executing…'; statusEl.style.color = "var(--accent-orange)"; }
    if (runBtn)  { runBtn.disabled = true; runBtn.textContent = "Running…"; }

    // Close any existing stream
    if (activeSource) { activeSource.close(); activeSource = null; }

    const url = `/api/agent/stream?prompt=${encodeURIComponent(query)}`;
    const source = new EventSource(url);
    activeSource = source;

    source.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.error) {
                showStreamError(data.error);
                source.close(); activeSource = null;
                resetRunBtn();
                return;
            }
            renderStep(data);

            if (data.node === "END") {
                source.close(); activeSource = null;
                if (loadEl) loadEl.style.display = "none";
                if (statusEl) { statusEl.innerHTML = '<span class="dot" style="background:var(--accent-green)"></span> Completed ✓'; statusEl.style.color = "var(--accent-green)"; }
                if (data.summary && data.summary.final_response) {
                    if (ansEl) ansEl.innerText = data.summary.final_response;
                    const shortLabel = query.length > 35 ? query.substring(0, 35) + '…' : query;
                    addToHistory(shortLabel, query, data.summary.final_response);
                }
                resetRunBtn();
            }
        } catch(e) {
            console.error("Parse error:", e);
        }
    };

    source.onerror = function() {
        source.close(); activeSource = null;
        if (loadEl) loadEl.style.display = "none";
        showStreamError("Backend connection lost. Is the server running on port 8000?");
        if (statusEl) { statusEl.innerHTML = '<span class="dot" style="background:var(--accent-red)"></span> Error'; statusEl.style.color = "var(--accent-red)"; }
        resetRunBtn();
    };
}

function resetRunBtn() {
    const runBtn = document.getElementById("btn-run");
    if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Agent'; }
}

function showInputError(msg) {
    const existing = document.querySelector(".error-banner");
    if (existing) existing.remove();
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${msg}`;
    const console = document.querySelector(".console-panel");
    if (console) console.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
}

function showStreamError(msg) {
    const ansEl = document.getElementById("response-ans-text");
    if (ansEl) ansEl.innerText = "⚠️ " + msg;
}

// ──────────────────────────────────────────────────────────────
// NEW CONVERSATION
// ──────────────────────────────────────────────────────────────

function newConversation() {
    // Stop SSE stream
    if (activeSource) { activeSource.close(); activeSource = null; }
    completedNodes = new Set();
    currentWorkflowSteps = [];

    // Clear input
    const inputEl = document.getElementById("prompt-input");
    if (inputEl) inputEl.value = "";

    // Remove any errors
    document.querySelectorAll(".error-banner").forEach(e => e.remove());

    // Reset panels
    clearTrace();

    // Reset response status
    const statusEl = document.getElementById("response-status");
    if (statusEl) { statusEl.innerHTML = '<span class="dot"></span> Ready'; statusEl.style.color = "var(--text-muted)"; }

    // Reset node info
    showNodeInfo("START");
    
    if (inputEl) inputEl.focus();
}

// ──────────────────────────────────────────────────────────────
// HISTORY
// ──────────────────────────────────────────────────────────────

function addToHistory(label, inputText, response) {
    conversationHistory.unshift({ label, inputText, response });
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById("history-list");
    if (!list) return;
    list.innerHTML = "";
    if (conversationHistory.length === 0) {
        list.innerHTML = '<div class="history-item" style="opacity:.4;cursor:default;">No history yet</div>';
        return;
    }
    conversationHistory.slice(0, 8).forEach((item, idx) => {
        const el = document.createElement("div");
        el.className = "history-item" + (idx === 0 ? " active" : "");
        el.innerHTML = `<span class="dot"></span> ${item.label}`;
        el.onclick = () => {
            const inputEl = document.getElementById("prompt-input");
            const reqEl   = document.getElementById("response-req-text");
            const ansEl   = document.getElementById("response-ans-text");
            if (inputEl) inputEl.value = item.inputText;
            if (reqEl)   reqEl.innerText = item.inputText;
            if (ansEl)   ansEl.innerText = item.response;
        };
        list.appendChild(el);
    });
}

// ──────────────────────────────────────────────────────────────
// HEALTH CHECK
// ──────────────────────────────────────────────────────────────

async function checkHealth() {
    try {
        const res = await fetch("/api/health");
        const data = await res.json();
        const badge = document.getElementById("system-status-badge");
        const text  = document.getElementById("system-status-text");
        if (data.status === "ok") {
            if (badge) { badge.style.background = "rgba(16,185,129,.1)"; badge.style.borderColor = "rgba(16,185,129,.3)"; badge.style.color = "var(--accent-green)"; }
            if (text) text.innerText = "SYSTEM ONLINE";
        }
    } catch (e) {
        const badge = document.getElementById("system-status-badge");
        const text  = document.getElementById("system-status-text");
        if (badge) { badge.style.background = "rgba(239,68,68,.1)"; badge.style.borderColor = "rgba(239,68,68,.3)"; badge.style.color = "var(--accent-red)"; }
        if (text) text.innerText = "BACKEND OFFLINE";
        showStreamError("Backend is offline. Start the server: uvicorn backend.main:app --port 8000");
    }
}

// ──────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
    // Keyboard: Enter to run
    const inputEl = document.getElementById("prompt-input");
    if (inputEl) {
        inputEl.addEventListener("keypress", e => { if (e.key === "Enter") runAgent(); });
    }
    // Send button
    const sendBtn = document.getElementById("btn-send");
    if (sendBtn) sendBtn.addEventListener("click", runAgent);

    // New conversation button
    const newBtn = document.getElementById("btn-new-chat");
    if (newBtn) newBtn.addEventListener("click", newConversation);

    // Node prev/next
    const prevBtn = document.getElementById("node-prev-btn");
    const nextBtn = document.getElementById("node-next-btn");
    if (prevBtn) prevBtn.addEventListener("click", () => navigateNode(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => navigateNode(1));

    // Init display
    updateStateView({ input: "", intent: "Pending", confidence: 0.0, current_node: "START", selected_route: "Pending", step_count: 0, status: "Idle" });
    showNodeInfo("START");
    renderHistory();
    checkHealth();
});
