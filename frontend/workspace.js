const SESSION_KEY = "lgmc.uiSession.v1";
const PAGE_DATA = {
    "/analytics": ["Analytics", "EXECUTION OBSERVABILITY", "Server-side execution and document metrics from the local Mission Control store."],
    "/history": ["Execution History", "PERSISTENT RUN ARCHIVE", "Review actual LangGraph executions saved by this server and reopen a run in Mission Control."],
    "/execution-history": ["Execution History", "PERSISTENT RUN ARCHIVE", "Review actual LangGraph executions saved by this server and reopen a run in Mission Control."],
    "/knowledge-base": ["Knowledge Base", "LOCAL DOCUMENT RETRIEVAL", "Upload supported documents for SQLite full-text search and retrieval in the actual agent workflow."],
    "/settings": ["Settings", "RUNTIME CONFIGURATION", "Read-only view of active runtime capabilities. Credentials remain server-side and are never exposed."],
    "/agents": ["Agent Routes", "GRAPH TOPOLOGY", "Five actual specialist branches route requests by intent after session recall and document retrieval."],
    "/memory": ["Memory", "SESSION STATE", "Inspect and clear the successful conversation turns supplied to the response generator."],
    "/tools": ["Tools", "TOOLING STATUS", "Only the local knowledge search tool is registered; external business-system integrations are not connected."]
};

