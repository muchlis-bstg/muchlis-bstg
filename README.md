# Muchlis Bstg — Enterprise Export Web Application

> **Full-stack Product Developer building secure, production-oriented web applications for enterprise and export businesses.**

## 🚢 ExportOS — Enterprise Export Operations

This repository is now the product-facing foundation for an **Enterprise Export Web Application** designed around real B2B export workflows.

### Demo modules

- Dashboard / command center
- Buyer management
- RFQ & quotation pipeline
- Sales orders
- Shipment control tower
- Approval workflow
- Audit trail
- Management reporting

### Product workflow

Buyer → RFQ → Quotation → Approval → Sales Order → Export Documents → Shipment → Delivery → Reporting

## Repository structure

```text
apps/
  web/
    index.html       # responsive enterprise dashboard
    styles.css       # responsive UI system
    app.js           # demo interactions

docs/
  product-spec.md    # product scope, users, workflow and API direction
```

## Engineering direction

The UI is intentionally separated from the future API layer so the product can evolve toward:

- **Frontend:** Next.js / React / TypeScript
- **Backend:** REST API with Node.js or Laravel
- **Database:** PostgreSQL / Supabase
- **Authentication:** secure sessions + RBAC
- **Quality:** unit, integration, API and E2E tests
- **CI/CD:** GitHub Actions
- **Observability:** health checks, request IDs and audit events\n- **Operational audit:** paginated audit queries with entity/action filters
- **Security:** least privilege, validation, transactional mutations and production approval gates

## Enterprise security requirements

The production implementation will require:

1. Server-side authorization for protected operations
2. Tenant isolation for multi-company deployments
3. Validated and bounded inputs
4. Parameterized database queries
5. Transactional business-critical mutations
6. Secure session and cookie configuration
7. Immutable audit history for sensitive actions
8. Structured logs with correlation IDs
9. Automated security and quality gates
10. Human approval for high-impact production actions

## Client use cases

Built as a portfolio foundation for:

- Exporters and manufacturers
- Trading companies
- B2B distributors
- International sales teams
- Logistics and shipment operations
- Enterprise back-office workflows

## Product development approach

**Business problem → PRD → UX/UI → Architecture → Implementation → Testing → CI/CD → Staging → Human approval → Production**

The goal is not only a polished interface, but a **secure, measurable and maintainable business system**.

---

### Muchlis Bstg

**Full-stack Product Developer · Enterprise Web Applications · Export & B2B Systems**

Focus: **security · reliability · maintainability · business value**
