/* =========================
   スマート交通量カウンター (UI改善版v15)
   - 見た目（HTML/CSS）は変更しない
   - 追加機能:
     ① 車両/歩行者モード（車内の人の二重計上を軽減）
     ② ROIボックス・境界2回接触によるカウント（URLでON/OFF）
   ========================= */

/* ========= 設定（UIには出しません） =========
   ▼隠しショートカット
   - M : カウントモード切替（vehicle / pedestrian）
      ※どちらもトーストで通知（見た目は変わりません）

   ▼URLパラメータ（例: index.html?mode=vehicle）
   - mode  : vehicle | pedestrian
   */
const UI_CATS = ['car','bus','truck','motorcycle','bicycle','person'];
const VEHICLE_CATS = ['car','bus','truck','motorcycle','bicycle'];

// DOM
const DOM = {
  video: document.getElementById("video"),
  canvas: document.getElementById("canvas"),
  ctx: document.getElementById("canvas").getContext("2d"),
  appTitle: document.getElementById("app-title"),
  toggleBtn: document.getElementById("toggle-analysis-btn"),
  status: document.getElementById("status-indicator"),
  loadingPerc: document.getElementById("loading-percentage"),
  loadingProg: document.getElementById("loading-progress"),
  toast: document.getElementById("toast"),
  hourTitle: document.getElementById("current-hour-title"),
  count: {
    car: document.getElementById("count-car"),
    bus: document.getElementById("count-bus"),
    truck: document.getElementById("count-truck"),
    motorcycle: document.getElementById("count-motorcycle"),
    bicycle: document.getElementById("count-bicycle"),
    person: document.getElementById("count-person"),
  },
  logBody: document.getElementById("log-body"),
  startDt: document.getElementById("auto-start-dt"),
  endDt: document.getElementById("auto-end-dt"),
  reserveBtn: document.getElementById("reserve-btn"),
  scoreTh: document.getElementById("score-th"),
  iouTh: document.getElementById("iou-th"),
  minHits: document.getElementById("min-hits"),
  maxLost: document.getElementById("max-lost"),
  maxFps: document.getElementById("max-fps"),
  drawMode: document.getElementById("draw-mode"),
  countModeSelect: document.getElementById("count-mode"),
  geoLat: document.getElementById("geo-lat"),
  geoLng: document.getElementById("geo-lng"),
};


// ========= 説明ポップアップ（alertを使わず自作モーダル） =========
let INFO_MODAL = { overlay: null, title: null, body: null };

function ensureInfoModal(){
  if(INFO_MODAL.overlay) return;

  // style（最小限。既存CSSを崩さない）
  if(!document.getElementById("info-modal-style")){
    const st = document.createElement("style");
    st.id = "info-modal-style";
    st.textContent = `
      .info-modal-overlay{
        position:fixed; inset:0;
        background: rgba(0,0,0,0.45);
        display:none;
        align-items:center;
        justify-content:center;
        z-index: 9999;
        padding: 16px;
      }
      .info-modal{
        width: min(720px, 96vw);
        max-height: 85vh;
        background: #1b1b1b;
        color: #fff;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        overflow: hidden;
        display:flex;
        flex-direction: column;
      }
      .info-modal-header{
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding: 8px 12px; /* ←ヘッダーだけ少し薄く */
        border-bottom: 1px solid rgba(255,255,255,0.08);
        font-weight: 700;
      }
      .info-modal-close{
        width: 28px; height: 28px;
        border-radius: 9px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: #fff;
        cursor: pointer;
        display:inline-flex; align-items:center; justify-content:center;
        font-size: 16px; line-height: 1;
      }
      .info-modal-close:hover{ background: rgba(255,255,255,0.10); }
      .info-modal-body{
        padding: 14px;
        overflow:auto;
        font-size: 0.95rem;
        line-height: 1.55;
        white-space: pre-wrap;
      }
    `;
    document.head.appendChild(st);
  }

  const overlay = document.createElement("div");
  overlay.className = "info-modal-overlay";
  overlay.setAttribute("role","dialog");
  overlay.setAttribute("aria-modal","true");

  const modal = document.createElement("div");
  modal.className = "info-modal";

  const header = document.createElement("div");
  header.className = "info-modal-header";

  const title = document.createElement("div");
  title.className = "info-modal-title";
  title.textContent = "説明";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "info-modal-close";
  closeBtn.setAttribute("aria-label","閉じる");
  closeBtn.textContent = "×";

  const body = document.createElement("div");
  body.className = "info-modal-body";

  header.appendChild(title);
  header.appendChild(closeBtn);
  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = ()=>{ overlay.style.display = "none"; };

  // 枠外クリック/タップで閉じる
  overlay.addEventListener("pointerdown", (e)=>{
    if(e.target === overlay) close();
  });

  // 中身クリックで閉じない
  modal.addEventListener("pointerdown", (e)=> e.stopPropagation());

  closeBtn.addEventListener("click", close);

  // ESCでも閉じる（PC用）
  window.addEventListener("keydown", (e)=>{
    if(e.key === "Escape" && overlay.style.display === "flex") close();
  });

  INFO_MODAL = { overlay, title, body };
}

function showInfoModal(titleText, bodyText){
  ensureInfoModal();
  INFO_MODAL.title.textContent = titleText || "説明";
  INFO_MODAL.body.textContent = bodyText || "";
  INFO_MODAL.overlay.style.display = "flex";
}


// 画面上のカウントカード（灰色化用）
const COUNT_ITEM_EL = {};
for(const cat of UI_CATS){
  COUNT_ITEM_EL[cat] = document.querySelector(`.count-item.${cat}`);
}

function injectModeInactiveStyle(){
  if(document.getElementById("mode-inactive-style")) return;
  const st = document.createElement("style");
  st.id = "mode-inactive-style";
  // 使わない項目を「濃い灰色」で一目で分かるように
  st.textContent = `
    .count-item.inactive{
      background:#d0d0d0 !important;
      color:#666 !important;
      border-left-color:#777 !important;
      opacity:0.9;
      filter:grayscale(100%);
    }
  `;
  document.head.appendChild(st);
}

