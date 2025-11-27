Query	Type	Question
Q1	Dependency	"What does NavCalculateRoute depend on? List all direct dependencies."
Q2	Impact	"What would be affected if I modify or remove DashReceiveInput? List all downstream impacts."
Q3	Flow Trace	"Trace the complete data flow from UrbanDriver to Passenger through navigation."
Q4	Requirements	"What requirements are satisfied by functions in NavigationModule?"
Q5	Rename	"Rename NavCalculateRoute to ComputeOptimalRoute."
Q6	Create	"Add a new function ValidateDestination between NavReceiveDestination and NavCalculateRoute."
Q7	Delete/Safety	"Check if it's safe to remove EnergyReportStatus. Analyze ontology violations."
Q8	Validation	"Validate the graph against ontology rules (REQ links, MOD allocation, flow chains, etc.)."
Q9  Consistancy  "Are the flow connections and schemes from top level FUNC respected by their nested functions?"
q10 consistancy "Assistant: Perfekt! Ich verstehe jetzt das Problem. Ich prüfe, ob **Nested Functions illegale Cross-Whitebox-Verbindungen** haben.
## Regel:
**Nested Functions dürfen NUR mit:**
1. Anderen Nested Functions **innerhalb derselben Whitebox** kommunizieren
2. Den **Parent-Level Flows** (IN/OUT der Top-Level Function)
**Verboten:**
- Direkte Verbindungen zwischen Nested Functions verschiedener Whiteboxes
