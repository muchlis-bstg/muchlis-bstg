import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createPool } from "../apps/api/src/db.js";
import { createApp } from "../apps/api/src/server.js";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? test : test.skip;

let pool;
let server;
let baseUrl = "";
let salesCookie = "";
let financeCookie = "";
let operationsCookie = "";

async function request(path, options = {}, cookie = "") {
  const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(baseUrl + path, { ...options, headers });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  return { response, data };
}

async function registerAndLogin(email) {
  const password = "Integration-Test-123!";
  const register = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.equal(register.response.status, 201);

  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.response.status, 200);

  const setCookie = login.response.headers.get("set-cookie");
  assert.ok(setCookie);
  return setCookie.split(";")[0];
}

integration("full export workflow persists through PostgreSQL", async () => {
  pool = createPool();
  const app = createApp(pool);
  server = createServer((req, res) => void app(req, res));

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const suffix = Date.now();
  salesCookie = await registerAndLogin(`sales-${suffix}@example.test`);
  financeCookie = await registerAndLogin(`finance-${suffix}@example.test`);
  operationsCookie = await registerAndLogin(`ops-${suffix}@example.test`);

  await pool.query("UPDATE users SET role='FINANCE' WHERE email=$1", [`finance-${suffix}@example.test`]);
  await pool.query("UPDATE users SET role='OPERATIONS' WHERE email=$1", [`ops-${suffix}@example.test`]);

  const buyer = await request("/api/buyers", {
    method: "POST",
    body: JSON.stringify({ name: "Integration Buyer", country: "Indonesia" }),
  }, salesCookie);
  assert.equal(buyer.response.status, 201);

  const rfq = await request("/api/rfqs", {
    method: "POST",
    body: JSON.stringify({
      buyerId: buyer.data.id,
      reference: `RFQ-IT-${suffix}`,
      currency: "USD",
      estimatedValue: 125000,
    }),
  }, salesCookie);
  assert.equal(rfq.response.status, 201);

  const quotation = await request("/api/quotations", {
    method: "POST",
    body: JSON.stringify({
      rfqId: rfq.data.id,
      currency: "USD",
      totalValue: 120000,
      validUntil: "2030-12-31",
      notes: "Integration test quotation",
    }),
  }, salesCookie);
  assert.equal(quotation.response.status, 201);

  const submit = await request(`/api/quotations/${quotation.data.id}/submit`, {
    method: "POST",
  }, salesCookie);
  assert.equal(submit.response.status, 200);

  const selfApproval = await request(`/api/quotations/${quotation.data.id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision: "APPROVED" }),
  }, salesCookie);
  assert.equal(selfApproval.response.status, 403);

  const approval = await request(`/api/quotations/${quotation.data.id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision: "APPROVED", comment: "Approved by finance" }),
  }, financeCookie);
  assert.equal(approval.response.status, 200);

  const order = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      quotationId: quotation.data.id,
      orderNumber: `SO-IT-${suffix}`,
    }),
  }, salesCookie);
  assert.equal(order.response.status, 201);

  const shipment = await request("/api/shipments", {
    method: "POST",
    body: JSON.stringify({
      salesOrderId: order.data.id,
      carrier: "Integration Carrier",
      trackingNumber: `TRACK-${suffix}`,
      etd: "2030-01-10",
      eta: "2030-01-20",
    }),
  }, operationsCookie);
  assert.equal(shipment.response.status, 201);

  const transit = await request(`/api/shipments/${shipment.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "IN_TRANSIT" }),
  }, operationsCookie);
  assert.equal(transit.response.status, 200);

  const delivered = await request(`/api/shipments/${shipment.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "DELIVERED" }),
  }, operationsCookie);
  assert.equal(delivered.response.status, 409);

  const arrived = await request(`/api/shipments/${shipment.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "ARRIVED" }),
  }, operationsCookie);
  assert.equal(arrived.response.status, 200);

  const deliveredAfterArrival = await request(`/api/shipments/${shipment.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "DELIVERED" }),
  }, operationsCookie);
  assert.equal(deliveredAfterArrival.response.status, 200);

  const management = await request("/api/management", {}, salesCookie);
  assert.equal(management.response.status, 200);
  assert.ok(management.data.openOrders >= 1);

  const audit = await request("/api/audit?limit=100", {}, financeCookie);
  assert.equal(audit.response.status, 200);
  assert.ok(audit.data.items.length >= 6);\n\n  const filteredAudit = await request("/api/audit?entityType=shipment&action=STATUS_CHANGED&limit=10", {}, financeCookie);\n  assert.equal(filteredAudit.response.status, 200);\n  assert.ok(filteredAudit.data.pagination);\n  assert.ok(filteredAudit.data.pagination.total >= 2);\n  assert.equal(filteredAudit.data.pagination.hasMore, false);
});

integration.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
});
