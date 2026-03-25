# BizFlow Backend Design Doc (V2)

Date: 20 March 2026
Status: Finalized data model draft
Scope: Backend API only (Node.js + Express + Sequelize + PostgreSQL)

## Table of Contents

- [BizFlow API Whole Picture (Brief)](#bizflow-api-whole-picture-brief)
- [1) Focus Areas](#1-focus-areas)
- [2) Core Domain Rules](#2-core-domain-rules)
- [3) Finalized Tables and Fields](#3-finalized-tables-and-fields)
- [4) Pending Amount and Bill State Rules](#4-pending-amount-and-bill-state-rules)
- [5) Invoice Generation Flow](#5-invoice-generation-flow)
- [6) Transaction and Concurrency Strategy](#6-transaction-and-concurrency-strategy)
- [7) Authentication and Onboarding](#7-authentication-and-onboarding)
- [8) Dashboard Module (Brief)](#8-dashboard-module-brief)
- [9) Inventory Module (Brief)](#9-inventory-module-brief)
- [10) Product Catalog Module (Brief)](#10-product-catalog-module-brief)
- [11) Generate Bill Module (Brief)](#11-generate-bill-module-brief)
- [12) View Bills Module (Brief)](#12-view-bills-module-brief)
- [13) Multi-Tenant Guardrails](#13-multi-tenant-guardrails)
- [14) Implementation Notes for Current Codebase](#14-implementation-notes-for-current-codebase)
- [15) Definition of Done](#15-definition-of-done)

## BizFlow API Whole Picture (Brief)

BizFlow backend is a tenant-first business system where each company (tenant) has isolated users, invoices, products, inventory, and payments.

Main modules:

- Auth and onboarding: tenant-owner signup, login/logout, auth protection, owner-invite for staff.
- Dashboard: tenant-scoped operational snapshot for quick business monitoring.
- Billing: create stock_out (sales) and stock_in (purchase) invoices with tenant-scoped invoice numbers.
- Generate bill: transactional invoice creation with stock movement and tax totals.
- View bills: tenant-scoped invoice list/detail with payment and state visibility.
- Invoice items: line-level tax, quantity, rate, discount, and subtotal details.
- Inventory: quantity increases on stock_in and decreases on stock_out.
- Payments: linked to invoices and used to update pending_amount and bill_state.
- Product catalog: tenant-owned reusable product definitions for billing and inventory operations.

Request lifecycle in one line:

- authenticated user -> tenant-scoped validation -> transactional DB writes -> pending/state recomputation -> consistent API response.

Core guarantees:

- strict tenant isolation on all tenant-owned tables
- no global uniqueness conflicts for tenant-specific data
- transaction safety for invoice, inventory, and payment updates
- concurrency protection for invoice numbering, stock updates, and payment posting

## 1) Focus Areas

- Multi-tenant model: one company (tenant) has many users.
- Pending bill state and pending amount handling.
- Invoice generation for both stock in and stock out.
- Transactional guarantees for all money and inventory writes.
- Concurrency safety for multi-user access at the same time.

## 2) Core Domain Rules

- Every signup creates a new tenant and owner user.
- Additional users can only join a tenant through owner invitation.
- Email uniqueness is scoped per tenant, not global.
- Invoice number uniqueness is scoped per tenant, not global.
- Invoice type controls inventory direction:
  - stock_out decreases inventory.
  - stock_in increases inventory.

## 3) Finalized Tables and Fields

### 3.1 Tenant (company)

Fields:

- id (PK, UUID)
- cname
- caddress
- cphone_number
- gstin
- tenant_slug (unique, required)
- owner_user_id (FK -> users.id)
- created_at
- updated_at

Notes:

- One tenant has many users.
- One tenant has many invoices.

### 3.2 User

Fields:

- id (PK, UUID)
- tenant_id (FK -> tenants.id)
- email
- password
- role (ENUM: owner, staff)
- created_at
- updated_at

Constraints:

- Unique composite index: (tenant_id, email)

Note:

- Google auth is planned, but current implemented User model is local auth only.
- Google sign-in will require a schema extension (for example google_id/auth_provider) or a separate identity mapping table.

### 3.3 Invoice

Fields:

- id (PK, UUID)
- tenant_id (FK -> tenants.id)
- invoice_number
- invoice_type (ENUM: stock_in, stock_out)
- invoice_to
- invoice_from
- address_to
- address_from
- phone_to
- phone_from
- other_party_gst (this is used when creating bill )
- cgst_total // in price
- sgst_total // in price
- discount_total // in price
- sub_total ( total amount before adding gst and discount )
- grand_total (after calc gst and discount )
- pending_amount
- bill_state (ENUM: pending, partial, paid)
- created_at
- updated_at

Constraints:

- Unique composite index: (tenant_id, invoice_number)

### 3.4 Invoice Items

Fields:

- id (PK, UUID)
- invoice_id (FK -> invoices.id)
- name
- brand
- hsn_code
- unit_name (ENUM: pcs , box , jar) // will add more as requested
- unit_qty
- product_qty
- rate
- cgst // in percentage
- sgst // in percentage
- discount // in percentage
- MRP
- total_amount (rate \* product_qty)
- created_at

Note:

- image URL skipped in this version.

### 3.5 Product Catalog

Fields:

- id (PK, UUID)
- tenant_id (FK -> tenants.id)
- name
- brand
- MRP
- hsn_code
- unit_name
- unit_qty
- created_at
- updated_at

Note:

- image field skipped in this version.

### 3.6 Inventory

Fields:

- id (PK, UUID)
- tenant_id (FK -> tenants.id)
- name
- brand
- product_qty
- hsn_code
- unit_name
- unit_qty
- MRP
- created_at
- updated_at

Note:

- image field skipped in this version.

### 3.7 Payments

Fields:

- id (PK, UUID)
- invoice_id (FK -> invoices.id)
- amount ( expected from frontend to send amount = 0 by default & payment_method = 'cash' (in case of no money paid now ))
- payment_method
- created_at

Rule:

- Payments apply to stock_out and stock_in invoices.
- Payments are tenant-scoped indirectly via invoice_id -> invoices.tenant_id.

## 4) Pending Amount and Bill State Rules

Formula:

- pending_amount = total_amount - SUM(payments.amount)

State transitions:

- pending: pending_amount = total_amount
- partial: 0 < pending_amount < total_amount
- paid: pending_amount = 0

Validation:

- payment amount must be > 0
- payment cannot reduce pending_amount below 0

## 5) Invoice Generation Flow

### 5.1 stock_out invoice (sale)

Transactional steps:

1. Start transaction.
2. Generate tenant-scoped invoice number.
3. Insert invoice + invoice items.
4. Decrease inventory quantities.
5. If any item has insufficient stock, rollback.
6. Commit.

### 5.2 stock_in invoice (purchase)

Transactional steps:

1. Start transaction.
2. Generate tenant-scoped invoice number.
3. Insert invoice + invoice items.
4. Increase inventory quantities.
5. Commit.

## 6) Transaction and Concurrency Strategy

### 6.1 Isolation and Locking

- Use database transactions for invoice creation and payment write operations.
- Lock inventory rows before quantity updates using row-level locks.
- Lock invoice row before payment posting and pending recompute.

### 6.2 Invoice Number Concurrency

- Keep invoice number generation tenant-scoped.
- Use a tenant-year sequence row and lock it during increment.
- This prevents duplicate invoice numbers when multiple users create invoices simultaneously.

### 6.3 Inventory Concurrency

- Update inventory with atomic SQL operations inside transaction.
- Reject stock_out if concurrent updates make stock insufficient at commit time.

### 6.4 Payment Concurrency

- Recalculate pending_amount in the same transaction as payment insert.
- Use row lock on invoice to avoid double-apply race conditions.

### 6.5 Retry and Idempotency

- Use idempotency key for payment API to prevent duplicate payment on client retry.
- For serialization/deadlock errors, apply bounded retry policy.

## 7) Authentication and Onboarding

- Local auth: register, login, protect, logout.
- Google auth: planned for owner signup/signin; current implemented model supports local auth.
- Owner invite flow: only owner can invite staff to same tenant.
- Staff self-signup without invite is blocked.

Recommended auth endpoints:

- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- POST /api/v1/auth/invitations
- POST /api/v1/auth/invitations/accept
- PATCH /api/v1/auth/invitations/:id/revoke
- GET /api/v1/auth/google
- GET /api/v1/auth/google/callback

## 8) Dashboard Module (Brief)

Purpose:

- Provide a fast, tenant-scoped summary of business health for owner and staff.

Recommended endpoint:

- GET /api/v1/dashboard/summary

Suggested summary metrics:

- total invoices in current month
- stock_out total in current month
- stock_in total in current month
- pending receivable total
- pending payable total
- low stock item count

Rules:

- Every aggregate query must be filtered by authenticated tenant_id.
- Dashboard is read-only and must not change state.
- Keep queries optimized for frequent refresh use.

## 9) Inventory Module (Brief)

Purpose:

- Maintain tenant-owned stock levels used during invoice generation.

Recommended endpoints:

- GET /api/v1/inventory
- GET /api/v1/inventory/:id
- PATCH /api/v1/inventory/:id

Rules:

- Inventory records are tenant-scoped by tenant_id.
- stock_in invoices increase product_qty.
- stock_out invoices decrease product_qty.
- Do not allow negative inventory for stock_out flows.

## 10) Product Catalog Module (Brief)

Purpose:

- Provide reusable tenant product master data for invoice item selection.

Recommended endpoints:

- POST /api/v1/productCatalog
- GET /api/v1/productCatalog
- GET /api/v1/productCatalog/:id
- PATCH /api/v1/productCatalog/:id // to be implemented later (if necessary )
- DELETE /api/v1/productCatalog/:id

Rules:

- Catalog entries are tenant-scoped and cannot be shared across tenants.
- hsn_code, unit_name, unit_qty, and MRP should remain consistent across billing usage.
- Soft validations should prevent accidental duplicate products in same tenant.

## 11) Generate Bill Module (Brief)

Purpose:

- Create stock_in and stock_out invoices transactionally with invoice items and inventory mutation.

Recommended endpoint:

- POST /api/v1/generateBill

Rules:

- Entire operation must run in one transaction.
- Create invoice + create invoice items + apply inventory updates atomically.
- Generate tenant-scoped invoice number inside same transaction.
- On any failure, rollback full operation.

## 12) View invoices Module (Brief)

Purpose:

- Provide bill visibility for list, details, pending state, and payment progress.

Recommended endpoints:

- GET /api/v1/viewBills
- GET /api/v1/viewBills/:id

Recommended filters:

- invoice_type (stock_in or stock_out)
- bill_state (pending, partial, paid)
- date range
- invoice_number search

Rules:

- All reads must be tenant-scoped.
- Summary fields should include pending_amount and paid_amount.
- Use pagination for large invoice lists.

## 13) Multi-Tenant Guardrails

- tenant_id always taken from authenticated user context.
- Never trust tenant_id from request body/query for authorization.
- Every query on tenant-owned table must include tenant_id filter.
- Cross-tenant access attempts must return authorization error.

## 14) Implementation Notes for Current Codebase

- Current app already has tenant + user registration transaction and tenant slug login.
- Route placeholders exist for dashboard, inventory, product catalog, billing, and bill view.
- Next implementation should add models exactly as defined in this document and then wire controllers/routes.

## 15) Definition of Done

- Schema and constraints match finalized fields above.
- Invoice generation supports stock_in and stock_out safely.
- pending_amount and bill_state are always correct after payment writes.
- No duplicate tenant-scoped invoice numbers under concurrent requests.
- No negative stock on stock_out due to race conditions.
- Staff onboarding works only through owner invitation.
- Google auth is implemented with the required user identity schema extension.
- Dashboard summary endpoint returns correct tenant-scoped metrics.