function applyModeUiState(){
  const inactiveCats = (countMode === "vehicle") ? ["person"] : VEHICLE_CATS;
  for(const cat of UI_CATS){
    const el = COUNT_ITEM_EL[cat];
    if(!el) continue;
    el.classList.toggle("inactive", inactiveCats.includes(cat));
  }
}

/* ========= 合計表示（カウント枠の下） =========
   - UI: 内訳なしで「確定合計（モード対象のみ）」「Unknown合計」「全体合計」
   - カウント枠（.counts）の直下に挿入
*/
let COUNT_SUMMARY = { root:null, counted:null, unknown:null, total:null };

function injectCountSummaryStyle(){
  if(document.getElementById("count-summary-style")) return;
  const st = document.createElement("style");
  st.id = "count-summary-style";
  st.textContent = `
    #realtime-stats .counts-summary{
      margin-top:8px;
      padding:10px 12px;
      border:1px solid var(--border-light);
      border-radius:6px;
      background:#fff;
      display:flex;
      gap:12px;
      flex-wrap:wrap;
      font-size:0.92rem;
    }
    #realtime-stats .counts-summary .sum-item{
      display:flex; gap:6px; align-items:baseline;
      min-width: 120px;
    }
    #realtime-stats .counts-summary .sum-label{ color:#555; }
    #realtime-stats .counts-summary .sum-value{ font-weight:700; }
  `;
  document.head.appendChild(st);
}

function setupCountSummaryUI(){
  if(COUNT_SUMMARY.root) return;
  const countsBox = document.querySelector("#realtime-stats .counts");
  if(!countsBox) return;

  injectCountSummaryStyle();

  const root = document.createElement("div");
  root.className = "counts-summary";
  root.setAttribute("aria-label", "合計表示");

  const mk = (labelTxt)=>{
    const item = document.createElement("div");
    item.className = "sum-item";
    const lab = document.createElement("span");
    lab.className = "sum-label";
    lab.textContent = labelTxt;
    const val = document.createElement("span");
    val.className = "sum-value";
    val.textContent = "0";
    item.appendChild(lab);
    item.appendChild(val);
    return { item, val };
  };

  const a = mk("合計（確定）:");
  const b = mk("合計（Unknown）:");
  const c = mk("合計（全体）:");

  root.appendChild(a.item);
  root.appendChild(b.item);
  root.appendChild(c.item);

  countsBox.insertAdjacentElement("afterend", root);

  COUNT_SUMMARY = { root, counted:a.val, unknown:b.val, total:c.val };
}

function getCountedTotalByMode(counts){
  if(countMode === "pedestrian"){
    return Number(counts.person || 0);
  }
  // vehicleモード
  return VEHICLE_CATS.reduce((s,k)=>s + Number(counts[k] || 0), 0);
}

function updateCountSummaryUI(){
  if(!COUNT_SUMMARY.root) return;
  const counted = getCountedTotalByMode(countsCurrentHour);
  const unknown = Number(unknownTotal || 0);
  const total = counted + unknown;

  COUNT_SUMMARY.counted.textContent = counted;
  COUNT_SUMMARY.unknown.textContent = unknown;
  COUNT_SUMMARY.total.textContent = total;
}

function setupTitleDescription(){
  const title = DOM.appTitle;
  if(!title) return;

  // 以前の説明テキスト（span.app-desc）が残っていれば消す
  const oldDesc = title.querySelector(".app-desc");
  if(oldDesc) oldDesc.remove();

  // すでに追加済みなら終了
  if(title.querySelector(".title-info-btn")) return;

  // 最小限のCSS（見た目を大きく変えない）
  if(!document.getElementById("title-help-style")){
    const st = document.createElement("style");
    st.id = "title-help-style";
    st.textContent = `
      #app-title{display:flex;align-items:center;gap:8px;}
      #app-title .title-info-btn{
        width:18px;height:18px;border-radius:50%;
        border:1px solid var(--border-light);
        background:#f8f9fa;color:#555;
        font-weight:bold;font-size:0.75rem;line-height:1;
        display:inline-flex;align-items:center;justify-content:center;
        cursor:pointer;padding:0;flex:0 0 auto;
      }
      #app-title .title-info-btn:hover{box-shadow:0 1px 3px rgba(0,0,0,0.12);}
    `;
    document.head.appendChild(st);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "title-info-btn";
  btn.textContent = "i";
  btn.setAttribute("aria-label", "アプリ全体の説明");

  const HELP = `【スマート交通量カウンター：全体説明】

■ROI（関心領域）の設定
・左の映像上でドラッグすると、点線の四角（ROI枠）を作れます。
・ROI枠は『境界に2回触れた』と判定したときにカウントされます。

■カウント対象（モード）
・右の『カウント対象』で切替できます。
  - 車両モード：乗用車/バス/トラック/バイク/自転車を計測（歩行者は対象外）
  - 歩行者モード：歩行者のみを計測（車両は対象外）
・対象外の枠は灰色になり、表示/計測もしません。

■開始/停止
・『開始』で計測開始、もう一度押すと停止します。

■しきい値等の調整
・各設定項目の横の『i』で説明を確認できます。`;

  btn.addEventListener("click", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    showInfoModal("アプリ全体の説明", HELP);
  });

  title.appendChild(btn);
}


