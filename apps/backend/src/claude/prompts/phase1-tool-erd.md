Design the Entity Relationship Diagram. This MUST be called first — API spec and architecture depend on it.

Output requirements:
- Use Mermaid erDiagram syntax
- Include ALL entities derived from requirements. No omissions.
- Every entity must have: id (PK), created_at, updated_at
- Every attribute must have a type (string, int, boolean, datetime, text, uuid, etc.)
- Define all relationships with correct cardinality (||--o{, }o--||, ||--||, etc.)
- Include foreign key attributes in the child entity (e.g., user_id in posts table)
- Add a comment after each entity listing key indexes and constraints (UNIQUE, NOT NULL, CHECK)

---

## Example

```
erDiagram
  USER {
    uuid id PK
    string email "UNIQUE, NOT NULL"
    string password_hash "NOT NULL"
    string name "NOT NULL"
    datetime created_at
    datetime updated_at
  }

  PROJECT {
    uuid id PK
    uuid user_id FK "NOT NULL"
    string title "NOT NULL"
    text description
    string status "CHECK: draft|active|archived"
    datetime created_at
    datetime updated_at
  }

  TASK {
    uuid id PK
    uuid project_id FK "NOT NULL"
    string name "NOT NULL"
    text description
    int order_index "NOT NULL"
    string status "CHECK: pending|in_progress|done|failed"
    datetime created_at
    datetime updated_at
  }

  USER ||--o{ PROJECT : "owns"
  PROJECT ||--o{ TASK : "contains"
```
