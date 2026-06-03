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

---

## Example

```
## Base URL
https://api.example.com/v1

## Authentication
JWT Bearer token in Authorization header.
- POST /auth/login → returns { accessToken, refreshToken }
- accessToken expires in 1h, refreshToken in 7d
- Protected endpoints require: Authorization: Bearer <accessToken>

## Endpoints

### POST /auth/login
Description: Authenticate user and return tokens

Request:
  Body: { "email": "user@example.com", "password": "secret123" }

Response 200:
  { "accessToken": "eyJ...", "refreshToken": "eyJ...", "user": { "id": "uuid", "email": "user@example.com", "name": "John" } }

Response 401:
  { "error": "INVALID_CREDENTIALS", "message": "Email or password is incorrect" }

---

### GET /projects
Description: List all projects owned by the authenticated user

Request:
  Headers: Authorization: Bearer <accessToken>
  Query: page=1&limit=20

Response 200:
  { "data": [{ "id": "uuid", "title": "My App", "status": "active", "createdAt": "2024-01-01T00:00:00Z" }], "total": 1, "page": 1 }

---

### POST /projects
Description: Create a new project

Request:
  Headers: Authorization: Bearer <accessToken>
  Body: { "title": "My App", "description": "An MVP project" }

Response 201:
  { "id": "uuid", "title": "My App", "status": "draft", "createdAt": "2024-01-01T00:00:00Z" }

Response 409:
  { "error": "DUPLICATE_TITLE", "message": "A project with this title already exists" }

---

## Common Error Codes
| Status | Error Code | Description |
|--------|-----------|-------------|
| 400 | INVALID_INPUT | Request body validation failed |
| 401 | UNAUTHORIZED | Missing or invalid token |
| 403 | FORBIDDEN | Authenticated but not allowed |
| 404 | NOT_FOUND | Resource does not exist |
| 409 | CONFLICT | Duplicate or state conflict |
| 500 | INTERNAL_ERROR | Unexpected server error |
```