/* ========= 設定項目ヘルプ（各項目横のiボタン） ========= */
function setupSettingItemHelpPopups(){
  // 1) 最小限のCSSをJS側で注入（style.cssの見た目を崩さない）
  if(!document.getElementById("setting-help-style")){
    const st = document.createElement("style");
    st.id = "setting-help-style";
    st.textContent = `
      #settings-panel .setting-label-row{display:inline-flex;align-items:center;justify-content:flex-start;gap:6px;width:auto;}
      #settings-panel .setting-info-btn{width:18px;height:18px;border-radius:50%;border:1px solid var(--border-light);background:#f8f9fa;color:#555;font-weight:bold;font-size:0.75rem;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex:0 0 auto;}
      #settings-panel .setting-info-btn:hover{box-shadow:0 1px 3px rgba(0,0,0,0.12);} 
    `;
    document.head.appendChild(st);
  }

  // 2) 各設定の説明（id → 日本語説明）
  const HELP = {
    "count-mode":
      "測定対象を切り替えます。\n\n"+
      "・車両カウントモード：車両（乗用車/バス/トラック/バイク/自転車）を計測します。人（person）は検出・描画しません。\n"+
      "・歩行者カウントモード：歩行者（person）のみを計測します。車両は検出・描画しません。",
    "score-th":
      "検出の信頼度（Confidence）の下限です。\n"+
      "数値を上げると誤検出は減りやすい一方、見逃しが増える傾向があります。",
    "max-fps":
      "解析（検出）の最大実行頻度です。\n"+
      "低くすると端末負荷は下がりますが、高速に通過する物体の取りこぼしが増える可能性があります。",
    "min-hits":
      "同一物体として確定するために必要な連続検出フレーム数です。\n"+
      "大きいほど誤カウントは減りやすい一方、短時間しか映らない物体はカウントされにくくなります。",
    "iou-th":
      "追跡で『同じ物体』と判断するための重なり率（IoU）のしきい値です。\n"+
      "高いほど一致判定が厳しくなり、低いほど一致判定が緩くなります。",
    "max-lost":
      "一時的に検出が途切れても同一物体として追跡を維持する猶予フレーム数です。\n"+
      "大きいほど再出現を同一として扱いやすい一方、別物体と混同するリスクが増える場合があります。",
    "draw-mode":
      "バウンディングボックス等の描画方法を切り替えます。\n\n"+
      "・枠+ID+ラベル：枠と追跡IDとクラス名を表示\n"+
      "・枠のみ：枠だけ表示\n"+
      "・非表示：描画しない（計測は継続）"
  };

  const grid = document.querySelector("#settings-panel .settings-grid");
  if(!grid) return;

  // すでに追加済みなら二重に作らない
  if(grid.dataset.helpInjected === "1") return;
  grid.dataset.helpInjected = "1";

  // 3) labelの先頭テキストを取り出して、右側にiボタンを付ける
  const labels = Array.from(grid.querySelectorAll("label"));
  labels.forEach((label)=>{
    const control = label.querySelector("input, select, textarea");
    const id = control?.id;
    if(!id || !HELP[id]) return;

    // label内の最初のテキストノード（項目名）を抽出
    let titleText = "";
    for(const n of Array.from(label.childNodes)){
      if(n.nodeType === Node.TEXT_NODE){
        const t = (n.textContent || "").replace(/\s+/g, " ").trim();
        if(t){
          titleText = t;
          // このテキストノードは置き換える
          label.removeChild(n);
          break;
        }
      }
    }
    if(!titleText) titleText = id;

    const row = document.createElement("div");
    row.className = "setting-label-row";

    const title = document.createElement("span");
    title.textContent = titleText;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "setting-info-btn";
    btn.textContent = "i";
    btn.setAttribute("aria-label", `${titleText} の説明`);

    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      showInfoModal(`【${titleText}】`, HELP[id]);
    });

    row.appendChild(title);
    row.appendChild(btn);

    // controlの直前にrowを挿入
    if(control){
      label.insertBefore(row, control);
    }else{
      label.prepend(row);
    }
  });
}



function removeSettingsInfoMark(){
  // 「設定」見出し右側のインフォマークを消す
  try{ document.getElementById("settings-info-btn")?.remove(); }catch(_e){}
}

// 先にUI上の不要ボタンを消し、タイトル説明を追加（ちらつき防止）
removeSettingsInfoMark();
setupTitleDescription();
injectModeInactiveStyle();


let model = null;
let isAnalyzing = false;
let rafId = null;
let lastInferTime = 0;
let analysisStartTime = null;
let hourWindowStart = null;

let geo = { lat: "未取得", lng: "未取得" };
const MAX_LOGS = 100;

const zeroCounts = () => ({
  car: 0, bus: 0, truck: 0, motorcycle: 0, bicycle: 0, person: 0
});
let countsCurrentHour = zeroCounts();
let unknownTotal = 0;              // Unknown合計（UI/CSV）
let unknownOneTouch = 0;           // Unknown内訳：接触1回のみ
let unknownClassMismatch = 0;      // Unknown内訳：クラス不一致

let recordsHourly = [];
let autoSaveTimer = null;
let scheduleTimerStart = null;
let scheduleTimerEnd = null;

let lastSnapAt = 0;
let frameIndex = 0;

/* ========= モード/ロジック ========= */
const LS_KEY_MODE  = "trafficCounter.countMode";

const LS_KEY_ROI   = "trafficCounter.roiNorm";

function getUrlParam(name){
  try { return new URL(location.href).searchParams.get(name); } catch { return null; }
}
function normalizeMode(v){
  return (v === "pedestrian" || v === "person") ? "pedestrian" : "vehicle";
}

function modeLabel(m){
  return (m === "pedestrian") ? "歩行者カウントモード" : "車両カウントモード";
}

let countMode  = normalizeMode(getUrlParam("mode")  || localStorage.getItem(LS_KEY_MODE)  || "vehicle");
// ロジックはROI境界2回に固定
const countLogic = "roi";