function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
}
function addCard(parent, title, value, note) {
    const card = el("article", null, "workspace-card stat-card");
    card.append(el("small", title), el("strong", value), el("small", note, "note"));
    parent.append(card);
}
function duration(ms) {
    return Number.isFinite(Number(ms)) ? `${(Number(ms) / 1000).toFixed(2)} s` : "Not reported";
}
function sessionId() {
    try {
        let id = localStorage.getItem(SESSION_KEY);
        if (!id) {
            id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ui-${Date.now().toString(36)}`;
            localStorage.setItem(SESSION_KEY, id);
        }
        return id;
    } catch {
        return `ui-${Date.now().toString(36)}`;
    }
}
async function api(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", ...options });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || `Request failed (${response.status})`);
    }
    return response.json();
}
function showError(parent, message) {
    parent.append(el("div", message, "notice error-notice"));
}
function renderBars(parent, routes) {
    const rows = routes || [];
    const max = Math.max(1, ...rows.map(item => Number(item.count) || 0));
    const chart = el("div", null, "bar-chart");
    rows.forEach(item => {
        const row = el("div", null, "bar-row");
        row.append(el("span", item.route || "Unknown"));
        const track = el("div", null, "bar-track");
        const fill = el("div", null, "bar-fill");
        fill.style.width = `${((Number(item.count) || 0) / max) * 100}%`;
        track.append(fill);
        row.append(track, el("span", item.count, "bar-count"));
        chart.append(row);
    });
    if (!rows.length) chart.append(el("div", "No successful routes recorded yet.", "empty-card"));
    parent.append(chart);
}
async function renderAnalytics(content) {
    try {
        const stats = await api("/api/analytics");
        const percent = value => value == null ? "Not reported" : `${(value * 100).toFixed(1)}%`;
        const cards = el("div", null, "card-grid");
        addCard(cards, "Total runs", stats.total_runs ?? 0, "Persisted graph executions");
        addCard(cards, "Successful runs", stats.successful_runs ?? 0, "Runs completed by LangGraph");
        addCard(cards, "Failed runs", stats.failed_runs ?? 0, "Server-recorded unsuccessful executions");
        addCard(cards, "Success rate", percent(stats.success_rate), "Derived from stored run outcomes");
        addCard(cards, "Average latency", stats.avg_latency_ms == null ? "Not reported" : duration(stats.avg_latency_ms), "Measured by API execution timer");
        addCard(cards, "Average graph events", stats.avg_steps == null ? "Not reported" : stats.avg_steps.toFixed(1), "Persisted stream event count");
        addCard(cards, "Token usage", stats.tokens_used == null ? "Not reported" : stats.tokens_used.toLocaleString(), "Provider usage metadata when available");
        addCard(cards, "Indexed documents", stats.documents ?? 0, `${stats.document_bytes ?? 0} bytes stored`);
        content.append(cards);
        const section = el("section", null, "section-card");
        section.append(el("h2", "Successful route usage"));
        renderBars(section, stats.routes);
        content.append(section);
        content.append(el("div", "Latency and step counts are measured from saved executions. Token totals are left unreported when Gemini does not return usage metadata.", "notice"));
    } catch (error) {
        showError(content, `Analytics could not be loaded: ${error.message}`);
    }
}
async function renderHistory(content) {
    try {
        const result = await api("/api/agent/history?limit=200");
        const runs = result.runs || [];
        if (!runs.length) {
            content.append(el("div", "No executions have been saved yet. Start a run in Mission Control to populate this archive.", "empty-card"));
            return;
        }
        const wrap = el("div", null, "table-wrap");
        const table = el("table", null, "run-table");
        const head = el("thead");
        const headRow = el("tr");
        ["Run", "Timestamp", "Input", "Intent / Route", "Status", "Latency", "Tokens", "Result"].forEach(label => headRow.append(el("th", label)));
        head.append(headRow);
        const body = el("tbody");
        runs.forEach(run => {
            const row = el("tr");
            const linkCell = el("td");
            const link = el("a", String(run.id).slice(0, 12), "run-link");
            link.href = `/demo?run=${encodeURIComponent(run.id)}`;
            linkCell.append(link);
            row.append(linkCell);
            row.append(el("td", run.created_at ? new Date(run.created_at).toLocaleString() : "—"));
            row.append(el("td", String(run.input || "").slice(0, 72)));
            row.append(el("td", run.route || run.intent || "Unknown"));
            row.append(el("td", run.status || "unknown", run.status === "success" ? "status-success" : "status-failed"));
            row.append(el("td", duration(run.duration_ms)));
            row.append(el("td", run.tokens_used == null ? "Not reported" : run.tokens_used));
            row.append(el("td", String(run.response || "—").slice(0, 95)));
            body.append(row);
        });
        table.append(head, body);
        wrap.append(table);
        content.append(wrap);
    } catch (error) {
        showError(content, `Execution history could not be loaded: ${error.message}`);
    }
}
function capability(parent, title, description, enabled = false) {
    const item = el("article", null, `capability${enabled ? " enabled" : ""}`);
    item.append(el("span", null, "status-mark"));
    const copy = el("div");
    copy.append(el("h3", title), el("p", description));
    item.append(copy);
    parent.append(item);
}
async function renderDocuments(content) {
    const card = el("section", null, "section-card");
    card.append(el("h2", "Upload and search documents"));
    const form = el("form", null, "upload-form");
    const file = el("input");
    file.type = "file";
    file.name = "file";
    file.accept = ".pdf,.txt,.md,.csv,.json,.html,.htm";
    file.required = true;
    file.setAttribute("aria-label", "Choose a document to index");
    const upload = el("button", "Index document", "primary-link");
    upload.type = "submit";
    form.append(file, upload);
    const message = el("p", "Supported: PDF, TXT, Markdown, CSV, JSON, and HTML. Maximum 10 MB. Search is lexical full-text retrieval, not vector search.", "form-message");
    form.append(message);
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!file.files || !file.files[0]) return;
        upload.disabled = true;
        message.textContent = "Uploading and indexing…";
        try {
            const body = new FormData();
            body.append("file", file.files[0]);
            const result = await api("/api/documents/upload", { method: "POST", body });
            message.textContent = `${result.document.name} indexed · ${result.document.chunk_count} chunk(s).`;
            file.value = "";
            await refreshDocuments();
        } catch (error) {
            message.textContent = `Upload failed: ${error.message}`;
        } finally {
            upload.disabled = false;
        }
    });
    card.append(form);
    const searchForm = el("form", null, "search-form");
    const query = el("input");
    query.type = "search";
    query.placeholder = "Search indexed knowledge…";
    query.maxLength = 1000;
    query.setAttribute("aria-label", "Search indexed documents");
    const searchButton = el("button", "Search");
    searchButton.type = "submit";
    searchForm.append(query, searchButton);
    const searchResults = el("div", null, "search-results");
    searchForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!query.value.trim()) return;
        searchResults.replaceChildren(el("p", "Searching…", "muted-empty"));
        try {
            const result = await api(`/api/knowledge/search?q=${encodeURIComponent(query.value.trim())}`);
            searchResults.replaceChildren();
            if (!result.results.length) searchResults.append(el("p", "No matching passages found.", "empty-card"));
            result.results.forEach(source => {
                const item = el("article", null, "source-result");
                item.append(el("strong", `${source.document} · ${source.page ? `page ${source.page}` : `chunk ${(source.chunk ?? 0) + 1}`}`));
                item.append(el("p", source.text));
                searchResults.append(item);
            });
        } catch (error) {
            searchResults.replaceChildren(el("p", `Search failed: ${error.message}`, "notice error-notice"));
        }
    });
    card.append(searchForm, searchResults);
    content.append(card);
    const docsCard = el("section", null, "section-card");
    docsCard.append(el("h2", "Indexed documents"));
    const docsList = el("div", null, "document-list");
    docsCard.append(docsList);
    content.append(docsCard);
    async function refreshDocuments() {
        docsList.replaceChildren();
        try {
            const result = await api("/api/documents");
            if (!result.documents.length) {
                docsList.append(el("div", "No documents indexed.", "empty-card"));
                return;
            }
            result.documents.forEach(doc => {
                const row = el("article", null, "document-row");
                const description = el("div");
                description.append(el("strong", doc.name), el("small", `${doc.chunk_count} chunks · ${(doc.byte_size / 1024).toFixed(1)} KB · ${new Date(doc.created_at).toLocaleString()}`));
                const remove = el("button", "Delete", "text-button");
                remove.type = "button";
                remove.addEventListener("click", async () => {
                    remove.disabled = true;
                    try {
                        await api(`/api/documents/${encodeURIComponent(doc.id)}`, { method: "DELETE" });
                        await refreshDocuments();
                    } catch (error) {
                        remove.disabled = false;
                        showError(docsList, `Document could not be deleted: ${error.message}`);
                    }
                });
                row.append(description, remove);
                docsList.append(row);
            });
        } catch (error) {
            showError(docsList, `Documents could not be loaded: ${error.message}`);
        }
    }
    await refreshDocuments();
}
async function renderSettings(content) {
    try {
        const health = await api("/api/health");
        const caps = health.capabilities || {};
        const rows = [
            ["Model mode", health.model_mode || "Not reported"],
            ["Classification / response", health.llm_configured ? "Gemini configured; deterministic fallback remains" : "Deterministic fallback"],
            ["Temperature", "0.0 for Gemini classification"],
            ["Streaming", caps.sse_streaming ? "Server-Sent Events enabled" : "Unavailable"],
            ["Conversation memory", caps.persistent_memory ? "SQLite session memory enabled" : "Unavailable"],
            ["Knowledge retrieval", caps.full_text_retrieval ? "SQLite FTS5 lexical search enabled" : "Unavailable"],
            ["Debug telemetry", "Raw AgentState available per execution"],
            ["External business tools", caps.external_tool_integrations ? "Connected" : "Not connected"],
            ["Human approval", caps.human_approval ? "Configured" : "Not configured"],
            ["API keys", "Server-side environment only; never shown"]
        ];
        const card = el("section", null, "section-card");
        card.append(el("h2", "Backend settings (read-only)"));
        const grid = el("div", null, "settings-grid");
        rows.forEach(([label, value]) => {
            const row = el("div", null, "setting-row");
            row.append(el("span", label, "field-label"), el("span", value, "settings-value"));
            grid.append(row);
        });
        card.append(grid);
        content.append(card, el("div", "Credentials and deployment configuration are not editable or exposed in the browser.", "notice"));
    } catch (error) {
        showError(content, `Runtime settings could not be loaded: ${error.message}`);
    }
}
function renderAgents(content) {
    const agents = [
        ["BILLING", "billing", "Payment and billing requests; no payment provider is connected."],
        ["ORDER", "order", "Order and delivery requests; no order-management system is connected."],
        ["TECHNICAL SUPPORT", "tech_support", "Application and technical requests."],
        ["ACCOUNT", "account", "Account and credential requests; no identity provider is connected."],
        ["GENERAL", "general", "Fallback when no specialist category matches."]
    ];
    const grid = el("div", null, "card-grid");
    agents.forEach(([name, node, description]) => {
        const card = el("article", null, "workspace-card agent-card");
        card.append(el("h2", name), el("p", description), el("code", `LangGraph node: ${node}`));
        grid.append(card);
    });
    content.append(grid, el("div", "Actual graph path: START → session memory → intent analyzer → knowledge retriever → conditional specialist route → response → END. Planner, critic, parallel execution, and human approval are not implemented.", "notice"));
}
async function renderMemory(content) {
    const id = sessionId();
    const card = el("section", null, "section-card");
    card.append(el("h2", "Current session memory"), el("p", `Session ID: ${id}`));
    const clear = el("button", "Clear this session", "text-button");
    clear.type = "button";
    const list = el("div", null, "memory-list");
    clear.addEventListener("click", async () => {
        clear.disabled = true;
        try {
            const result = await api(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" });
            list.replaceChildren(el("p", `Session memory cleared (${result.deleted_runs} stored turn(s) removed).`, "empty-card"));
        } catch (error) {
            showError(list, `Session memory could not be cleared: ${error.message}`);
        } finally {
            clear.disabled = false;
        }
    });
    card.append(clear, list);
    content.append(card, el("div", "Successful turns from this session are loaded by the real MEMORY graph node before each run and supplied as context when Gemini generates a response. Resetting the Mission Control conversation selects a fresh session; clearing here permanently removes its saved runs and turns.", "notice"));
    try {
        const result = await api(`/api/memory/${encodeURIComponent(id)}?limit=50`);
        if (!result.turns.length) list.append(el("div", "No successful turns saved for this session.", "empty-card"));
        result.turns.forEach(turn => {
            const item = el("article", null, "memory-item");
            item.append(el("small", `${turn.intent || "Unknown"} · ${new Date(turn.created_at).toLocaleString()}`));
            item.append(el("p", `Request: ${turn.input}`));
            item.append(el("p", `Response: ${turn.response || "No response recorded."}`));
            list.append(item);
        });
    } catch (error) {
        showError(list, `Session memory could not be loaded: ${error.message}`);
    }
}
function renderTools(content) {
    const card = el("section", null, "section-card");
    card.append(el("h2", "Registered workflow tool"));
    const list = el("div", null, "capability-list");
    capability(list, "Knowledge Search", "SQLite FTS5 full-text search over uploaded local documents. Runs only when indexed passages match.", true);
    capability(list, "Payment / order / account APIs", "Not connected; specialist agents do not query external customer systems.");
    capability(list, "Web search / calculator", "Not registered in the LangGraph workflow.");
    card.append(list);
    content.append(card);
}
async function render() {
    const page = location.pathname.replace(/\/+$/, "") || "/";
    const info = PAGE_DATA[page] || PAGE_DATA["/analytics"];
    document.title = `${info[0]} | LangGraph AI Mission Control`;
    document.getElementById("workspace-crumb").textContent = info[0];
    document.getElementById("workspace-eyebrow").textContent = info[1];
    document.getElementById("workspace-title").textContent = info[0];
    document.getElementById("workspace-description").textContent = info[2];
    const content = document.getElementById("workspace-content");
    if (page === "/analytics") await renderAnalytics(content);
    else if (page === "/history" || page === "/execution-history") await renderHistory(content);
    else if (page === "/knowledge-base") await renderDocuments(content);
    else if (page === "/settings") await renderSettings(content);
    else if (page === "/agents") renderAgents(content);
    else if (page === "/memory") await renderMemory(content);
    else renderTools(content);
}

api("/api/health").then(() => {
    document.getElementById("workspace-status").innerHTML = "<i></i> SYSTEM ONLINE";
}).catch(() => {
    const status = document.getElementById("workspace-status");
    status.classList.add("offline");
    status.innerHTML = "<i></i> BACKEND OFFLINE";
});
document.addEventListener("DOMContentLoaded", () => render().catch(error => showError(document.getElementById("workspace-content"), error.message)));
