Design the Entity Relationship Diagram. This MUST be called first — API spec and architecture depend on it.

Output requirements:
- Use Mermaid erDiagram syntax
- Include ALL entities derived from requirements. No omissions.
- Every entity must have: id (PK), created_at, updated_at
- Every attribute must have a type (string, int, boolean, datetime, text, uuid, etc.)
- Define all relationships with correct cardinality (||--o{, }o--||, ||--||, etc.)
- Include foreign key attributes in the child entity (e.g., user_id in posts table)
- Add a comment after each entity listing key indexes and constraints (UNIQUE, NOT NULL, CHECK)