/* ========= ROI（内部保持） =========
   - 現時点ではUIを変えないため、ROIは「全画面」が初期値
   - 今後、手入力UI/回転ROIは③で対応予定
*/
let ROI_NORM = { x: 0.0, y: 0.0, w: 1.0, h: 1.0 }; // 正規化(0-1)
// 保存済みROIがあれば復元（UIは変えず内部設定のみ）
try{
  const saved = localStorage.getItem(LS_KEY_ROI);
  if(saved){
    const obj = JSON.parse(saved);
    if(obj && isFinite(obj.x) && isFinite(obj.y) && isFinite(obj.w) && isFinite(obj.h)){
      ROI_NORM = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    }
  }
}catch(_e){}
function getRoiPx(){
  const W = DOM.canvas.width || 1;
  const H = DOM.canvas.height || 1;
  return {
    x: ROI_NORM.x * W,
    y: ROI_NORM.y * H,
    w: ROI_NORM.w * W,
    h: ROI_NORM.h * H
  };
}
function pointInRect(px, py, r){
  return (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
}

// キャンバス座標 ↔ ROI正規化のユーティリティ
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

function getCanvasPoint(ev){
  const rect = DOM.canvas.getBoundingClientRect();
  const sx = (DOM.canvas.width  || 1) / (rect.width  || 1);
  const sy = (DOM.canvas.height || 1) / (rect.height || 1);
  return {
    x: (ev.clientX - rect.left) * sx,
    y: (ev.clientY - rect.top)  * sy
  };
}

function setRoiFromPx(x1,y1,x2,y2){
  const W = DOM.canvas.width  || 1;
  const H = DOM.canvas.height || 1;
  const left   = clamp(Math.min(x1,x2), 0, W);
  const right  = clamp(Math.max(x1,x2), 0, W);
  const top    = clamp(Math.min(y1,y2), 0, H);
  const bottom = clamp(Math.max(y1,y2), 0, H);

  const w = Math.max(1, right - left);
  const h = Math.max(1, bottom - top);

  ROI_NORM = {
    x: left / W,
    y: top  / H,
    w: w    / W,
    h: h    / H
  };
}

function saveRoi(){
  try{ localStorage.setItem(LS_KEY_ROI, JSON.stringify(ROI_NORM)); }catch(_e){}
}

function drawRoi(ctx){
  // ROI枠は常に表示（ROI境界2回カウント固定）
  const r = getRoiPx();
  if(r.w <= 0 || r.h <= 0) return;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([8,6]);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.fillStyle   = "rgba(255,255,255,0.08)";
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([]);
  ctx.restore();
}

function setupRoiDrag(){
  const c = DOM.canvas;
  if(!c) return;

  // スマホでのスクロール干渉を避ける（見た目は変えない）
  c.style.touchAction = "none";

  let dragging = false;
  let p0 = null;

  c.addEventListener("pointerdown", (ev)=>{
    // 測定中/停止中どちらでもROIは設定できる
    if(!DOM.canvas.width || !DOM.canvas.height) return;
    dragging = true;
    p0 = getCanvasPoint(ev);
    try{ c.setPointerCapture(ev.pointerId); }catch(_e){}
    ev.preventDefault();
  });

  c.addEventListener("pointermove", (ev)=>{
    if(!dragging || !p0) return;
    const p = getCanvasPoint(ev);
    setRoiFromPx(p0.x, p0.y, p.x, p.y);
    ev.preventDefault();
  });

  const finish = (ev)=>{
    if(!dragging) return;
    dragging = false;
    p0 = null;
    saveRoi();
    toast("ROIを設定しました");
    ev?.preventDefault?.();
  };

  c.addEventListener("pointerup", finish);
  c.addEventListener("pointercancel", finish);
}

/* ========= 追跡器（マルチクラス） ========= */
class Track {
  constructor(id, det){
    this.id = id;
    this.bbox = det.bbox;        // [x,y,w,h]
    this.score = det.score;
    this.cls = det.cls;          // class label
    this.state = "tentative";
    this.hitStreak = 1;
    this.lostAge = 0;
    this.createdAt = performance.now();
    this.lastSeenAt = this.createdAt;
  }
  center(){
    const [x,y,w,h] = this.bbox;
    return { x: x + w/2, y: y + h/2 };
  }
  update(det){
    this.bbox = det.bbox;
    this.score = det.score;
    this.cls = det.cls;
    this.hitStreak++;
    this.lostAge = 0;
    this.lastSeenAt = performance.now();
  }
}

class Tracker {
  constructor(opts){
    this.tracks = [];
    this.nextId = 1;
    this.iouThreshold = opts.iouThreshold ?? 0.4;
    this.minHits = opts.minHits ?? 3;
    this.maxLostAge = opts.maxLostAge ?? 30;
    this.onConfirmed = opts.onConfirmed ?? (()=>{});
    this.onRemoved   = opts.onRemoved   ?? (()=>{});
  }

  static iou(a, b){
    const [x1,y1,w1,h1] = a;
    const [x2,y2,w2,h2] = b;
    const left = Math.max(x1, x2);
    const top  = Math.max(y1, y2);
    const right = Math.min(x1 + w1, x2 + w2);
    const bottom= Math.min(y1 + h1, y2 + h2);
    const iw = Math.max(0, right - left);
    const ih = Math.max(0, bottom - top);
    const inter = iw * ih;
    const union = (w1*h1) + (w2*h2) - inter;
    return union > 0 ? inter/union : 0;
  }

  updateWithDetections(dets){
    // dets: [{bbox, score, cls}]
    const matches = [];
    const unmatchedDets = new Set(dets.map((_, i)=>i));
    const unmatchedTracks = new Set(this.tracks.map((_, i)=>i));
    const pairs = [];

    for(let ti=0; ti<this.tracks.length; ti++){
      for(let di=0; di<dets.length; di++){
        pairs.push({ ti, di, iou: Tracker.iou(this.tracks[ti].bbox, dets[di].bbox) });
      }
    }
    pairs.sort((a,b)=>b.iou-a.iou);

    for(const p of pairs){
      if(p.iou < this.iouThreshold) break;
      if(unmatchedTracks.has(p.ti) && unmatchedDets.has(p.di)){
        matches.push(p);
        unmatchedTracks.delete(p.ti);
        unmatchedDets.delete(p.di);
      }
    }

    // 更新
    for(const m of matches){
      const tr = this.tracks[m.ti];
      const det = dets[m.di];
      tr.update(det);
      if(tr.state === "tentative" && tr.hitStreak >= this.minHits){
        tr.state = "confirmed";
        this.onConfirmed(tr);
      }
    }

    // 新規
    for(const di of unmatchedDets){
      const det = dets[di];
      const tr = new Track(this.nextId++, det);
      this.tracks.push(tr);
    }

    // 見失い加算
    for(const ti of unmatchedTracks){
      this.tracks[ti].lostAge++;
    }

    // 破棄（ここでコールバック）
    const kept = [];
    for(const tr of this.tracks){
      if(tr.lostAge <= this.maxLostAge){
        kept.push(tr);
      }else{
        this.onRemoved(tr);
      }
    }
    this.tracks = kept;
  }
}

let tracker = null;

/* ========= ROIカウント（境界2回接触） ========= */
const roiStateByTrack = new Map();
/*
  roiState:
  {
    prevIn: boolean,
    contactCount: 0|1,
    firstClass: string|null,
    lastContactFrame: number
  }
*/
const ROI_DEBOUNCE_FRAMES = 3;

function ensureRoiState(track){
  if(!roiStateByTrack.has(track.id)){
    const c = track.center();
    const r = getRoiPx();
    roiStateByTrack.set(track.id, {
      prevIn: pointInRect(c.x, c.y, r),
      contactCount: 0,
      firstClass: null,
      lastContactFrame: -999999
    });
  }
  return roiStateByTrack.get(track.id);
}

function isVehicleClass(cls){
  return VEHICLE_CATS.includes(cls);
}

function countUp(cls){
  if(!UI_CATS.includes(cls)) return;
  countsCurrentHour[cls] += 1;
  updateCountUI();
}

function countUnknownOneTouchUp(){
  unknownTotal += 1;
  unknownOneTouch += 1;
  updateCountSummaryUI();
}
function countUnknownClassMismatchUp(){
  unknownTotal += 1;
  unknownClassMismatch += 1;
  updateCountSummaryUI();
}

function applyCountByMode(cls){
  // モードに応じてカウント対象を絞る
  if(countMode === "pedestrian"){
    if(cls === "person") countUp("person");
    return;
  }
  // vehicleモード：車両のみ（personは無視）
  if(isVehicleClass(cls)) countUp(cls);
}

function finalizeRoiTrip(firstCls, secondCls){
  if(firstCls === secondCls){
    applyCountByMode(secondCls);
  }else{
    // 1回目と2回目でクラスが異なる → Unknown
    countUnknownClassMismatchUp();
  }
}


function updateRoiCountingForConfirmedTracks(){

  const r = getRoiPx();

  for(const tr of tracker.tracks){
    if(tr.state !== "confirmed") continue;
    if(tr.lostAge > 0) continue; // 今フレームで見えてないものは扱わない

    const st = ensureRoiState(tr);
    const c = tr.center();
    const inNow = pointInRect(c.x, c.y, r);

    if(inNow !== st.prevIn){
      // 境界接触（内外が切り替わった）
      if(frameIndex - st.lastContactFrame >= ROI_DEBOUNCE_FRAMES){
        st.lastContactFrame = frameIndex;

        if(st.contactCount === 0){
          st.contactCount = 1;
          st.firstClass = tr.cls;
        }else if(st.contactCount === 1){
          // 2回目で確定
          finalizeRoiTrip(st.firstClass, tr.cls);
          roiStateByTrack.delete(tr.id); // 1物体1回カウントにする
        }
      }
      st.prevIn = inNow;
    }
  }
}

function onTrackRemoved(tr){
  // ROIロジックの「接触1回のみ」→ 車両不明
  const st = roiStateByTrack.get(tr.id);
  if(!st) return;
  if(st.contactCount === 1){
    countUnknownOneTouchUp();
  }
  roiStateByTrack.delete(tr.id);
}

/* ========= 検出結果の前処理（①重複カウント対策） ========= */
function bboxContainsPoint(bbox, px, py){
  const [x,y,w,h] = bbox;
  return (px >= x && px <= x+w && py >= y && py <= y+h);
}
function bboxCenter(bbox){
  const [x,y,w,h] = bbox;
  return { x: x+w/2, y: y+h/2 };
}

function filterDetectionsByMode(rawDets){
  // rawDets: [{bbox, score, cls}]
  if(countMode === "pedestrian"){
    // 歩行者特化：personだけ残す
    return rawDets.filter(d => d.cls === "person");
  }

  // vehicleモード：車両カウントに集中するため、personは一切扱わない（表示もしない）
  const vehicles = rawDets.filter(d => VEHICLE_CATS.includes(d.cls));
  return vehicles;
}

/* ========= 初期化 ========= */
window.addEventListener("load", init);

async function init(){
  try{
    applyModeUiState();
    setupCountSummaryUI();
    updateCountSummaryUI();
    setupSettingItemHelpPopups();
    progressFake(5);
    await tf.ready();

    progressFake(35);
    model = await cocoSsd.load();

    progressFake(100);
    setTimeout(()=>DOM.status.classList.add("hidden"), 500);

    await setupCamera();

    await getGeolocation().catch(err=>{
      console.warn("Initial geolocation failed:", err?.message || err);
      toast("位置情報の自動取得に失敗しました", true);
    });

    setupEventListeners();
    setupTracker();
    updateHourTitle();
    drawVideoToCanvas();

    DOM.toggleBtn.disabled = false;

    toast(`準備完了（${modeLabel(countMode)} / ROI境界2回カウント）`);
  }catch(err){
    console.error(err);
    alert(`初期化に失敗しました: ${err?.message || err}`);
  }
}

function progressFake(v){
  DOM.loadingPerc.textContent = `${v}%`;
  DOM.loadingProg.value = v;
}

/* ========= イベント ========= */
function setupEventListeners(){
  DOM.toggleBtn.addEventListener("click", toggleAnalysis);

  // モード切替（設定パネルのプルダウン）
  if(DOM.countModeSelect){
    // 初期値を反映
    DOM.countModeSelect.value = normalizeMode(countMode);

    DOM.countModeSelect.addEventListener("change", ()=>{
      countMode = normalizeMode(DOM.countModeSelect.value);
      try{ localStorage.setItem(LS_KEY_MODE, countMode); }catch(_e){}
      toast(`モード切替：${modeLabel(countMode)}`);
      applyModeUiState();
      updateCountUI();
      setupSettingItemHelpPopups();

      // すぐ画面に反映（残っているトラックは描画側で抑制）
      if(isAnalyzing) setupTracker();
    });
  }

  DOM.reserveBtn.addEventListener("click", handleReservation);
  window.addEventListener("resize", adjustCanvasSize);

  // 既存設定は測定中に変更されたら追跡器を再生成（挙動は従来通り）
  ["iou-th","min-hits","max-lost","score-th","max-fps","draw-mode"].forEach(id=>{
    document.getElementById(id).addEventListener("change", ()=>{
      if(isAnalyzing) setupTracker();
    });
  });

  setupTabs();
  setupRoiDrag(); // ROI枠のドラッグ設定（見た目変化はキャンバス上の枠のみ）

  // 隠しショートカット（UI追加なし）
  window.addEventListener("keydown", (e)=>{
    if(e.repeat) return;
    if(e.key === "m" || e.key === "M"){
      countMode = (countMode === "vehicle") ? "pedestrian" : "vehicle";
      localStorage.setItem(LS_KEY_MODE, countMode);
      if(DOM.countModeSelect) DOM.countModeSelect.value = countMode;
      toast(`モード切替：${modeLabel(countMode)}`);
      applyModeUiState();
      updateCountUI();
      setupSettingItemHelpPopups();
    }

    if(e.key === "r" || e.key === "R"){
      ROI_NORM = { x: 0.0, y: 0.0, w: 1.0, h: 1.0 };
      saveRoi();
      toast("ROIをリセットしました");
    }

  });
}


function setupTabs(){
  const tabs = document.querySelectorAll(".tab-link");
  const contents = document.querySelectorAll(".tab-content");
  tabs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.dataset.tab;
      tabs.forEach(t=>t.classList.remove("active"));
      contents.forEach(c=>c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${key}`).classList.add("active");
    });
  });
}

/* ========= 測定開始・終了 ========= */
function toggleAnalysis(){
  isAnalyzing = !isAnalyzing;
  if(isAnalyzing) startAnalysis();
  else stopAnalysis();
}

function startAnalysis(){
  DOM.toggleBtn.textContent = "終了";
  DOM.toggleBtn.classList.replace("btn-green", "btn-red");
  DOM.canvas.classList.add("analyzing");

  setupTracker();
  getGeolocation().catch(()=>{});

  countsCurrentHour = zeroCounts();
  unknownTotal = 0;
  unknownOneTouch = 0;
  unknownClassMismatch = 0;
  recordsHourly = [];
  roiStateByTrack.clear();

  analysisStartTime = new Date();
  hourWindowStart = new Date();

  updateCountUI();
  updateHourTitle();
  updateLogDisplay(true);

  startAutoSaveHourly();

  lastInferTime = 0;
  frameIndex = 0;

  detectLoop();
}

function stopAnalysis(){
  DOM.toggleBtn.textContent = "開始";
  DOM.toggleBtn.classList.replace("btn-red", "btn-green");
  DOM.canvas.classList.remove("analyzing");

  cancelAnimationFrame(rafId);
  stopAutoSaveHourly();

  if(recordsHourly.length > 0){
    exportCSV(recordsHourly, geo, { total: unknownTotal, oneTouch: unknownOneTouch, classMismatch: unknownClassMismatch });
  }

  countsCurrentHour = zeroCounts();
  unknownTotal = 0;
  unknownOneTouch = 0;
  unknownClassMismatch = 0;
  recordsHourly = [];
  roiStateByTrack.clear();

  updateCountUI();
  updateLogDisplay(true);
  drawVideoToCanvas();
  toast("測定を終了しました");
}

/* ========= 測定予約 ========= */
async function handleReservation(){
  try{
    await getGeolocation();
    applySchedule();
  }catch(e){
    toast("位置情報取得が必要です", true);
  }
}

function applySchedule(){
  if(scheduleTimerStart) clearTimeout(scheduleTimerStart);
  if(scheduleTimerEnd) clearTimeout(scheduleTimerEnd);

  const start = DOM.startDt.value ? new Date(DOM.startDt.value) : null;
  const end   = DOM.endDt.value ? new Date(DOM.endDt.value) : null;
  const now = new Date();

  let scheduled = false;

  if(start && start > now){
    scheduleTimerStart = setTimeout(()=>{ if(!isAnalyzing) toggleAnalysis(); }, start - now);
    scheduled = true;
  }

  if(end && (!start || end > start)){
    scheduleTimerEnd = setTimeout(()=>{ if(isAnalyzing) toggleAnalysis(); }, Math.max(0, end - now));
    scheduled = true;
  }

  if(scheduled) toast("予約が完了しました");
  else toast("予約可能な日時が設定されていません", true);
}

/* ========= 位置情報 ========= */
function getGeolocation(){
  return new Promise((resolve, reject)=>{
    if(!navigator.geolocation){
      DOM.geoLat.textContent = "非対応";
      DOM.geoLng.textContent = "非対応";
      reject(new Error("ブラウザが位置情報取得に非対応です"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos=>{
        geo.lat = pos.coords.latitude.toFixed(6);
        geo.lng = pos.coords.longitude.toFixed(6);
        DOM.geoLat.textContent = geo.lat;
        DOM.geoLng.textContent = geo.lng;
        resolve(pos);
      },
      err=>{
        geo.lat = "取得失敗";
        geo.lng = "取得失敗";
        DOM.geoLat.textContent = geo.lat;
        DOM.geoLng.textContent = geo.lng;
        reject(err);
      },
      { enableHighAccuracy:true, timeout:8000, maximumAge:60000 }
    );
  });
}

/* ========= カメラ ========= */
async function setupCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  DOM.video.srcObject = stream;
  return new Promise(resolve=>{
    DOM.video.onloadedmetadata = ()=>{
      DOM.video.play();
      adjustCanvasSize();
      resolve();
    };
  });
}

function adjustCanvasSize(){
  const w = DOM.video.videoWidth;
  const h = DOM.video.videoHeight;
  if(!w || !h) return;

  DOM.canvas.width = w;
  DOM.canvas.height = h;
  DOM.canvas.style.width = `${DOM.video.offsetWidth}px`;
  DOM.canvas.style.height = `${DOM.video.offsetHeight}px`;
}

/* ========= 追跡器セットアップ ========= */
function setupTracker(){
  tracker = new Tracker({
    iouThreshold: Number(DOM.iouTh.value),
    minHits: Number(DOM.minHits.value),
    maxLostAge: Number(DOM.maxLost.value),

    // classicロジック：confirmedで即カウント（従来に近い）
    onConfirmed: (tr)=>{
      if(countLogic !== "classic") return;
      applyCountByMode(tr.cls);
    },

    // roiロジック：1回接触のみの「車両不明」を拾うため
    onRemoved: (tr)=> onTrackRemoved(tr),
  });
}

/* ========= メイン検出ループ ========= */
function detectLoop(){
  if(!isAnalyzing) return;

  const interval = 1000 / Number(DOM.maxFps.value);
  const now = performance.now();
  if(now - lastInferTime < interval){
    rafId = requestAnimationFrame(detectLoop);
    return;
  }
  lastInferTime = now;
  frameIndex++;

  model.detect(DOM.video).then(preds=>{
    const scoreTh = Number(DOM.scoreTh.value);

    // 1) UI対象のクラスだけに落とす
    const raw = [];
    for(const p of preds){
      if(!UI_CATS.includes(p.class)) continue;
      if(p.score < scoreTh) continue;
      raw.push({ bbox: p.bbox, score: p.score, cls: p.class });
    }

    // 2) ①モードでフィルタ（車内person除外 / person特化）
    const dets = filterDetectionsByMode(raw);

    // 3) 追跡更新
    tracker.updateWithDetections(dets);

    // 4) ②ROIロジック（confirmedの境界接触を処理）
    updateRoiCountingForConfirmedTracks();

    // 5) 描画
    drawAll();

    // 6) ログ
    pushHourlySnapshotIfNeeded();

    rafId = requestAnimationFrame(detectLoop);
  }).catch(err=>{
    console.error(err);
    rafId = requestAnimationFrame(detectLoop);
  });
}

/* ========= 描画 ========= */
function drawVideoToCanvas(){
  if(DOM.video.videoWidth){
    adjustCanvasSize();
    DOM.ctx.drawImage(DOM.video, 0, 0, DOM.canvas.width, DOM.canvas.height);
    // 開始前でもROI枠を見えるように描画
    drawRoi(DOM.ctx);
  }
  if(!isAnalyzing) requestAnimationFrame(drawVideoToCanvas);
}

function drawAll(){
  const mode = DOM.drawMode.value;
  const ctx = DOM.ctx;

  ctx.drawImage(DOM.video, 0, 0, DOM.canvas.width, DOM.canvas.height);

  // ROI枠（ロジックがROIのときだけ表示）
  drawRoi(ctx);

  if(mode === "off") return;

  ctx.save();
  ctx.font = "14px Segoe UI, Arial";
  ctx.lineWidth = 2;

  const color = {
    car: "#1e88e5",
    bus: "#43a047",
    truck: "#fb8c00",
    motorcycle: "#8e24aa",
    bicycle: "#fdd835",
    person: "#e53935",
  };

  for(const tr of tracker.tracks){
    if(tr.lostAge > 0) continue;

    const [x,y,w,h] = tr.bbox;
    const cls = tr.cls;

    // モードに応じて描画対象を絞る
    if(countMode === "vehicle" && cls === "person") continue; // 車両モードは人を描画しない
    if(countMode === "pedestrian" && cls !== "person") continue; // 歩行者モードは人以外を描画しない

    ctx.strokeStyle = color[cls] || "#ffffff";
    ctx.strokeRect(x,y,w,h);

    if(mode === "all"){
      const label = `${cls} ${Math.floor(tr.score*100)} [#${tr.id}]`;
      const tw = ctx.measureText(label).width + 6;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x, Math.max(0, y-18), tw, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x+3, Math.max(10, y-4));
    }
  }

  ctx.restore();
}

