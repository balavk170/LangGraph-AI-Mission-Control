# LangGraph AI Mission Control 🚀

An interactive, portfolio-level web application designed to demonstrate and visualize **LangGraph stateful AI agent workflows** in real time. This project showcases how to build production-grade AI agent orchestration using LangGraph, FastAPI, Server-Sent Events (SSE), and a modern vanilla web frontend.

---

## 📖 What is LangGraph?

**LangGraph** is a powerful framework built by LangChain to create **stateful, controllable, multi-actor AI agent workflows** as directed computational graphs. 

Unlike traditional Directed Acyclic Graph (DAG) tools or simple LLM prompt chains, LangGraph supports:
- 🔄 **State Persistence:** A shared data structure (`TypedDict`) passed from node to node, accumulating context.
- 🔀 **Conditional Routing:** Dynamic decision nodes that inspect state and choose downstream execution paths dynamically.
- 🌊 **Streaming:** Built-in support for streaming execution steps as they happen.
- 🛑 **Human-in-the-Loop:** Capability to pause execution for user approval or input.

---

## ✨ Features

1. **Mission Control UI:** Responsive dashboard with live workflow, AgentState, event trace, run history, and node inspection.
2. **Real LangGraph Streaming:** SSE events are emitted from the compiled `StateGraph`; the graph display follows the backend execution.
3. **Intent Routing and Responses:** Gemini 1.5 Flash is used when configured; deterministic classification and support guidance are used otherwise.
4. **Persistent Execution Data:** SQLite stores run history, measured latency, session turns, and aggregate analytics.
5. **Local Knowledge Retrieval:** Upload PDF, TXT, Markdown, CSV, JSON, or HTML documents. SQLite FTS5 retrieves text chunks for actual graph runs and returns source citations. This is lexical full-text retrieval, not vector search.
6. **Session Memory:** The graph loads previous successful turns for the active session before response generation.
7. **Inspectable Execution:** The workflow, event timeline, JSON AgentState, source list, and tool-use metadata are driven by server events.
8. **Honest Integration Boundaries:** No payment/order/account APIs, critic/retry, parallel execution, or human-approval gate are claimed as implemented.

---

## 🏗️ Project Architecture & Folder Structure

```text
langgraph/
├── backend/
│   ├── main.py            # FastAPI routes, REST APIs, SSE streaming, static asset mount
│   ├── graph_runner.py    # LangGraph StateGraph, Gemini/fallback response and routing
│   └── platform_store.py  # SQLite run history, session memory, and FTS5 document index
├── frontend/
│   ├── index.html         # Product landing page
│   ├── dashboard.html     # Live Mission Control dashboard
│   ├── workspace.html     # Shared analytics/history/KB/settings shell
│   ├── dashboard.js       # SSE client, workflow state, and server metrics
│   ├── workspace.js       # History, analytics, knowledge, and memory APIs
│   ├── *.css              # Landing, dashboard, and workspace styles
│   └── *.html             # How-it-works, architecture, and about pages
├── .env.example           # Example environment variables
├── requirements.txt       # Python dependencies
└── README.md              # Project documentation
```

---

## ⚡ How the Workflow Works

The backend utilizes a compiled LangGraph `StateGraph` that processes natural language requests:

1. **START → MEMORY RECALL:** Initializes the `AgentState` and loads recent successful turns from the session's SQLite history.
2. **INTENT ANALYZER:** Classifies the request with Gemini when configured, otherwise deterministic keyword classification.
3. **KNOWLEDGE RETRIEVER:** Searches uploaded local documents using SQLite FTS5 and includes matched passages as cited sources.
4. **CONDITIONAL ROUTER:** Selects one specialist branch (Billing, Technical Support, Order, Account, or General).
5. **RESPONSE:** Generates a grounded Gemini response when configured, or deterministic support guidance; external business systems are not connected.
6. **END:** Emits the final state and summary. FastAPI persists the successful run and exposes it to history, memory, and analytics.

Documents and run history are stored in `.data/mission_control.sqlite3` by default. Set `MISSION_CONTROL_DB_PATH` to change the database location. The Knowledge Base uses local lexical full-text search; no vector database is configured.

---

## 🚀 Step-by-Step Guide: How to Run the Project

### Step 1: Prerequisites
- Python 3.10 or higher installed.
- Git (optional, for cloning).

### Step 2: Setup the Environment
Open your terminal and navigate to the project directory:

```bash
# Create a virtual environment (recommended)
python -m venv .venv

# Activate the virtual environment
# On Windows:
.venv\Scripts\activate
# On Mac/Linux:
source .venv/bin/activate
```

### Step 3: Install Dependencies
Install all required Python packages using `pip`:

```bash
pip install -r requirements.txt
```
*(Key dependencies include: `langgraph`, `fastapi`, `uvicorn`, `langchain-google-genai`, `python-dotenv`)*

### Step 4: Configure Environment Variables
1. Copy the `.env.example` file to a new file named `.env`:
   - Windows: `copy .env.example .env`
   - Mac/Linux: `cp .env.example .env`
2. **(Optional but Recommended):** Open the `.env` file and add your Google Gemini API key to enable intelligent intent classification.
   ```env
   GOOGLE_API_KEY=your_api_key_here
   ```
   *Note: If you don't provide an API key, the application will seamlessly fall back to deterministic keyword-based routing, ensuring the demo always works!*

### Step 5: Start the Backend Server
Run the FastAPI server using Uvicorn:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 6: Open the Application
Open your web browser and navigate to:
👉 **[http://localhost:8000](http://localhost:8000)**

You can now explore the landing page, read the documentation sections, and launch the Live Demo to see the agents in action!

---

## 🛑 Stopping the Server
To stop the backend server, simply press `Ctrl + C` in the terminal where Uvicorn is running.

---

## 💼 Interview Demonstration Guide

When presenting this project during a technical interview or portfolio review:

1. **Explain the Architecture:** Start at the `/architecture` page to show the clear separation of concerns (Vanilla JS Frontend → FastAPI → LangGraph → LLM).
2. **Highlight SSE Streaming:** Emphasize that the frontend is NOT simulating the execution. It uses Server-Sent Events (`EventSource`) to stream real-time updates directly from LangGraph's `app.stream()` method.
3. **Demonstrate Routing (Live Demo):** 
   - Try a billing query: *"My payment was deducted twice."* → Watch it route to BILLING.
   - Try a technical query: *"The app crashes on startup."* → Watch it route to TECHNICAL SUPPORT.
4. **Show State Management:** Point to the "Live Agent State" JSON panel to prove that a `TypedDict` is being immutably updated step-by-step.
5. **Interactive Nodes:** Click on the nodes in the SVG graph to open the Node Inspector, demonstrating your deep understanding of LangGraph primitives.
