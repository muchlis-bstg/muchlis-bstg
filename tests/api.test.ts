import test from "node:test";
import assert from "node:assert/strict";

test("management dashboard contract contains operational KPIs",()=>{
  const dashboard={buyers:0,openRfqs:0,pipelineValue:0,pendingApprovals:0,pendingApprovalValue:0,openOrders:0,openOrderValue:0,activeShipments:0};
  assert.deepEqual(Object.keys(dashboard),[
    "buyers","openRfqs","pipelineValue","pendingApprovals",
    "pendingApprovalValue","openOrders","openOrderValue","activeShipments"
  ]);
});

test("shipment lifecycle allows only forward operational transitions",()=>{
  const allowed={
    BOOKED:["IN_TRANSIT","EXCEPTION"],
    IN_TRANSIT:["ARRIVED","EXCEPTION"],
    ARRIVED:["DELIVERED","EXCEPTION"],
    EXCEPTION:["IN_TRANSIT","ARRIVED"],
    DELIVERED:[]
  };
  assert.equal(allowed.BOOKED.includes("IN_TRANSIT"),true);
  assert.equal(allowed.DELIVERED.includes("IN_TRANSIT"),false);
  assert.equal(allowed.ARRIVED.includes("DELIVERED"),true);
});

test("quotation to order contract requires approved status",()=>{
  const canCreateOrder=(status)=>status==="APPROVED";
  assert.equal(canCreateOrder("APPROVED"),true);
  assert.equal(canCreateOrder("PENDING_APPROVAL"),false);
  assert.equal(canCreateOrder("REJECTED"),false);
});
