const toast=document.querySelector("#toast");
const authPanel=document.querySelector("#auth-panel");
const loginForm=document.querySelector("#login-form");
const loginError=document.querySelector("#login-error");
const api=async(path,options={})=>{const r=await fetch(path,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});if(r.status===401)throw Object.assign(new Error("UNAUTHENTICATED"),{status:401});const data=r.status===204?null:await r.json();if(!r.ok)throw Object.assign(new Error(data?.message||"Request failed"),{status:r.status});return data};
function notify(message){if(!toast)return;toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2400)}
function setMetric(label,value){document.querySelectorAll(".metrics article").forEach(card=>{if(card.querySelector("span")?.textContent.trim()===label)card.querySelector("strong").textContent=value})}
async function loadDashboard(){const d=await api("/api/management");setMetric("Pipeline value","$"+Number(d.pipelineValue||0).toLocaleString());setMetric("Open orders",d.openOrders);setMetric("In transit",d.activeShipments);setMetric("Pending approvals",d.pendingApprovals)}
async function loadUser(){try{const u=await api("/api/auth/me");document.querySelector(".user strong").textContent=u.email;document.querySelector(".user small").textContent=u.role||"Authorized user";authPanel.hidden=true;await loadDashboard()}catch(e){if(e.status===401)authPanel.hidden=false;else notify(e.message)}}
loginForm?.addEventListener("submit",async e=>{e.preventDefault();loginError.textContent="";const data=Object.fromEntries(new FormData(loginForm));try{await api("/api/auth/login",{method:"POST",body:JSON.stringify(data)});loginForm.reset();authPanel.hidden=true;await loadUser();notify("Signed in successfully.")}catch(err){loginError.textContent=err.message}});
document.querySelector("[data-action=\"new-quote\"]")?.addEventListener("click",()=>notify("Quotation workspace is connected to the API."));
document.querySelectorAll("a[href^=\"#\"]").forEach(a=>a.addEventListener("click",()=>notify("Module navigation is ready for API-backed views.")));
loadUser();