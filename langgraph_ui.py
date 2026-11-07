"""
langgraph_ui.py
===============
A Streamlit visual demo for LangGraph — runs in your browser, NO API key required.

Run with:
    .venv\\Scripts\\streamlit run langgraph_ui.py
"""

import time
import streamlit as st
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

# ─────────────────────────────────────────────────────────────────
# PAGE CONFIG — must be the FIRST streamlit call
# ─────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="LangGraph Visual Demo",
    page_icon="🦜",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─────────────────────────────────────────────────────────────────
# CUSTOM CSS — dark premium theme
# ─────────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* Base */
html, body, [data-testid="stAppViewContainer"] {
    background: #0f0f1a !important;
    font-family: 'Inter', sans-serif;
    color: #e2e8f0;
}
[data-testid="stSidebar"] {
    background: #13131f !important;
    border-right: 1px solid #1e1e3a;
}
[data-testid="stSidebar"] * { color: #e2e8f0 !important; }

/* Headers */
h1 { font-size: 1.8rem !important; font-weight: 700 !important;
     background: linear-gradient(135deg, #00d4ff, #7c3aed);
     -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
h2 { font-size: 1.3rem !important; font-weight: 600 !important; color: #94a3b8 !important; }
h3 { font-size: 1.1rem !important; font-weight: 600 !important; color: #cbd5e1 !important; }

/* Input */
[data-testid="stTextInput"] input {
    background: #1a1a2e !important;
    border: 1.5px solid #2d2d4e !important;
    border-radius: 10px !important;
    color: #e2e8f0 !important;
    font-size: 1rem !important;
    padding: 12px 16px !important;
    font-family: 'Inter', sans-serif !important;
    transition: border-color 0.2s;
}
[data-testid="stTextInput"] input:focus {
    border-color: #00d4ff !important;
    box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1) !important;
}

/* Buttons */
[data-testid="stButton"] button {
    background: linear-gradient(135deg, #00d4ff, #7c3aed) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 10px !important;
    font-weight: 600 !important;
    font-size: 1rem !important;
    padding: 10px 28px !important;
    width: 100% !important;
    letter-spacing: 0.3px !important;
    transition: opacity 0.2s, transform 0.1s !important;
}
[data-testid="stButton"] button:hover { opacity: 0.9 !important; transform: translateY(-1px) !important; }
[data-testid="stButton"] button:active { transform: translateY(0px) !important; }

/* Cards */
.card {
    background: #13131f;
    border: 1px solid #1e1e3a;
    border-radius: 14px;
    padding: 20px 24px;
    margin-bottom: 16px;
}
.card-success {
    background: linear-gradient(135deg, #052e16, #064e3b);
    border: 1px solid #059669;
    border-radius: 14px;
    padding: 20px 24px;
    margin-bottom: 16px;
}

/* Node pills */
.node-pill {
    display: inline-block;
    padding: 3px 12px;
    border-radius: 999px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 500;
    margin: 2px 4px;
}
.node-start   { background:#1e3a5f; color:#60a5fa; border:1px solid #3b82f6; }
.node-greet   { background:#1a3d2e; color:#34d399; border:1px solid #10b981; }
.node-special { background:#3b1f5e; color:#c084fc; border:1px solid #a855f7; }
.node-end     { background:#3d1a1a; color:#f87171; border:1px solid #ef4444; }
.node-router  { background:#3d3314; color:#fbbf24; border:1px solid #f59e0b; }

/* Log entry */
.log-entry {
    padding: 8px 14px;
    border-radius: 8px;
    margin-bottom: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    border-left: 3px solid;
    animation: fadeIn 0.3s ease-in;
}
@keyframes fadeIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; } }
.log-init    { background:#0f1f3d; border-color:#3b82f6; color:#93c5fd; }
.log-node    { background:#0f2d1f; border-color:#10b981; color:#6ee7b7; }
.log-router  { background:#2d2900; border-color:#f59e0b; color:#fcd34d; }
.log-special { background:#1e0f3d; border-color:#a855f7; color:#d8b4fe; }
.log-end     { background:#2d0f0f; border-color:#ef4444; color:#fca5a5; }
.log-done    { background:#0f2d1f; border-color:#059669; color:#6ee7b7; }

/* State table */
.state-table { width:100%; border-collapse:collapse; font-family:'JetBrains Mono',monospace; font-size:0.85rem; }
.state-table th { background:#1e1e3a; color:#94a3b8; padding:8px 14px; text-align:left;
                  border-bottom:1px solid #2d2d4e; font-weight:500; }
.state-table td { padding:8px 14px; border-bottom:1px solid #1a1a2e; color:#e2e8f0; vertical-align:top; }
.state-table tr:hover td { background:#1a1a2e; }

/* Graph diagram */
.graph-box {
    background: #0f0f1a;
    border: 1px solid #1e1e3a;
    border-radius: 12px;
    padding: 16px;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.82rem;
}
.g-node {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 8px;
    margin: 4px;
    font-weight: 500;
}
.g-active { background:#064e3b; color:#34d399; border:2px solid #10b981;
            box-shadow: 0 0 12px rgba(16,185,129,0.4); }
.g-visited { background:#1a3d2e; color:#10b981; border:2px solid #1a3d2e; }
.g-inactive { background:#1e1e3a; color:#64748b; border:2px dashed #2d2d4e; }
.g-start { background:#1e3a5f; color:#60a5fa; border:2px solid #3b82f6; }
.g-end { background:#3d1a1a; color:#f87171; border:2px solid #ef4444; }
.g-arrow { color:#475569; font-size:1.2rem; display:block; margin:2px auto; }

/* Divider */
hr { border: none; border-top: 1px solid #1e1e3a !important; margin: 20px 0 !important; }

/* Metric */
.metric-box {
    background: #13131f;
    border: 1px solid #1e1e3a;
    border-radius: 12px;
    padding: 14px 18px;
    text-align: center;
}
.metric-val { font-size: 2rem; font-weight: 700; color: #00d4ff; }
.metric-label { font-size: 0.8rem; color: #64748b; margin-top: 2px; }
</style>
""", unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────
# LANGGRAPH CORE (same logic as hello_langgraph.py)
# ─────────────────────────────────────────────────────────────────
class GreetingState(TypedDict):
    name: str
    message: str
    step_count: int


def greet_node(state: GreetingState) -> dict:
    name = state["name"]
    return {
        "message": f"Hello, {name}! Welcome to LangGraph.",
        "step_count": state["step_count"] + 1,
    }


def special_node(state: GreetingState) -> dict:
    return {
        "message": state["message"] + " You are a VIP user! 🌟",
        "step_count": state["step_count"] + 1,
    }


def decide_route(state: GreetingState) -> str:
    if state["name"].strip().lower() == "bala":
        return "special_node"
    return END


def build_graph():
    graph = StateGraph(GreetingState)
    graph.add_node("greet_node", greet_node)
    graph.add_node("special_node", special_node)
    graph.add_edge(START, "greet_node")
    graph.add_conditional_edges(
        "greet_node",
        decide_route,
        {"special_node": "special_node", END: END},
    )
    graph.add_edge("special_node", END)
    return graph.compile()


# ─────────────────────────────────────────────────────────────────
# SIDEBAR — graph diagram + concepts
# ─────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## 🦜 LangGraph Demo")
    st.markdown("*No API key required*")
    st.markdown("---")

    st.markdown("### 📊 Graph Structure")

    # Build dynamic diagram based on session state
    visited = st.session_state.get("visited_nodes", set())

    def node_cls(name):
        if name in visited:
            return "g-visited"
        return "g-inactive"

    def active_cls(name):
        if name == st.session_state.get("active_node"):
            return "g-active"
        return node_cls(name)

    st.markdown(f"""
    <div class="graph-box">
      <span class="g-node g-start">▶ START</span>
      <span class="g-arrow">↓</span>
      <span class="g-node {active_cls('greet_node')}">greet_node</span>
      <span class="g-arrow">↓  [router]</span>
      <div style="display:flex; justify-content:center; gap:12px; align-items:flex-start; margin:4px 0;">
        <div>
          <span class="g-node {active_cls('special_node')}">special_node</span>
          <span class="g-arrow" style="font-size:0.75rem; color:#7c3aed;">VIP path</span>
        </div>
        <div>
          <span style="color:#475569; font-size:0.8rem; margin-top:6px; display:block;">normal path</span>
        </div>
      </div>
      <span class="g-arrow">↓</span>
      <span class="g-node g-end">⏹ END</span>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("---")
    st.markdown("### 📚 Key Concepts")
    st.markdown("""
- **StateGraph** — the graph container
- **State** — data flowing between nodes  
- **Node** — a Python function that processes state
- **Edge** — fixed connection A → B
- **Conditional Edge** — branch based on logic
- **START / END** — entry & exit points
- **`.invoke()`** — run to completion
- **`.stream()`** — step-by-step execution
    """)

    st.markdown("---")
    st.markdown("### ℹ️ About")
    st.markdown("""
Try entering:
- **Any name** → normal path  
- **`bala`** → VIP path with `special_node`
    """)
    st.markdown("""
<div style="font-size:0.75rem; color:#475569; margin-top:8px;">
LangGraph v1.2.12 · Python 3.14 · No API key
</div>
""", unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────
# MAIN AREA
# ─────────────────────────────────────────────────────────────────
st.markdown("# 🦜 LangGraph Visual Demo")
st.markdown("##### Interact with a live LangGraph workflow — watch nodes execute in real time")

st.markdown("---")

# ── Input ──────────────────────────────────────────────────────
col_input, col_btn = st.columns([4, 1])
with col_input:
    name_input = st.text_input(
        "Enter your name",
        value=st.session_state.get("last_name", ""),
        placeholder="Type any name (try 'bala' for VIP path)…",
        label_visibility="visible",
        key="name_field",
    )
with col_btn:
    st.markdown("<div style='margin-top:28px'></div>", unsafe_allow_html=True)
    run_clicked = st.button("▶ Run Graph", key="run_btn", use_container_width=True)


# ── Placeholders for live rendering ────────────────────────────
col_left, col_right = st.columns([3, 2])

with col_left:
    st.markdown("### 🔄 Execution Log")
    log_placeholder = st.empty()

with col_right:
    st.markdown("### 📦 Live State")
    state_placeholder = st.empty()

st.markdown("---")
result_placeholder = st.empty()
metrics_placeholder = st.empty()


# ── Helpers ─────────────────────────────────────────────────────
def render_log(entries):
    html = ""
    for entry in entries:
        css = entry.get("css", "log-node")
        html += f'<div class="log-entry {css}">{entry["text"]}</div>'
    log_placeholder.markdown(html, unsafe_allow_html=True)


def render_state(state_dict):
    rows = ""
    for k, v in state_dict.items():
        display_v = f'"{v}"' if isinstance(v, str) else str(v)
        rows += f"<tr><td><b>{k}</b></td><td>{display_v}</td></tr>"
    state_placeholder.markdown(f"""
    <table class="state-table">
      <thead><tr><th>Key</th><th>Value</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    """, unsafe_allow_html=True)


def render_result(final_state, elapsed):
    result_placeholder.markdown(f"""
    <div class="card-success">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
        <span style="font-size:1.4rem">✅</span>
        <span style="font-size:1.1rem; font-weight:600; color:#34d399;">Final Result</span>
        <span style="margin-left:auto; font-size:0.8rem; color:#059669; background:#052e16;
               padding:3px 10px; border-radius:999px; border:1px solid #059669;">SUCCESS</span>
      </div>
      <div style="font-size:1.15rem; color:#d1fae5; font-weight:500; margin-bottom:8px;">
        💬 {final_state['message']}
      </div>
      <div style="font-size:0.85rem; color:#6ee7b7; margin-top:8px;">
        Nodes executed: <b>{final_state['step_count']}</b> &nbsp;|&nbsp;
        Completed in: <b>{elapsed:.3f}s</b>
      </div>
    </div>
    """, unsafe_allow_html=True)


# ── RUN when button clicked ──────────────────────────────────────
if run_clicked and name_input.strip():
    name = name_input.strip()
    st.session_state["last_name"] = name
    st.session_state["visited_nodes"] = set()
    st.session_state["active_node"] = None

    app = build_graph()
    initial_state: GreetingState = {"name": name, "message": "", "step_count": 0}

    log_entries = []
    current_state = dict(initial_state)
    visited = set()

    # Init log
    log_entries.append({
        "css": "log-init",
        "text": f'🚀 Graph initialized &nbsp;→&nbsp; <b>name</b> = "{name}"'
    })
    render_log(log_entries)
    render_state(current_state)
    time.sleep(0.4)

    # START entry
    log_entries.append({
        "css": "log-init",
        "text": '▶ Entering node: <span class="node-pill node-start">START</span>'
    })
    render_log(log_entries)
    time.sleep(0.4)

    # Stream step by step
    t0 = time.time()
    for chunk in app.stream(initial_state):
        for node_name, updates in chunk.items():
            visited.add(node_name)
            st.session_state["visited_nodes"] = visited
            st.session_state["active_node"] = node_name

            # Pick CSS class for this node
            if node_name == "greet_node":
                pill = '<span class="node-pill node-greet">greet_node</span>'
                css = "log-node"
            elif node_name == "special_node":
                pill = '<span class="node-pill node-special">special_node</span>'
                css = "log-special"
            else:
                pill = f'<span class="node-pill node-greet">{node_name}</span>'
                css = "log-node"

            log_entries.append({
                "css": css,
                "text": f'⚙ Executing node: {pill}'
            })
            render_log(log_entries)
            time.sleep(0.35)

            # Show what the node returned
            for key, val in updates.items():
                display_val = f'"{val}"' if isinstance(val, str) else str(val)
                log_entries.append({
                    "css": css,
                    "text": f'&nbsp;&nbsp;&nbsp;↳ state[<b>{key}</b>] = {display_val}'
                })
            render_log(log_entries)

            # Update live state panel
            current_state.update(updates)
            render_state(current_state)
            time.sleep(0.4)

            # Router decision
            if node_name == "greet_node":
                if name.lower() == "bala":
                    route_target = "special_node"
                    route_desc = "name == 'bala' → <b>VIP path</b>"
                else:
                    route_target = "END"
                    route_desc = "name != 'bala' → <b>normal path</b>"
                log_entries.append({
                    "css": "log-router",
                    "text": f'🔀 Router: {route_desc} → '
                            f'<span class="node-pill node-router">{route_target}</span>'
                })
                render_log(log_entries)
                time.sleep(0.4)

    elapsed = time.time() - t0

    # END
    log_entries.append({
        "css": "log-end",
        "text": '⏹ Reached node: <span class="node-pill node-end">END</span>'
    })
    render_log(log_entries)
    time.sleep(0.25)

    log_entries.append({
        "css": "log-done",
        "text": f'✅ Graph execution complete in <b>{elapsed:.3f}s</b>'
    })
    render_log(log_entries)

    st.session_state["active_node"] = None

    # Final result
    render_result(current_state, elapsed)

    # Metrics row
    path_taken = "VIP Path (greet → special → END)" if "special_node" in visited else "Normal Path (greet → END)"
    metrics_placeholder.markdown(f"""
    <div style="display:flex; gap:16px; margin-top:8px;">
      <div class="metric-box" style="flex:1">
        <div class="metric-val">{current_state['step_count']}</div>
        <div class="metric-label">Nodes Executed</div>
      </div>
      <div class="metric-box" style="flex:1">
        <div class="metric-val">{elapsed:.2f}s</div>
        <div class="metric-label">Total Runtime</div>
      </div>
      <div class="metric-box" style="flex:2">
        <div class="metric-val" style="font-size:0.95rem; padding:4px 0">{path_taken}</div>
        <div class="metric-label">Route Taken</div>
      </div>
    </div>
    """, unsafe_allow_html=True)

    st.rerun()  # refresh sidebar to update node colors

elif run_clicked and not name_input.strip():
    st.warning("⚠️ Please enter a name before running the graph.")

# ── Empty state ──────────────────────────────────────────────────
elif not run_clicked and not st.session_state.get("last_name"):
    col_left.empty()
    col_right.empty()
    log_placeholder.markdown("""
    <div style="text-align:center; padding:40px 20px; color:#334155;">
      <div style="font-size:2.5rem; margin-bottom:12px;">🦜</div>
      <div style="font-size:1rem; color:#475569;">
        Enter a name above and click <b style="color:#00d4ff;">▶ Run Graph</b><br>
        to watch the LangGraph workflow execute step by step.
      </div>
    </div>
    """, unsafe_allow_html=True)
