"""
hello_langgraph.py
==================
A beginner-friendly LangGraph natural-language agent example that runs WITHOUT any API keys.

What it demonstrates:
  - StateGraph      : main graph class holding your workflow
  - TypedDict       : AgentState schema flowing through graph nodes
  - Intent Analyzer : deterministic intent classification node
  - Router Edge     : dynamic conditional routing to specialized nodes
  - Nodes           : BILLING, TECHNICAL SUPPORT, ORDER, ACCOUNT, GENERAL, RESPONSE
  - START / END     : entry and exit points of graph

Workflow topology:
  USER REQUEST --> INTENT ANALYZER --> ROUTER --> [BILLING/TECH/ORDER/ACCOUNT/GENERAL] --> RESPONSE --> END
"""

from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class AgentState(TypedDict):
    input: str
    intent: str
    confidence: float
    reasoning: str
    current_node: str
    selected_route: str
    step_count: int
    status: str
    response: str

def classify_intent_deterministic(text: str):
    text_lower = text.lower().strip()
    if any(k in text_lower for k in ["payment", "deducted", "charge", "refund", "invoice", "billed", "subscription"]):
        return ("BILLING", 0.96, "Payment/deduction keywords detected")
    if any(k in text_lower for k in ["crash", "crashes", "upload", "pdf", "bug", "broken", "error"]):
        return ("TECHNICAL SUPPORT", 0.95, "Technical error/crash keywords detected")
    if any(k in text_lower for k in ["password", "forgot", "login", "account", "reset"]):
        return ("ACCOUNT", 0.94, "Account credential/password keywords detected")
    if any(k in text_lower for k in ["order", "shipment", "arrive", "delivery", "tracking"]):
        return ("ORDER", 0.95, "Order tracking/delivery keywords detected")
    return ("GENERAL", 0.88, "General inquiry keywords detected")

def intent_analyzer_node(state: AgentState) -> dict:
    intent, confidence, reasoning = classify_intent_deterministic(state["input"])
    print(f"  [INTENT ANALYZER] Prompt: '{state['input']}' -> Intent: {intent} ({int(confidence*100)}%)")
    return {
        "intent": intent,
        "confidence": confidence,
        "reasoning": reasoning,
        "step_count": state["step_count"] + 1,
        "status": "intent_analyzed"
    }

def decide_route(state: AgentState) -> str:
    intent = state.get("intent", "GENERAL").upper()
    route_map = {
        "BILLING": "billing",
        "TECHNICAL SUPPORT": "tech_support",
        "ORDER": "order",
        "ACCOUNT": "account"
    }
    target = route_map.get(intent, "general")
    print(f"  [ROUTER] Intent '{intent}' -> Routing to node '{target}'")
    return target

def billing_node(state: AgentState) -> dict:
    print("  [BILLING] Executing payment & billing workflow...")
    return {
        "selected_route": "BILLING",
        "step_count": state["step_count"] + 1,
        "response": "Your request has been identified as a billing issue. The billing workflow was selected to handle your payment-related problem."
    }

def tech_support_node(state: AgentState) -> dict:
    print("  [TECHNICAL SUPPORT] Executing tech support diagnostics...")
    return {
        "selected_route": "TECHNICAL SUPPORT",
        "step_count": state["step_count"] + 1,
        "response": "Your issue has been routed to Technical Support. We are inspecting the crash logs and upload handler diagnostics for your request."
    }

def order_node(state: AgentState) -> dict:
    print("  [ORDER] Executing order tracking workflow...")
    return {
        "selected_route": "ORDER",
        "step_count": state["step_count"] + 1,
        "response": "Your request has been routed to Order Management. We have retrieved your shipment status and tracking details."
    }

def account_node(state: AgentState) -> dict:
    print("  [ACCOUNT] Executing account security workflow...")
    return {
        "selected_route": "ACCOUNT",
        "step_count": state["step_count"] + 1,
        "response": "Your inquiry has been routed to Account Support. Instructions to reset your password and verify your credentials have been prepared."
    }

def general_node(state: AgentState) -> dict:
    print("  [GENERAL] Executing general customer inquiry workflow...")
    return {
        "selected_route": "GENERAL",
        "step_count": state["step_count"] + 1,
        "response": "Your inquiry has been routed to the General Assistant. Our standard customer care resources are ready to help."
    }

def response_node(state: AgentState) -> dict:
    print(f"  [RESPONSE] Formatted response ready.")
    return {
        "step_count": state["step_count"] + 1,
        "status": "completed"
    }

def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)
    graph.add_node("intent_analyzer", intent_analyzer_node)
    graph.add_node("billing", billing_node)
    graph.add_node("tech_support", tech_support_node)
    graph.add_node("order", order_node)
    graph.add_node("account", account_node)
    graph.add_node("general", general_node)
    graph.add_node("response", response_node)

    graph.add_edge(START, "intent_analyzer")
    graph.add_conditional_edges(
        source="intent_analyzer",
        path=decide_route,
        path_map={
            "billing": "billing",
            "tech_support": "tech_support",
            "order": "order",
            "account": "account",
            "general": "general"
        }
    )

    graph.add_edge("billing", "response")
    graph.add_edge("tech_support", "response")
    graph.add_edge("order", "response")
    graph.add_edge("account", "response")
    graph.add_edge("general", "response")
    graph.add_edge("response", END)

    return graph

def run_example(prompt: str):
    print(f"\n{'='*65}")
    print(f"  Prompt: '{prompt}'")
    print(f"{'='*65}")

    app = build_graph().compile()
    initial_state: AgentState = {
        "input": prompt,
        "intent": "Pending",
        "confidence": 0.0,
        "reasoning": "",
        "current_node": "START",
        "selected_route": "Pending",
        "step_count": 0,
        "status": "Processing",
        "response": ""
    }

    final_state = app.invoke(initial_state)

    print(f"\n  Final Intent   : {final_state['intent']}")
    print(f"  Selected Route : {final_state['selected_route']}")
    print(f"  Agent Response : {final_state['response']}")
    print(f"  Steps Visited  : {final_state['step_count']}")
    return final_state

if __name__ == "__main__":
    print("\nLangGraph Natural Language Agent Console Demo -- No API Key Required!\n")

    # Test 1: Billing
    run_example("My payment was deducted but my order is still pending.")

    # Test 2: Tech Support
    run_example("My application crashes when I upload a PDF.")

    # Test 3: Order
    run_example("Where is my order? It was supposed to arrive yesterday.")

    # Test 4: Account
    run_example("I forgot my password.")

    # Test 5: General
    run_example("What are your business hours?")

    # Test 6: General Fallback
    run_example("Tell me something random.")

    print("\nAll 6 test cases completed successfully!\n")
