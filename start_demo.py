"""
start_demo.py
=============
Launches the LangGraph AI Agent Visualizer web server and opens the web application in your default browser.

Usage:
    .venv\\Scripts\\python start_demo.py
"""

import os
import sys
import time
import webbrowser
import uvicorn

def main():
    print("=" * 65)
    print("  [+] Launching LangGraph AI Agent Visualizer Website")
    print("=" * 65)
    print("\n  [URL] Backend API & Frontend URL: http://localhost:8000")
    print("  [*] LangGraph Workflow Engine: Loaded & Active")
    print("  Press Ctrl+C in this terminal to stop the application server.\n")

    # Automatically open browser after 1.5 seconds delay
    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://localhost:8000")

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    # Start Uvicorn FastAPI Server
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)

if __name__ == "__main__":
    main()
