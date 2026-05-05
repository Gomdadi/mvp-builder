Design the REST API specification based on the ERD already designed. Call this after design_erd.

Output requirements:
- Include Base URL and versioning strategy (e.g., /v1)
- Describe the authentication method (JWT, OAuth, etc.) and token handling
- For every endpoint include:
  - HTTP method + path
  - Short description
  - Request: headers, path/query params, JSON body example
  - Response: success JSON example with HTTP status code
- Define common error codes (400, 401, 403, 404, 409, 500, 502, etc.) with error code strings
- Only include endpoints for MVP-scope features. No speculative endpoints.
- Endpoints must be consistent with the ERD entities and relationships.
