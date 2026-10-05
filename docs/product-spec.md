# Enterprise Export Web Application — Product Specification

## Objective
Build a secure B2B export operations platform that gives commercial, operations, finance, and management teams one source of truth from buyer inquiry through shipment and delivery.

## Primary users
- Sales: buyers, RFQs, quotations and negotiations
- Operations: orders, production readiness, documents and shipments
- Finance: commercial approval, invoice controls and payment visibility
- Management: pipeline, fulfillment, exceptions and KPIs
- Administrator: users, roles, configuration and audit

## MVP workflow
1. Create buyer
2. Receive RFQ
3. Prepare quotation
4. Submit quotation for approval
5. Convert approved quotation to sales order
6. Track export documents
7. Create shipment and milestones
8. Record delivery
9. Review audit trail and operational KPIs

## Non-functional requirements
- Server-side authorization on every protected mutation
- Tenant isolation where multi-tenancy is introduced
- Parameterized queries and validated input
- Transactional business-critical mutations
- Immutable audit history for sensitive actions
- Secure session and cookie configuration
- Structured application logging with correlation IDs
- Health/readiness endpoints
- Automated unit, integration and end-to-end tests
- CI gates before staging and production
- Human approval for destructive or high-impact production actions

## Proposed domain model
organizations -> users -> roles
buyers -> contacts
rfqs -> quotations -> approvals
orders -> order_items -> documents
shipments -> shipment_events
audit_events

## API direction
- POST /api/auth/*
- GET/POST /api/buyers
- GET/POST /api/rfqs
- GET/POST /api/quotations
- POST /api/quotations/:id/approve
- GET/POST /api/orders
- GET/POST /api/shipments
- GET /api/dashboard
- GET /api/audit-events

The static dashboard in apps/web is intentionally API-agnostic so the backend can be introduced without coupling the presentation layer to mock data.