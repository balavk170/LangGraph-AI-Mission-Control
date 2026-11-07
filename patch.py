import sys

path = 'frontend/index.html'
with open(path, 'r', encoding='latin-1') as f:
    c = f.read()

c = c.replace(
    '''            <div class="nav-right">
                <a href="#" class="active"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg> Mission Control</a>
                <a href="#"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Execution</a>
                <a href="#"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> How It Works</a>
                <a href="#"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg> Architecture</a>
                <a href="#"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> About LangGraph</a>
            </div>
        </header>

        <div class="main-layout">''', 
    '''            <div class="nav-right">
                <a href="#" id="nav-mission-btn" class="active" onclick="switchView('mission')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg> Mission Control</a>
                <a href="#" id="nav-how-btn" onclick="switchView('how')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> How It Works</a>
                <a href="#" id="nav-arch-btn" onclick="switchView('arch')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg> Architecture</a>
                <a href="#" onclick="alert('For documentation, please visit https://langchain-ai.github.io/langgraph/')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> About LangGraph</a>
            </div>
        </header>

        <div class="main-layout" id="mission-control-view">'''
)

c = c.replace(
    '''            </aside>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>''', 
    '''            </aside>
        </div>

        <div class="main-layout" id="how-it-works-view" style="display:none; padding: 40px; overflow-y: auto; flex-direction: column;">
            <h2 style="font-size: 24px; margin-bottom: 24px; color: var(--accent-orange);">How LangGraph Works</h2>
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 20px;">
                <div class="panel" style="width: 300px;">
                    <h3 style="color: var(--accent-blue); margin-bottom: 8px;">STATE</h3>
                    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5;">Information carried through the workflow. It holds all the conversation context and variables.</p>
                </div>
                <div class="panel" style="width: 300px;">
                    <h3 style="color: var(--accent-green); margin-bottom: 8px;">NODE</h3>
                    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5;">A unit of work. Nodes act as agents or tools that perform specific tasks or modifications to the state.</p>
                </div>
                <div class="panel" style="width: 300px;">
                    <h3 style="color: var(--accent-purple); margin-bottom: 8px;">EDGE</h3>
                    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5;">Connection between workflow steps. They dictate the flow of the graph from one node to another.</p>
                </div>
                <div class="panel" style="width: 300px;">
                    <h3 style="color: var(--accent-cyan); margin-bottom: 8px;">CONDITIONAL ROUTING</h3>
                    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5;">Chooses the next node based on state. Allows for dynamic decision making in the workflow.</p>
                </div>
                <div class="panel" style="width: 300px;">
                    <h3 style="color: var(--accent-green); margin-bottom: 8px;">START</h3>
                    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5;">Workflow entry point where the initial state is provided to the LangGraph execution engine.</p>
                </div>
                <div class="panel" style="width: 300px;">
                    <h3 style="color: var(--accent-red); margin-bottom: 8px;">END</h3>
                    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5;">Workflow termination node. When this is reached, the execution successfully completes.</p>
                </div>
            </div>
        </div>

        <div class="main-layout" id="architecture-view" style="display:none; padding: 40px; overflow-y: auto; flex-direction: column;">
            <h2 style="font-size: 24px; margin-bottom: 24px; color: var(--accent-purple);">System Architecture</h2>
            <div style="margin-top: 20px; font-family: var(--font-mono); font-size: 14px; line-height: 1.6; color: var(--text-main); white-space: pre; background: rgba(0,0,0,0.5); padding: 30px; border-radius: 8px; border: 1px solid var(--border-color); align-self: flex-start;">USER
 &darr;
MISSION CONTROL FRONTEND
 &darr;
FASTAPI
 &darr;
LANGGRAPH
 &darr;
LLM (Gemini / Deterministic Fallback)
 &darr;
INTENT ANALYZER
 &darr;
ROUTER
 &darr;
SPECIALIZED AGENT
 &darr;
RESPONSE GENERATOR
 &darr;
MISSION CONTROL FRONTEND</div>
        </div>

    </div>

    <script src="app.js"></script>
</body>
</html>'''
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
