import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const datasetPath = resolve(process.argv[2] || "work/audit-dataset.json");
const splitPath = resolve(process.argv[3] || "work/audit-split.json");
const reportPath = resolve(process.argv[4] || "work/fair-doubao-1.6-vision-report.json");
const outputPath = resolve(process.argv[5] || "work/extra-findings-review.html");

const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const split = JSON.parse(await readFile(splitPath, "utf8"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const trainIds = new Set((split.partitions?.train || []).map((item) => item.caseId || item));
const casesById = new Map((dataset.cases || dataset).filter((item) => trainIds.has(item.caseId)).map((item) => [item.caseId, item]));
const findingsByCase = new Map();

for (const finding of report.unverifiedExtraFindings || []) {
  if (!casesById.has(finding.caseId)) continue;
  const findingId = createHash("sha256")
    .update([finding.caseId, finding.dimension, finding.label, finding.evidence].map((value) => String(value || "").trim()).join("\n"))
    .digest("hex").slice(0, 20);
  const list = findingsByCase.get(finding.caseId) || [];
  list.push({ ...finding, findingId });
  findingsByCase.set(finding.caseId, list);
}

const reviewCases = [...findingsByCase.entries()].map(([caseId, findings]) => {
  const item = casesById.get(caseId);
  return {
    caseId,
    images: item.images,
    humanIssues: Object.fromEntries(["face", "pose", "clothing", "scene"].map((key) => [key, item.dimensions?.[key]?.issues || []])),
    findings,
  };
});

const payload = JSON.stringify({
  model: "豆包 1.6 视觉理解-250815",
  promptVersion: "公平重测基线",
  cases: reviewCases,
}).replaceAll("<", "\\u003c");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI 试穿额外发现审查</title>
<style>
:root{font-family:Inter,"PingFang SC",sans-serif;color:#1f2329;background:#f5f6f8}*{box-sizing:border-box}body{margin:0}.bar{position:sticky;top:0;z-index:3;display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:14px 20px;background:#fff;border-bottom:1px solid #ddd}.bar strong{font-size:18px}.muted{color:#646a73}.bar button,.bar select{padding:8px 12px;border:1px solid #c9cdd4;border-radius:8px;background:#fff}.bar button.primary{background:#3370ff;color:white;border-color:#3370ff}main{max-width:1500px;margin:auto;padding:20px}.images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card,.panel,.summary{background:#fff;border:1px solid #dee0e3;border-radius:12px;padding:14px}.card h2,.panel h2{margin:0 0 12px;font-size:16px}.card img{display:block;width:100%;height:460px;object-fit:contain;background:#eef0f3;cursor:zoom-in}.compare{display:grid;grid-template-columns:1fr 1.35fr;gap:14px;margin-top:14px}.dimension{padding:10px 0;border-top:1px solid #eee}.dimension:first-child,.finding:first-child{border-top:0}.dimension h3,.finding h3{margin:0 0 8px;font-size:15px}.dimension ul{margin:0;padding-left:20px}.finding{padding:14px 0;border-top:1px solid #eee}.evidence{color:#4e5969;line-height:1.6}.choices{display:flex;gap:10px;flex-wrap:wrap}.choice{padding:8px 12px;border:1px solid #c9cdd4;border-radius:999px;cursor:pointer}.choice:has(input:checked){border-color:#3370ff;background:#eef3ff}.finding textarea{width:100%;min-height:58px;margin-top:10px;padding:8px;border:1px solid #c9cdd4;border-radius:8px}.summary{margin-top:14px}.empty{color:#8f959e}dialog{border:0;border-radius:12px;padding:10px;box-shadow:0 16px 50px #0005}dialog img{max-width:92vw;max-height:86vh;object-fit:contain}dialog button{display:block;margin:0 0 8px auto}@media(max-width:900px){.images,.compare{grid-template-columns:1fr}.card img{height:60vh}}
</style>
</head>
<body>
<header class="bar"><strong>额外发现审查</strong><span id="version" class="muted"></span><span id="progress"></span><label>筛选 <select id="filter"><option value="all">全部</option><option value="pending">待审</option><option value="reviewed">已审</option></select></label><button id="prev">上一条</button><button id="next">下一条</button><button id="export" class="primary">导出审查结果</button></header>
<main><section id="images" class="images"></section><section class="compare"><article class="panel"><h2>人工历史标签</h2><div id="human"></div></article><article class="panel"><h2>模型额外发现</h2><div id="findings"></div></article></section><section id="summary" class="summary"></section></main>
<dialog id="lightbox"><button onclick="this.parentElement.close()">关闭</button><img id="large" alt="大图"></dialog>
<script>const DATA=${payload};
const images=document.querySelector("#images"),human=document.querySelector("#human"),findings=document.querySelector("#findings"),summary=document.querySelector("#summary"),version=document.querySelector("#version"),progress=document.querySelector("#progress"),filterSelect=document.querySelector("#filter"),prev=document.querySelector("#prev"),next=document.querySelector("#next"),exportButton=document.querySelector("#export"),lightbox=document.querySelector("#lightbox"),large=document.querySelector("#large");const KEY="tryon-extra-review-v1";const labels={face:"面部与妆造发型",pose:"姿势与肢体",clothing:"服装特征",scene:"场景与背景"};let reviews=JSON.parse(localStorage.getItem(KEY)||"{}");let index=0;let filter="all";
function visible(){return DATA.cases.filter(c=>filter==="all"||(filter==="pending"?c.findings.some(f=>!reviews[f.findingId]):c.findings.every(f=>reviews[f.findingId])))}
function save(id,patch){reviews[id]={...(reviews[id]||{}),...patch,reviewedAt:new Date().toISOString()};localStorage.setItem(KEY,JSON.stringify(reviews));renderBar();renderSummary()}
function render(){const list=visible();if(index>=list.length)index=Math.max(0,list.length-1);const c=list[index];renderBar();if(!c){images.innerHTML="";human.innerHTML='<p class="empty">当前筛选没有 Case</p>';findings.innerHTML="";return}images.innerHTML=[["user","用户图"],["outfit","搭配图"],["generated","生成图"]].map(([k,t])=>'<article class="card"><h2>'+t+'</h2><img src="'+esc(c.images[k])+'" alt="'+t+'" data-large="'+esc(c.images[k])+'"></article>').join("");human.innerHTML=Object.entries(labels).map(([k,t])=>'<section class="dimension"><h3>'+t+'</h3>'+((c.humanIssues[k]||[]).length?'<ul>'+c.humanIssues[k].map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>':'<p class="empty">无已记录问题</p>')+'</section>').join("");findings.innerHTML=c.findings.map(f=>{const r=reviews[f.findingId]||{};return '<section class="finding"><h3>'+labels[f.dimension]+' · '+esc(f.label)+'</h3><p class="evidence">'+esc(f.evidence||"模型未提供证据")+'</p><div class="choices">'+[["confirmed_issue","真实问题"],["false_positive","模型误报"],["uncertain","不确定"]].map(([v,t])=>'<label class="choice"><input type="radio" name="'+f.findingId+'" value="'+v+'" '+(r.verdict===v?'checked':'')+'> '+t+'</label>').join("")+'</div><textarea data-note="'+f.findingId+'" placeholder="可选备注">'+esc(r.note||"")+'</textarea></section>'}).join("");document.querySelectorAll('input[type=radio]').forEach(el=>el.onchange=()=>save(el.name,{verdict:el.value}));document.querySelectorAll('[data-note]').forEach(el=>el.onchange=()=>save(el.dataset.note,{note:el.value}));document.querySelectorAll('[data-large]').forEach(el=>el.onclick=()=>{large.src=el.dataset.large;lightbox.showModal()});renderSummary()}
function renderBar(){const list=visible(),all=DATA.cases.flatMap(c=>c.findings),done=all.filter(f=>reviews[f.findingId]?.verdict).length;version.textContent=DATA.model+' · '+DATA.promptVersion;progress.textContent='发现 '+done+'/'+all.length+' · Case '+(list.length?index+1:0)+'/'+list.length;prev.disabled=index<=0;next.disabled=index>=list.length-1}
function renderSummary(){const all=DATA.cases.flatMap(c=>c.findings),counts={confirmed_issue:0,false_positive:0,uncertain:0};all.forEach(f=>{const v=reviews[f.findingId]?.verdict;if(v)counts[v]++});summary.textContent='真实问题 '+counts.confirmed_issue+' · 模型误报 '+counts.false_positive+' · 不确定 '+counts.uncertain+' · 待审 '+(all.length-counts.confirmed_issue-counts.false_positive-counts.uncertain)}
function esc(v){return String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c]))}
filterSelect.onchange=(event)=>{filter=event.target.value;index=0;render()};prev.onclick=()=>{index=Math.max(0,index-1);render()};next.onclick=()=>{index=Math.min(visible().length-1,index+1);render()};exportButton.onclick=()=>{const rows=DATA.cases.flatMap(c=>c.findings.map(f=>({caseId:c.caseId,...f,...(reviews[f.findingId]||{})})));const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),reviews:rows},null,2)],{type:"application/json"}));a.download="extra-finding-reviews.json";a.click();URL.revokeObjectURL(a.href)};render();
</script></body></html>`;

await writeFile(outputPath, html);
console.log(JSON.stringify({
  ok: true,
  output: outputPath,
  cases: reviewCases.length,
  findings: reviewCases.reduce((sum, item) => sum + item.findings.length, 0),
}));
