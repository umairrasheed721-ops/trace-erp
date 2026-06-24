import{u as V,b as M,r as c,j as e}from"./index-C3GK2zQc.js";function K(){var W,z,F,R,D,_,O,L;const{activeStoreId:o,addToast:n,setBadgeCounts:P,token:x}=V(),B=M(),[l,f]=c.useState([]),[w,b]=c.useState(!1),[g,j]=c.useState(!1),[p,y]=c.useState({}),[d,u]=c.useState("all"),[t,m]=c.useState(null),v=()=>{o&&(b(!0),fetch(`/api/watchdog?store_id=${o}`,{headers:{Authorization:`Bearer ${x}`}}).then(r=>r.json()).then(r=>{const i=Array.isArray(r)?r:[];f(i);const a=i.filter(s=>{var h;return(h=s.verdict)==null?void 0:h.includes("FAKE")}).length;P(s=>({...s,watchdog:a})),b(!1)}).catch(()=>{n("Failed to load watchdog data","error"),b(!1)}))};c.useEffect(()=>{v()},[o]);const k=async()=>{var r,i;if(!g){j(!0),n("🐕 Watchdog bulk verification started synchronously...","info");try{const s=await(await fetch("/api/watchdog/run",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${x}`},body:JSON.stringify({store_id:o})})).json();s.success?n(`✅ Watchdog run complete. Audited: ${((r=s.result)==null?void 0:r.audited)||0} orders.`,"success"):n(`⚠️ Watchdog finished with note: ${((i=s.result)==null?void 0:i.reason)||"Done"}`,"warning"),v()}catch{n("Failed to run watchdog audit","error")}finally{j(!1)}}},$=async r=>{try{(await fetch(`/api/watchdog/${r}`,{method:"DELETE",headers:{Authorization:`Bearer ${x}`}})).ok&&(f(a=>a.filter(s=>s.id!==r)),n("Audit result cleared. Order will be scanned on next run.","info"))}catch{n("Failed to delete result","error")}},N=async r=>{y(i=>({...i,[r.id]:!0}));try{const a=await(await fetch("/api/watchdog/send-warning",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${x}`},body:JSON.stringify({tracking_number:r.tracking_number})})).json();a.success?n("🎉 WhatsApp Warning Message dispatched directly!","success"):a.fallbackUrl?(n("⚠️ WhatsApp Bot offline. Opening direct browser message link...","warning"),window.open(a.fallbackUrl,"_blank")):n(a.error||"Failed to dispatch warning","error")}catch{n("Error sending WhatsApp alert","error")}finally{y(i=>({...i,[r.id]:!1}))}},S=l.filter(r=>{var i,a,s,h;return d==="all"?!0:d==="fake"?(i=r.verdict)==null?void 0:i.includes("FAKE"):d==="suspicious"?(a=r.verdict)==null?void 0:a.includes("SUSPICIOUS"):d==="verified"?(s=r.verdict)==null?void 0:s.includes("VERIFIED"):d==="moving"?(h=r.verdict)==null?void 0:h.includes("Moving"):!0}),A=l.length,E=l.filter(r=>{var i;return(i=r.verdict)==null?void 0:i.includes("FAKE")}).length,C=l.filter(r=>{var i;return(i=r.verdict)==null?void 0:i.includes("SUSPICIOUS")}).length,T=l.filter(r=>{var i;return(i=r.verdict)==null?void 0:i.includes("VERIFIED")}).length,U=l.filter(r=>{var i;return(i=r.verdict)==null?void 0:i.includes("Moving")}).length,I=r=>r?r.includes("FAKE")?e.jsxs("span",{className:"wd-badge wd-badge-fake",children:["🔴 ",r]}):r.includes("SUSPICIOUS")?e.jsxs("span",{className:"wd-badge wd-badge-suspicious",children:["🟠 ",r]}):r.includes("VERIFIED")?e.jsxs("span",{className:"wd-badge wd-badge-verified",children:["🟢 ",r]}):e.jsx("span",{className:"wd-badge wd-badge-moving",children:"⚪ In-Transit / Moving"}):e.jsx("span",{className:"wd-badge wd-badge-moving",children:"Unknown"});return e.jsxs("div",{className:"watchdog-panel",children:[e.jsx("style",{children:`
        .watchdog-panel {
          animation: fadeIn 0.3s ease;
        }
        .wd-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .wd-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .wd-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.25);
        }
        .wd-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
        }
        .wd-card-all::before { background: var(--brand); }
        .wd-card-fake::before { background: var(--red); }
        .wd-card-suspicious::before { background: var(--orange); }
        .wd-card-verified::before { background: var(--green); }
        .wd-card-moving::before { background: var(--blue); }

        .wd-card-fake:hover {
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);
        }
        .wd-card-suspicious:hover {
          box-shadow: 0 0 20px rgba(249, 115, 22, 0.15);
        }
        .wd-card-verified:hover {
          box-shadow: 0 0 20px rgba(34, 197, 94, 0.15);
        }

        .wd-card-title {
          font-size: 0.8rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .wd-card-value {
          font-size: 2rem;
          font-weight: 700;
          margin-top: 8px;
          color: var(--text-primary);
        }
        .wd-filter-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .wd-filter-btn {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          padding: 8px 14px;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .wd-filter-btn:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        .wd-filter-btn.active {
          background: var(--brand-glow);
          border-color: var(--brand);
          color: var(--brand);
          font-weight: 600;
        }
        .wd-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .wd-badge-fake { background: rgba(239, 68, 68, 0.15); color: #f87171; }
        .wd-badge-suspicious { background: rgba(249, 115, 22, 0.15); color: #fb923c; }
        .wd-badge-verified { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
        .wd-badge-moving { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
        
        .wd-timeline-stepper {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin: 20px 0;
          position: relative;
        }
        .wd-timeline-stepper::before {
          content: '';
          position: absolute;
          left: 17px; top: 10px; bottom: 10px;
          width: 2px;
          background: var(--border-bright);
        }
        .wd-timeline-step {
          display: flex;
          gap: 16px;
          position: relative;
          z-index: 1;
        }
        .wd-timeline-circle {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: var(--bg-elevated);
          border: 2px solid var(--border-bright);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          color: var(--text-secondary);
        }
        .wd-timeline-step.active .wd-timeline-circle {
          border-color: var(--brand);
          color: var(--brand);
          background: var(--bg-surface);
        }
        .wd-timeline-content {
          flex: 1;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px 16px;
        }
        .wd-timeline-title {
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .wd-timeline-time {
          font-size: 0.78rem;
          color: var(--text-muted);
        }
        .wd-timeline-delta {
          margin: -10px 0 10px 52px;
          background: var(--bg-surface);
          border-left: 3px solid var(--brand);
          padding: 8px 12px;
          font-size: 0.8rem;
          color: var(--text-secondary);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        }
      `}),e.jsxs("div",{className:"page-header",children:[e.jsxs("div",{children:[e.jsx("h2",{children:"🐕 Watchdog"}),e.jsx("p",{children:"PostEx Rider Fraud Detection — Real-time Tri-Layer Verification Engine"})]}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{className:"btn btn-secondary btn-sm",onClick:v,disabled:w,children:"🔄 Refresh"}),e.jsx("button",{className:"btn btn-primary btn-sm",onClick:k,disabled:g||!o,children:g?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"loading-spinner"})," Auditing..."]}):"🚀 Run Audit Engine"})]})]}),e.jsxs("div",{className:"wd-stats-grid",children:[e.jsxs("div",{className:"wd-card wd-card-all",children:[e.jsx("div",{className:"wd-card-title",children:"Total Audited"}),e.jsx("div",{className:"wd-card-value",children:A})]}),e.jsxs("div",{className:"wd-card wd-card-fake",children:[e.jsx("div",{className:"wd-card-title",children:"🔴 Fake Attempts"}),e.jsx("div",{className:"wd-card-value",style:{color:"var(--red)"},children:E})]}),e.jsxs("div",{className:"wd-card wd-card-suspicious",children:[e.jsx("div",{className:"wd-card-title",children:"🟠 Suspicious Close"}),e.jsx("div",{className:"wd-card-value",style:{color:"var(--orange)"},children:C})]}),e.jsxs("div",{className:"wd-card wd-card-verified",children:[e.jsx("div",{className:"wd-card-title",children:"🟢 Verified Attempts"}),e.jsx("div",{className:"wd-card-value",style:{color:"var(--green)"},children:T})]})]}),e.jsxs("div",{className:"wd-filter-bar",children:[e.jsxs("button",{className:`wd-filter-btn ${d==="all"?"active":""}`,onClick:()=>u("all"),children:["All (",A,")"]}),e.jsxs("button",{className:`wd-filter-btn ${d==="fake"?"active":""}`,onClick:()=>u("fake"),children:["🔴 Fake (",E,")"]}),e.jsxs("button",{className:`wd-filter-btn ${d==="suspicious"?"active":""}`,onClick:()=>u("suspicious"),children:["🟠 Suspicious (",C,")"]}),e.jsxs("button",{className:`wd-filter-btn ${d==="verified"?"active":""}`,onClick:()=>u("verified"),children:["🟢 Verified (",T,")"]}),e.jsxs("button",{className:`wd-filter-btn ${d==="moving"?"active":""}`,onClick:()=>u("moving"),children:["⚪ Moving (",U,")"]})]}),w?e.jsxs("div",{className:"loading-overlay",children:[e.jsx("span",{className:"loading-spinner"})," Loading audit database..."]}):S.length===0?e.jsxs("div",{className:"empty-state",children:[e.jsx("div",{className:"empty-icon",children:"🐕"}),e.jsx("h3",{children:l.length===0?"No Audit History":"No matches found"}),e.jsx("p",{children:l.length===0?"Start an audit to scan PostEx delivery failures":"Try updating your filters"}),l.length===0&&e.jsx("button",{className:"btn btn-primary mt-4",onClick:k,disabled:g,children:"🚀 Start First Audit Scan"})]}):e.jsx("div",{className:"table-wrapper",children:e.jsxs("table",{children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Tracking #"}),e.jsx("th",{children:"Order Ref"}),e.jsx("th",{children:"Customer"}),e.jsx("th",{children:"Request Time"}),e.jsx("th",{children:"Latest Courier Status"}),e.jsx("th",{children:"Verdict"}),e.jsx("th",{children:"Duration"}),e.jsx("th",{children:"Evidence"}),e.jsx("th",{children:"Audited At"}),e.jsx("th",{children:"Actions"})]})}),e.jsx("tbody",{children:S.map(r=>e.jsxs("tr",{children:[e.jsx("td",{children:e.jsxs("button",{className:"btn-link",onClick:()=>m(r),style:{fontWeight:700,color:"var(--brand)",background:"none",border:"none",padding:0,cursor:"pointer",fontSize:"0.75rem"},children:["🔍 ",r.tracking_number]})}),e.jsx("td",{children:r.ref_number?e.jsx("button",{className:"btn-link",onClick:()=>B("/search",{state:{keyword:r.ref_number,status:"All Statuses",preset:"All Time"}}),style:{fontWeight:800,color:"var(--brand)",background:"none",border:"none",padding:0,cursor:"pointer"},children:r.ref_number}):"—"}),e.jsx("td",{children:e.jsxs("div",{style:{display:"flex",flexDirection:"column"},children:[e.jsx("span",{style:{fontWeight:500},children:r.customer_name||"Unknown"}),e.jsx("span",{style:{fontSize:"0.72rem",color:"var(--text-secondary)"},children:r.phone||"—"})]})}),e.jsx("td",{style:{fontSize:"0.72rem",color:"var(--text-secondary)"},children:r.request_time?new Date(r.request_time).toLocaleString():"—"}),e.jsx("td",{children:e.jsx("span",{className:"badge",style:{background:"var(--bg-elevated)",color:"var(--text-primary)"},children:r.latest_status||"—"})}),e.jsx("td",{children:I(r.verdict)}),e.jsx("td",{style:{fontWeight:600,fontSize:"0.78rem"},children:r.duration}),e.jsx("td",{className:"font-mono",style:{fontSize:"0.72rem",color:"var(--text-secondary)"},children:r.evidence}),e.jsx("td",{style:{fontSize:"0.72rem",color:"var(--text-muted)"},children:r.created_at?new Date(r.created_at).toLocaleDateString():"—"}),e.jsx("td",{children:e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{className:"btn btn-sm btn-secondary",onClick:()=>N(r),disabled:p[r.id],title:"Send rider alert warning text to customer",children:p[r.id]?e.jsx("span",{className:"loading-spinner"}):"💬 WhatsApp Warning"}),e.jsx("button",{className:"btn btn-secondary btn-sm",onClick:()=>$(r.id),title:"Clear audit log (allow re-audit on next run)",children:"🗑"})]})})]},r.id))})]})}),t&&e.jsx("div",{className:"modal-overlay",onClick:()=>m(null),children:e.jsxs("div",{className:"modal-content glass-panel",style:{width:"90%",maxWidth:"540px",padding:"24px"},onClick:r=>r.stopPropagation(),children:[e.jsxs("div",{className:"flex justify-between items-center mb-4",children:[e.jsx("h3",{className:"premium-title",style:{margin:0},children:"Rider Audit Details"}),e.jsx("button",{className:"btn btn-secondary btn-sm",onClick:()=>m(null),children:"✕"})]}),e.jsxs("div",{style:{marginBottom:"16px"},children:[e.jsxs("div",{style:{fontSize:"0.9rem",color:"var(--text-secondary)"},children:[e.jsx("strong",{children:"Tracking Number:"})," ",e.jsx("span",{className:"font-mono",style:{color:"var(--brand)"},children:t.tracking_number})]}),t.ref_number&&e.jsxs("div",{style:{fontSize:"0.9rem",color:"var(--text-secondary)",marginTop:"4px"},children:[e.jsx("strong",{children:"Order Reference:"})," #",t.ref_number]}),e.jsxs("div",{style:{fontSize:"0.9rem",color:"var(--text-secondary)",marginTop:"4px"},children:[e.jsx("strong",{children:"Customer:"})," ",t.customer_name," (",t.phone,")"]})]}),e.jsxs("div",{className:"wd-timeline-stepper",children:[e.jsxs("div",{className:"wd-timeline-step active",children:[e.jsx("div",{className:"wd-timeline-circle",children:"📦"}),e.jsxs("div",{className:"wd-timeline-content",children:[e.jsx("div",{className:"wd-timeline-title",children:"Audit Start / Failure Flagged"}),e.jsx("div",{className:"wd-timeline-time",children:t.request_time?new Date(t.request_time).toLocaleString():"N/A"})]})]}),t.evidence&&t.evidence.includes("➡️")&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"wd-timeline-step active",children:[e.jsx("div",{className:"wd-timeline-circle",children:"🚚"}),e.jsxs("div",{className:"wd-timeline-content",children:[e.jsx("div",{className:"wd-timeline-title",children:"Rider Enroute / Out For Delivery"}),e.jsx("div",{className:"wd-timeline-time",children:t.evidence.split("➡️")[0].trim()})]})]}),e.jsxs("div",{className:"wd-timeline-delta",children:["⚡ Duration Delta: ",e.jsx("strong",{children:t.duration})]}),e.jsxs("div",{className:"wd-timeline-step active",children:[e.jsx("div",{className:"wd-timeline-circle",children:"⚠️"}),e.jsxs("div",{className:"wd-timeline-content",children:[e.jsx("div",{className:"wd-timeline-title",children:"Delivery Attempt Closed"}),e.jsx("div",{className:"wd-timeline-time",children:t.evidence.split("➡️")[1].trim()})]})]})]})]}),e.jsxs("div",{style:{background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:"14px",marginTop:"16px"},children:[e.jsx("div",{style:{fontWeight:600,color:"var(--text-primary)",marginBottom:"6px"},children:"Audit Engine Verdict"}),e.jsx("div",{children:I(t.verdict)}),e.jsxs("p",{style:{marginTop:"10px",fontSize:"0.82rem",color:"var(--text-secondary)",lineHeight:1.4},children:[((W=t.verdict)==null?void 0:W.includes("IMPOSSIBLE SPEED"))&&'Rider ne parcel ko "Out for delivery" mark karne ke 30 minute ke andar hi return/failed mark kar diya, jo ke physically impossible hai.',((z=t.verdict)==null?void 0:z.includes("LATE BULK CLOSE"))&&"Rider ne raat 9:00 baje ke baad parcel fail mark kiya, jo aam tor par bulk mein fake return reports upload karne par hota hai.",((F=t.verdict)==null?void 0:F.includes("INSTANT CLOSE"))&&"Out for delivery aur failed status entries ka time same tha ya aapas mein reverse tha, jo digital status manipulaton ko zahir karta hai.",((R=t.verdict)==null?void 0:R.includes("VERIFIED ATTEMPT"))&&"Rider tracking timeline standard limits ke mutabiq hai. Lagta hai rider ne genuine try ki thi.",!((D=t.verdict)!=null&&D.includes("IMPOSSIBLE SPEED"))&&!((_=t.verdict)!=null&&_.includes("LATE BULK CLOSE"))&&!((O=t.verdict)!=null&&O.includes("INSTANT CLOSE"))&&!((L=t.verdict)!=null&&L.includes("VERIFIED"))&&"Parcel abhi bhi movement mein hai ya check failed status abhi record nahi hui."]})]}),e.jsxs("div",{className:"flex gap-2 justify-end mt-4",children:[e.jsx("button",{className:"btn btn-secondary",onClick:()=>m(null),children:"Close"}),e.jsx("button",{className:"btn btn-primary",onClick:()=>{N(t),m(null)},disabled:p[t.id],children:p[t.id]?"Sending...":"💬 Send WhatsApp Warning"})]})]})})]})}export{K as default};
