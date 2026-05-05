Design the system architecture based on requirements, ERD, and API spec. Call this after design_api_spec.

Output requirements:
- List all components with their roles and responsibilities
- Include a Mermaid graph TD or C4Context architecture diagram showing:
  - Client → API Gateway → Services → DB data flow
  - External integrations (auth, storage, queues, etc.)
- Describe data flow for key scenarios (e.g., user signup, core feature flow)
- Include security considerations: auth/authorization approach, sensitive data handling
- Reference the tech stack choices from the requirements.