/* ========= ログ/CSV ========= */
function startAutoSaveHourly(){
  if(autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(async ()=>{
const snapshot = { ...countsCurrentHour };
const now = new Date();
const row = {
  timestamp: formatTimestamp(now),
  ...snapshot,
  unknown_total: unknownTotal,
  unknown_one_touch: unknownOneTouch,
  unknown_class_mismatch: unknownClassMismatch,
  total_counted_mode: getCountedTotalByMode(snapshot),
  total_all: getCountedTotalByMode(snapshot) + unknownTotal
};

    recordsHourly.push(row);

    await exportCSV(recordsHourly, geo, { total: unknownTotal, oneTouch: unknownOneTouch, classMismatch: unknownClassMismatch });

    // 次の時間帯へ
    recordsHourly = [];
    countsCurrentHour = zeroCounts();
    unknownTotal = 0;
  unknownOneTouch = 0;
  unknownClassMismatch = 0;

    hourWindowStart = now;
    analysisStartTime = now;

    updateHourTitle();
    updateCountUI();
    updateLogDisplay(true);
  }, 3600000);
}

function stopAutoSaveHourly(){
  if(autoSaveTimer){
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

function pushHourlySnapshotIfNeeded(){
  const t = Date.now();
  if(t - lastSnapAt < 1000) return;
  lastSnapAt = t;

const snapshot = { ...countsCurrentHour };
const row = {
  timestamp: formatTimestamp(new Date(t)),
  ...snapshot,
  unknown_total: unknownTotal,
  unknown_one_touch: unknownOneTouch,
  unknown_class_mismatch: unknownClassMismatch,
  total_counted_mode: getCountedTotalByMode(snapshot),
  total_all: getCountedTotalByMode(snapshot) + unknownTotal
};
  recordsHourly.push(row);
  updateLogDisplay();
}

function updateLogDisplay(clear=false){
  if(clear){
    DOM.logBody.innerHTML = "";
    return;
  }
  const last = recordsHourly[recordsHourly.length-1];
  if(!last) return;

  const tr = document.createElement("tr");
  tr.innerHTML =
    `<td>${last.timestamp.split(" ")[1]}</td>` +
    `<td>${last.car}</td><td>${last.bus}</td><td>${last.truck}</td>` +
    `<td>${last.motorcycle}</td><td>${last.bicycle}</td><td>${last.person}</td>`;
  DOM.logBody.prepend(tr);

  while(DOM.logBody.children.length > MAX_LOGS){
    DOM.logBody.lastChild?.remove();
  }
}

function updateHourTitle(){
  const h = (hourWindowStart || new Date()).getHours().toString().padStart(2, "0");
  DOM.hourTitle.textContent = `${h}時台の交通量`;
}

function updateCountUI(){
  for(const k of UI_CATS){
    DOM.count[k].textContent = countsCurrentHour[k];
  }
  setupCountSummaryUI();
  updateCountSummaryUI();
}

async function exportCSV(data, geo, unknown){
  if(!data || data.length === 0){
    toast("出力するデータがありません", true);
    return;
  }

  // Excel表示を意識したCSV（擬似「見出し行」付き）
  const endTime = new Date();

  const kindWord = (countMode === "pedestrian") ? "通行量" : "交通量";
  const targetLabel =
    (countMode === "pedestrian")
      ? "歩行者"
      : "車両（5車種判別）";

  const unkTotalAll = unknown?.total ?? 0;
  const unkOneAll   = unknown?.oneTouch ?? 0;
  const unkMisAll   = unknown?.classMismatch ?? 0;

  // --- メタデータ（先頭列にのみ表示）
  // 先頭に # を付けない（Excelでそのまま読めるように）
  const metaLines = [
    `測定場所（緯度）: ${geo.lat}`,
    `測定場所（経度）: ${geo.lng}`,
    `測定期間: ${formatTimestamp(analysisStartTime || new Date())} - ${formatTimestamp(endTime)}`,
    `種別: ${kindWord}`,
    `スコア閾値: ${DOM.scoreTh.value}`,
    `検出FPS上限: ${DOM.maxFps.value}`,
    `測定対象：${targetLabel}`,
    //`Unknown（累計）: ${unkTotalAll}`,
    //`Unknown内訳（接触1回のみ）: ${unkOneAll}`,
    //`Unknown内訳（クラス不一致）: ${unkMisAll}`,
    `` // 空行
  ];

  // CSVのカラム数（見た目を揃えるために固定）
  const COLS = 12;

  // 値をCSVセルに安全にする（カンマ/改行/ダブルクォート対策）
  const csvCell = (v)=>{
    if(v === null || v === undefined) return "";
    const s = String(v);
    const escaped = s.replace(/"/g,'""');
    return `"${escaped}"`;
  };

  const csvRow = (arr)=>{
    const a = arr.slice(0, COLS);
    while(a.length < COLS) a.push("");
    return a.map(csvCell).join(",");
  };

  // --- 見出し（Excelで「表っぽく」見えるように2段）
  const headerTop = csvRow([
    "", "車両（確定）", "", "", "", "", "",
    "車種不明", "", "",
    "歩行者", "総合計"
  ]);

  const headerCols = csvRow([
    "日時",
    "乗用車","バス","トラック","バイク","自転車","小計",
    "枠接触1回","車種不一致","小計",
    "歩行者","全体合計"
  ]);

  // --- データ行
  const rows = data.map(r=>{
    const car  = Number(r.car ?? 0);
    const bus  = Number(r.bus ?? 0);
    const truck= Number(r.truck ?? 0);
    const moto = Number(r.motorcycle ?? 0);
    const bici = Number(r.bicycle ?? 0);
    const pers = Number(r.person ?? 0);

    // Unknown（行ごとに保持しているならそれを採用）
    const unkOne = (typeof r.unknown_one_touch === "number") ? r.unknown_one_touch : 0;
    const unkMis = (typeof r.unknown_class_mismatch === "number") ? r.unknown_class_mismatch : 0;
    const unkSub = (typeof r.unknown_total === "number")
      ? r.unknown_total
      : (unkOne + unkMis);

    const vehSub = car + bus + truck + moto + bici;

    // 全体合計：表の「全体合計」列は常に（車両確定 + Unknown + 歩行者）
    const allTotal = vehSub + unkSub + pers;

    return csvRow([
      r.timestamp,
      car, bus, truck, moto, bici, vehSub,
      unkOne, unkMis, unkSub,
      pers, allTotal
    ]);
  }).join("\r\n");

  // メタデータは「先頭列だけ」に入れて、他列は空で揃える
  const metaBlock = metaLines.map(line=>{
    if(line === "") return ""; // 空行
    return csvRow([line]);
  }).join("\r\n");

  const csvText = `\uFEFF${metaBlock}\r\n${headerTop}\r\n${headerCols}\r\n${rows}\r\n`;

  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const name = fileNameFromDate(analysisStartTime || new Date(), kindWord);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast(`CSVファイル「${name}」を出力しました`);
}

function fileNameFromDate(d, kindWord="交通量"){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  const h = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  const s = String(d.getSeconds()).padStart(2,"0");
  return `${kindWord}_${y}${m}${da}_${h}${mi}${s}.csv`;
}

function toast(msg, isError=false){
  DOM.toast.textContent = msg;
  DOM.toast.style.backgroundColor = isError ? "rgba(229,57,53,.85)" : "rgba(0,0,0,.8)";
  DOM.toast.classList.remove("hidden");
  setTimeout(()=>DOM.toast.classList.add("hidden"), 3000);
}

function formatTimestamp(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  const h = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  const s = String(d.getSeconds()).padStart(2,"0");
  return `${y}/${m}/${da} ${h}:${mi}:${s}`;
}
