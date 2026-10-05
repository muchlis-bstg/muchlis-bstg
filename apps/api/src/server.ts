import {randomUUID,createHash,randomBytes,scryptSync,timingSafeEqual} from "node:crypto";import type {Pool} from "pg";
const json=(res:any,status:number,data:unknown)=>{res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(data))};
const body=async(req:any)=>{let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>100_000)throw Object.assign(new Error("Request body too large"),{status:413})}try{return JSON.parse(raw)}catch{throw Object.assign(new Error("Invalid JSON"),{status:400})}};
const hashToken=(t:string)=>createHash("sha256").update(t).digest("hex");
const passwordHash=(p:string)=>{const salt=randomBytes(16).toString("hex");return salt+":"+scryptSync(p,salt,64).toString("hex")};
const verifyPassword=(p:string,stored:string)=>{const [salt,hex]=stored.split(":");if(!salt||!hex)return false;const a=Buffer.from(hex,"hex"),b=scryptSync(p,salt,a.length);return a.length===b.length&&timingSafeEqual(a,b)};
const isoDate=(value:unknown)=>typeof value==="string"&&/^\\d{4}-\\d{2}-\\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+"T00:00:00Z"));\nconst cookies=(req:any)=>Object.fromEntries((req.headers.cookie??"").split(";").map((x:string)=>x.trim().split("=",2)).filter((x:string[])=>x.length===2));
const loginAttempts=new Map<string,{count:number,resetAt:number}>();\nconst LOGIN_WINDOW_MS=60_000;\nconst LOGIN_LIMIT=10;\nconst clientKey=(req:any)=>String(req.headers["x-forwarded-for"]??req.socket?.remoteAddress??"unknown").split(",")[0].trim();\nconst allowLogin=(key:string)=>{const now=Date.now(),entry=loginAttempts.get(key);if(!entry||entry.resetAt<=now){loginAttempts.set(key,{count:1,resetAt:now+LOGIN_WINDOW_MS});return true}if(entry.count>=LOGIN_LIMIT)return false;entry.count++;return true};\nexport function createApp(pool:Pool){return async(req:any,res:any)=>{const requestId=randomUUID();res.setHeader("X-Request-Id",requestId);res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","DENY");res.setHeader("Referrer-Policy","no-referrer");const url=new URL(req.url,"http://localhost");
if(req.method==="OPTIONS"){res.statusCode=204;return res.end()}
if(req.method==="GET"&&url.pathname==="/health"){try{await pool.query("SELECT 1");return json(res,200,{status:"ok"})}catch{return json(res,503,{status:"degraded"})}}
try{
if(req.method==="POST"&&url.pathname==="/api/auth/register"){if(process.env.NODE_ENV==="production"&&process.env.ALLOW_PUBLIC_REGISTRATION!=="true")return json(res,403,{code:"REGISTRATION_DISABLED",message:"Public registration is disabled"});const b=await body(req);const email=String(b.email??"").trim().toLowerCase(),password=String(b.password??"");if(!email.includes("@")||password.length<8||password.length>128)return json(res,400,{code:"INVALID_INPUT",message:"Valid email and password (8-128 chars) are required"});const id=randomUUID();await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",[id,email,passwordHash(password)]);return json(res,201,{id,email})}
if(req.method==="POST"&&url.pathname==="/api/auth/login"){if(!allowLogin(clientKey(req)))return json(res,429,{code:"RATE_LIMITED",message:"Too many login attempts; try again later"});const b=await body(req);const email=String(b.email??"").trim().toLowerCase(),password=String(b.password??"");const q=await pool.query<{id:string,email:string,password_hash:string}>("SELECT id,email,password_hash FROM users WHERE email=$1",[email]);if(!q.rows[0]||!verifyPassword(password,q.rows[0].password_hash))return json(res,401,{code:"INVALID_CREDENTIALS",message:"Invalid credentials"});const token=randomBytes(32).toString("base64url"),id=randomUUID();await pool.query("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '7 days')",[id,q.rows[0].id,hashToken(token)]);res.setHeader("Set-Cookie",`exportos_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV==="production"?"; Secure":""}`);return json(res,200,{id:q.rows[0].id,email:q.rows[0].email})}
const token=cookies(req).exportos_session;let user:any=null;if(token){const q=await pool.query<{id:string,email:string}>("SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",[hashToken(token)]);user=q.rows[0]??null}
if(req.method==="GET"&&url.pathname==="/api/auth/me")return user?json(res,200,user):json(res,401,{code:"UNAUTHENTICATED",message:"Authentication required"});
if(req.method==="POST"&&url.pathname==="/api/auth/logout"){if(token)await pool.query("DELETE FROM sessions WHERE token_hash=$1",[hashToken(token)]);res.setHeader("Set-Cookie","exportos_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");res.statusCode=204;return res.end()}
if(!user)return json(res,401,{code:"UNAUTHENTICATED",message:"Authentication required"});
if(req.method==="GET"&&url.pathname==="/api/buyers"){const q=await pool.query("SELECT id,name,country,status,created_at FROM buyers ORDER BY created_at DESC LIMIT 100");return json(res,200,{items:q.rows})}
if(req.method==="POST"&&url.pathname==="/api/buyers"){const b=await body(req),name=String(b.name??"").trim(),country=String(b.country??"").trim();if(!name||!country||name.length>160||country.length>80)return json(res,400,{code:"INVALID_INPUT",message:"Buyer name and country are required"});const id=randomUUID();await withTx(pool,async(c)=>{await c.query("INSERT INTO buyers(id,name,country,status) VALUES($1,$2,$3,'ACTIVE')",[id,name,country]);await c.query("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'CREATED','buyer',$3,$4::jsonb)",[randomUUID(),user.id,id,JSON.stringify({name,country})])});return json(res,201,{id,name,country,status:"ACTIVE"})}
if(req.method==="GET"&&url.pathname==="/api/rfqs"){
const q=await pool.query("SELECT r.id,r.reference,r.status,r.currency,r.estimated_value,r.created_at,b.id AS buyer_id,b.name AS buyer_name,b.country FROM rfqs r JOIN buyers b ON b.id=r.buyer_id ORDER BY r.created_at DESC LIMIT 100");
return json(res,200,{items:q.rows});
}
if(req.method==="POST"&&url.pathname==="/api/rfqs"){
if(!["ADMIN","MANAGER","SALES"].includes(user.role))return json(res,403,{code:"FORBIDDEN",message:"Insufficient role"});
const b=await body(req),buyerId=String(b.buyerId??"").trim(),reference=String(b.reference??"").trim(),currency=String(b.currency??"").trim().toUpperCase(),estimatedValue=Number(b.estimatedValue);
if(!buyerId||!reference||currency.length!==3||!Number.isFinite(estimatedValue)||estimatedValue<0||reference.length>80)return json(res,400,{code:"INVALID_INPUT",message:"buyerId, reference, 3-letter currency and non-negative estimatedValue are required"});
const buyer=await pool.query("SELECT id FROM buyers WHERE id=$1 AND status='ACTIVE'",[buyerId]);
if(!buyer.rowCount)return json(res,400,{code:"INVALID_BUYER",message:"Active buyer not found"});
const id=randomUUID();
await withTx(pool,async(c)=>{
await c.query("INSERT INTO rfqs(id,buyer_id,reference,status,currency,estimated_value) VALUES($1,$2,$3,'OPEN',$4,$5)",[id,buyerId,reference,currency,estimatedValue]);
await c.query("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'CREATED','rfq',$3,$4::jsonb)",[randomUUID(),user.id,id,JSON.stringify({reference,buyerId,currency,estimatedValue})]);
});
return json(res,201,{id,buyerId,reference,status:"OPEN",currency,estimatedValue});
}
if(req.method==="PATCH"&&url.pathname.startsWith("/api/rfqs/")){
if(!["ADMIN","MANAGER","SALES"].includes(user.role))return json(res,403,{code:"FORBIDDEN",message:"Insufficient role"});
const id=url.pathname.split("/").pop()??"",b=await body(req),status=String(b.status??"").toUpperCase();
if(!["OPEN","QUOTED","WON","LOST"].includes(status))return json(res,400,{code:"INVALID_STATUS",message:"Unsupported RFQ status"});
const current=await pool.query<{status:string}>("SELECT status FROM rfqs WHERE id=$1",[id]);
if(!current.rowCount)return json(res,404,{code:"NOT_FOUND",message:"RFQ not found"});
const allowed:Record<string,string[]>={
OPEN:["QUOTED","LOST"],
QUOTED:["WON","LOST","OPEN"],
WON:[],
LOST:["OPEN"]
};
if(!allowed[current.rows[0].status]?.includes(status))return json(res,409,{code:"INVALID_TRANSITION",message:`Cannot move RFQ from ${current.rows[0].status} to ${status}`});
await withTx(pool,async(c)=>{
await c.query("UPDATE rfqs SET status=$1 WHERE id=$2",[status,id]);
await c.query("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'STATUS_CHANGED','rfq',$3,$4::jsonb)",[randomUUID(),user.id,id,JSON.stringify({from:current.rows[0].status,to:status})]);
});
return json(res,200,{id,status});
}
if(req.method==="GET"&&url.pathname==="/api/quotations"){
const q=await pool.query("SELECT q.id,q.rfq_id,q.version,q.status,q.currency,q.total_value,q.valid_until,q.notes,q.created_at,r.reference FROM quotations q JOIN rfqs r ON r.id=q.rfq_id ORDER BY q.created_at DESC LIMIT 100");
return json(res,200,{items:q.rows});
}
if(req.method==="POST"&&url.pathname==="/api/quotations"){
if(!["ADMIN","MANAGER","SALES"].includes(user.role))return json(res,403,{code:"FORBIDDEN",message:"Insufficient role"});
const b=await body(req),rfqId=String(b.rfqId??"").trim(),currency=String(b.currency??"").trim().toUpperCase(),totalValue=Number(b.totalValue),validUntil=b.validUntil?String(b.validUntil):null,notes=b.notes?String(b.notes).slice(0,2000):null;
if(!rfqId||currency.length!==3||!Number.isFinite(totalValue)||totalValue<0||validUntil!==null&&!isoDate(validUntil))return json(res,400,{code:"INVALID_INPUT",message:"rfqId, 3-letter currency, non-negative totalValue and validUntil (YYYY-MM-DD) are required"});
const rfq=await pool.query<{id:string,status:string}>("SELECT id,status FROM rfqs WHERE id=$1",[rfqId]);
if(!rfq.rowCount)return json(res,404,{code:"NOT_FOUND",message:"RFQ not found"});
if(rfq.rows[0].status!=="OPEN")return json(res,409,{code:"INVALID_RFQ_STATUS",message:"Quotation can only be created for an OPEN RFQ"});
const v=await pool.query<{version:number}>("SELECT COALESCE(MAX(version),0)+1 AS version FROM quotations WHERE rfq_id=$1",[rfqId]);
const version=Number(v.rows[0].version),id=randomUUID();
await withTx(pool,async(c)=>{
await c.query("INSERT INTO quotations(id,rfq_id,version,status,currency,total_value,valid_until,notes,created_by) VALUES($1,$2,$3,'DRAFT',$4,$5,$6,$7,$8)",[id,rfqId,version,currency,totalValue,validUntil,notes,user.id]);
await c.query("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'CREATED','quotation',$3,$4::jsonb)",[randomUUID(),user.id,id,JSON.stringify({rfqId,version,totalValue})]);
});
return json(res,201,{id,rfqId,version,status:"DRAFT",currency,totalValue});
}
if(req.method==="POST"&&url.pathname.match(/^\/api\/quotations\/[^/]+\/submit$/)){
if(!["ADMIN","MANAGER","SALES"].includes(user.role))return json(res,403,{code:"FORBIDDEN",message:"Insufficient role"});
const id=url.pathname.split("/")[3];
const q=await pool.query<{status:string,rfq_id:string}>("SELECT status,rfq_id FROM quotations WHERE id=$1",[id]);
if(!q.rowCount)return json(res,404,{code:"NOT_FOUND",message:"Quotation not found"});
if(q.rows[0].status!=="DRAFT")return json(res,409,{code:"INVALID_TRANSITION",message:"Only draft quotations can be submitted"});
await withTx(pool,async(c)=>{
await c.query("UPDATE quotations SET status='PENDING_APPROVAL' WHERE id=$1",[id]);
await c.query("UPDATE rfqs SET status='QUOTED' WHERE id=$1 AND status='OPEN'",[q.rows[0].rfq_id]);
await c.query("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'SUBMITTED','quotation',$3,'{}'::jsonb)",[randomUUID(),user.id,id]);
});
return json(res,200,{id,status:"PENDING_APPROVAL"});
}
if(req.method==="POST"&&url.pathname.match(/^\/api\/quotations\/[^/]+\/decision$/)){
if(!["ADMIN","MANAGER","FINANCE"].includes(user.role))return json(res,403,{code:"FORBIDDEN",message:"Approval role required"});
const id=url.pathname.split("/")[3],b=await body(req),decision=String(b.decision??"").toUpperCase(),comment=b.comment?String(b.comment).slice(0,2000):null;
if(!["APPROVED","REJECTED"].includes(decision))return json(res,400,{code:"INVALID_DECISION",message:"Decision must be APPROVED or REJECTED"});
const q=await pool.query<{status:string,created_by:string,rfq_id:string}>("SELECT status,created_by,rfq_id FROM quotations WHERE id=$1",[id]);
if(!q.rowCount)return json(res,404,{code:"NOT_FOUND",message:"Quotation not found"});
if(q.rows[0].status!=="PENDING_APPROVAL")return json(res,409,{code:"INVALID_TRANSITION",message:"Quotation is not pending approval"});\nif(q.rows[0].created_by===user.id)return json(res,409,{code:"SEPARATION_OF_DUTIES",message:"The quotation creator cannot approve or reject the same quotation"});
await withTx(pool,async(c)=>{
await c.query("INSERT INTO quotation_approvals(id,quotation_id,approver_user_id,decision,comment) VALUES($1,$2,$3,$4,$5)",[randomUUID(),id,user.id,decision,comment]);
await c.query("UPDATE quotations SET status=$1 WHERE id=$2",[decision==="APPROVED"?"APPROVED":"REJECTED",id]);\nif(decision==="REJECTED")await c.query("UPDATE rfqs SET status='OPEN' WHERE id=$1 AND status='QUOTED'",[q.rows[0].rfq_id]);
await c.query("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'DECISIONED','quotation',$3,$4::jsonb)",[randomUUID(),user.id,id,JSON.stringify({decision,comment})]);
});
return json(res,200,{id,status:decision});
}
if(req.method==="GET"&&url.pathname==="/api/orders"){
const q=await pool.query("SELECT o.id,o.order_number,o.status,o.currency,o.total_value,o.created_at,o.quotation_id FROM sales_orders o ORDER BY o.created_at DESC LIMIT 100");
return json(res,200,{items:q.rows});
}
if(req.method==="POST"&&url.pathname==="/api/orders"){
if(!["ADMIN","MANAGER","SALES","OPERATIONS"].includes(user.role))return json(res,403,{code:"FORBIDDEN",message:"Insufficient role"});
const b=await body(req),quotationId=String(b.quotationId??"").trim(),orderNumber=String(b.orderNumber??"").trim();
if(!quotationId||!orderNumber||orderNumber.length>80)return json(res,400,{code:"INVALID_INPUT",message:"quotationId and orderNumber are required"});
const q=await pool.query<{status:string,currency:string,total_value:string}>("SELECT status,currency,total_value FROM quotations WHERE id=$1",[quotationId]);
if(!q.rowCount)return json(res,404,{code:"NOT_FOUND",message:"Quotation not found"});
if(q.rows[0].status!=="APPROVED")return json(res,409,{code:"INVALID_QUOTATION_STATUS",message:"Only approved quotations can become orders"});
const id=randomUUID();
await withTx(pool,async(c)=>{
await c.query("INSERT INTO sales_orders(id,quotation_id,order_number,status,currency,total_value,created_by) VALUES($1,$2,$3,'CONFIRMED',$4,$5,$6)",[id,quotationId,orderNumber,q.rows[0].currency,q.rows[0].total_value,user.id]);
await c.query("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'CREATED','sales_order',$3,$4::jsonb)",[randomUUID(),user.id,id,JSON.stringify({quotationId,orderNumber})]);
});
return json(res,201,{id,quotationId,orderNumber,status:"CONFIRMED",currency:q.rows[0].currency,totalValue:q.rows[0].total_value});
}
if(req.method==="GET"&&url.pathname==="/api/shipments"){
const q=await pool.query("SELECT s.id,s.sales_order_id,s.tracking_number,s.carrier,s.status,s.etd,s.eta,s.created_at,o.order_number FROM shipments s JOIN sales_orders o ON o.id=s.sales_order_id ORDER BY s.created_at DESC LIMIT 100");
return json(res,200,{items:q.rows});
}
if(req.method==="POST"&&url.pathname==="/api/shipments"){
if(!["ADMIN","MANAGER","OPERATIONS"].includes(user.role))return json(res,403,{code:"FORBIDDEN",message:"Operations role required"});
const b=await body(req),orderId=String(b.salesOrderId??"").trim(),carrier=String(b.carrier??"").trim(),tracking=b.trackingNumber?String(b.trackingNumber).trim():null,etd=b.etd?String(b.etd):null,eta=b.eta?String(b.eta):null;
if(!orderId||!carrier||carrier.length>120||etd!==null&&!isoDate(etd)||eta!==null&&!isoDate(eta)||etd!==null&&eta!==null&&etd>eta)return json(res,400,{code:"INVALID_INPUT",message:"salesOrderId and carrier are required; dates must be YYYY-MM-DD and ETD cannot be after ETA"});
const order=await pool.query<{status:string}>("SELECT status FROM sales_orders WHERE id=$1",[orderId]);
if(!order.rowCount)return json(res,404,{code:"NOT_FOUND",message:"Sales order not found"});
if(["CANCELLED","DELIVERED"].includes(order.rows[0].status))return json(res,409,{code:"INVALID_ORDER_STATUS",message:"Order cannot be shipped in its current status"});
const id=randomUUID();
await withTx(pool,async(c)=>{
await c.query("INSERT INTO shipments(id,sales_order_id,tracking_number,carrier,status,etd,eta) VALUES($1,$2,$3,$4,'BOOKED',$5,$6)",[id,orderId,tracking,carrier,etd,eta]);
await c.query("UPDATE sales_orders SET status='PROCESSING' WHERE id=$1",[orderId]);
await c.query("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'CREATED','shipment',$3,$4::jsonb)",[randomUUID(),user.id,id,JSON.stringify({orderId,carrier,tracking})]);
});
return json(res,201,{id,salesOrderId:orderId,status:"BOOKED",carrier,trackingNumber:tracking});
}
if(req.method==="PATCH"&&url.pathname.startsWith("/api/shipments/")){
if(!["ADMIN","MANAGER","OPERATIONS"].includes(user.role))return json(res,403,{code:"FORBIDDEN",message:"Operations role required"});
const id=url.pathname.split("/").pop()??"",b=await body(req),status=String(b.status??"").toUpperCase();
if(!["BOOKED","IN_TRANSIT","ARRIVED","DELIVERED","EXCEPTION"].includes(status))return json(res,400,{code:"INVALID_STATUS",message:"Unsupported shipment status"});
const current=await pool.query<{status:string,sales_order_id:string}>("SELECT status,sales_order_id FROM shipments WHERE id=$1",[id]);
if(!current.rowCount)return json(res,404,{code:"NOT_FOUND",message:"Shipment not found"});
const allowed:Record<string,string[]>={BOOKED:["IN_TRANSIT","EXCEPTION"],IN_TRANSIT:["ARRIVED","EXCEPTION"],ARRIVED:["DELIVERED","EXCEPTION"],EXCEPTION:["IN_TRANSIT","ARRIVED"],DELIVERED:[]};
if(!allowed[current.rows[0].status]?.includes(status))return json(res,409,{code:"INVALID_TRANSITION",message:`Cannot move shipment from ${current.rows[0].status} to ${status}`});
await withTx(pool,async(c)=>{
await c.query("UPDATE shipments SET status=$1 WHERE id=$2",[status,id]);
if(status==="DELIVERED")await c.query("UPDATE sales_orders SET status='DELIVERED' WHERE id=$1",[current.rows[0].sales_order_id]);
else if(status==="IN_TRANSIT")await c.query("UPDATE sales_orders SET status='SHIPPED' WHERE id=$1",[current.rows[0].sales_order_id]);
await c.query("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'STATUS_CHANGED','shipment',$3,$4::jsonb)",[randomUUID(),user.id,id,JSON.stringify({from:current.rows[0].status,to:status})]);
});
return json(res,200,{id,status});
}
if(req.method==="GET"&&url.pathname==="/api/audit"){if(!["ADMIN","MANAGER","FINANCE","OPERATIONS"].includes(user.role))return json(res,403,{code:"FORBIDDEN",message:"Insufficient role"});const limit=Math.min(Math.max(Number(url.searchParams.get("limit")??50),1),100);const offset=Math.max(Number(url.searchParams.get("offset")??0),0);const entityType=url.searchParams.get("entityType")?.trim()||null;const action=url.searchParams.get("action")?.trim()||null;const params:any[]=[];const where:string[]=[];if(entityType){params.push(entityType);where.push(`a.entity_type=${params.length}`)}if(action){params.push(action);where.push(`a.action=${params.length}`)}const whereSql=where.length?`WHERE ${where.join(" AND ")}`:"";params.push(limit,offset);const q=await pool.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,u.email AS actor_email,u.role AS actor_role FROM audit_events a LEFT JOIN users u ON u.id=a.actor_user_id ${whereSql} ORDER BY a.created_at DESC LIMIT ${params.length-1} OFFSET ${params.length}`,params);const countParams=params.slice(0,-2);const total=await pool.query(`SELECT count(*)::int AS count FROM audit_events a ${whereSql}`,countParams);return json(res,200,{items:q.rows,pagination:{limit,offset,total:total.rows[0].count,hasMore:offset+q.rows.length<total.rows[0].count}})}
if(req.method==="GET"&&url.pathname==="/api/management"){const [b,r,q,o,s]=await Promise.all([pool.query("SELECT count(*)::int AS n FROM buyers WHERE status='ACTIVE'"),pool.query("SELECT count(*)::int AS n,COALESCE(sum(estimated_value),0)::numeric AS v FROM rfqs WHERE status IN ('OPEN','QUOTED')"),pool.query("SELECT count(*)::int AS n,COALESCE(sum(total_value),0)::numeric AS v FROM quotations WHERE status='PENDING_APPROVAL'"),pool.query("SELECT count(*)::int AS n,COALESCE(sum(total_value),0)::numeric AS v FROM sales_orders WHERE status IN ('CONFIRMED','PROCESSING','SHIPPED')"),pool.query("SELECT count(*)::int AS n FROM shipments WHERE status IN ('BOOKED','IN_TRANSIT','EXCEPTION')")]);return json(res,200,{buyers:b.rows[0].n,openRfqs:r.rows[0].n,pipelineValue:r.rows[0].v,pendingApprovals:q.rows[0].n,pendingApprovalValue:q.rows[0].v,openOrders:o.rows[0].n,openOrderValue:o.rows[0].v,activeShipments:s.rows[0].n})}
if(req.method==="GET"&&url.pathname==="/api/dashboard"){const [buyers,rfqs]=await Promise.all([pool.query("SELECT count(*)::int AS count FROM buyers WHERE status='ACTIVE'"),pool.query("SELECT count(*)::int AS count,COALESCE(sum(estimated_value),0)::numeric AS value FROM rfqs WHERE status IN ('OPEN','QUOTED')")]);return json(res,200,{buyers:buyers.rows[0].count,openRfqs:rfqs.rows[0].count,pipelineValue:rfqs.rows[0].value})}
return json(res,404,{code:"NOT_FOUND",message:"Route not found"});
}catch(e:any){if(e?.code==="23505")return json(res,409,{code:"CONFLICT",message:"Resource already exists"});return json(res,e?.status??500,{code:"INTERNAL_ERROR",message:e?.status?e.message:"Internal server error"})}}}
async function withTx(pool:Pool,fn:any){const c=await pool.connect();try{await c.query("BEGIN");await fn(c);await c.query("COMMIT")}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}}