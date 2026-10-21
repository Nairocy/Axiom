import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface KaomojiPanelProps {
  t: (key: string) => string; emojiFavorites: string[]; setEmojiFavorites: (v: string[]|((p:string[])=>string[])) => void;
  imageFavorites: string[]; setImageFavorites: (v: string[]|((p:string[])=>string[])) => void;
  activeTab: "emoji"|"favorites"; setActiveTab: (v: "emoji"|"favorites") => void; saveSetting: (key:string,val:string) => void;
}

const EmojiPanel = (p: KaomojiPanelProps) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [ctxTag, setCtxTag] = useState<{idx:number,tab:string}|null>(null);
  const ctxRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Pointer drag (multi-row aware)
  const ds = useRef({active:false,idx:-1,tab:'',startX:0,startY:0,_splIdx:-1 as number});
  const [di, setDi] = useState(-1); // drag index
  const [ti, setTi] = useState(-1); // visual target index (for outline)
  const [indStyle, setIndStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const gapPx = 6; // matches CSS gap:'6px'

  const pk = (upd: ((p:string[])=>string[])|string[]) => p.setEmojiFavorites((prev: string[])=>{
    const next = typeof upd === "function" ? upd(prev) : upd;
    const unique = Array.from(new Set(next.filter(s=>s.trim()))); p.saveSetting("app.kaomoji_favorites",JSON.stringify(unique)); return unique;
  });
  const pi = (upd: ((p:string[])=>string[])|string[]) => p.setImageFavorites((prev: string[])=>{
    const next = typeof upd === "function" ? upd(prev) : upd;
    p.saveSetting("app.emoji_image_favorites",JSON.stringify(next)); return next;
  });

  const cn = (url: string) => invoke("copy_to_clipboard",{content:url,contentType:url.startsWith("data:image")?"image":"text",paste:true,id:0,deleteAfterUse:false,moveToTop:false}).catch(console.error);
  const hIU = (e: React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>((upd:string[])=>pi(upd))([...p.imageFavorites,r.result as string]); r.readAsDataURL(f); e.target.value=''; };

  useEffect(()=>{if(!ctxTag)return;const h=(e:MouseEvent)=>{if(ctxRef.current&&ctxRef.current.contains(e.target as Node))return;setCtxTag(null)};document.addEventListener('click',h);return ()=>document.removeEventListener('click',h)},[ctxTag]);
  useEffect(()=>{if(showAdd&&addInputRef.current)setTimeout(()=>addInputRef.current?.focus(),50)},[showAdd]);

  const items = p.activeTab==="favorites"?p.emojiFavorites:p.imageFavorites;
  const persist = p.activeTab==="favorites"?pk:pi;

  const onPtrDown = (e: React.PointerEvent, idx: number, tab: string) => {
    if(e.button!==0)return;
    const s = ds.current; s.idx=idx; s.tab=tab; s.startX=e.clientX; s.startY=e.clientY; s.active=false;
    const el=e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId);

    const computeDrop = (mx: number, my: number) => {
      const bar = containerRef.current; if(!bar) return;
      const rect = bar.getBoundingClientRect();
      const rx = mx - rect.left, ry = my - rect.top;
      const children = bar.querySelectorAll('[data-emoji-idx]');
      if (children.length <= 1) return;

      type Pos = { idx:number; left:number; right:number; top:number; bottom:number; };
      const all: Pos[] = [];
      for (let i = 0; i < children.length; i++) {
        const r = (children[i] as HTMLElement).getBoundingClientRect();
        all.push({ idx: i, left: r.left - rect.left, right: r.right - rect.left, top: r.top - rect.top, bottom: r.bottom - rect.top });
      }

      // Group into rows by Y overlap
      const rows: { items: Pos[]; top: number; bottom: number }[] = [];
      for (const p of all) {
        let placed = false;
        for (const row of rows) {
          if (p.top <= row.bottom && p.bottom >= row.top) {
            row.items.push(p);
            row.top = Math.min(row.top, p.top);
            row.bottom = Math.max(row.bottom, p.bottom);
            placed = true;
            break;
          }
        }
        if (!placed) rows.push({ items: [p], top: p.top, bottom: p.bottom });
      }
      for (const row of rows) row.items.sort((a, b) => a.left - b.left);

      // Find closest row to mouse Y
      let tRow = rows[0], minD = Infinity;
      for (const row of rows) {
        const d = ry < row.top ? row.top - ry : ry > row.bottom ? ry - row.bottom : 0;
        if (d < minD) { tRow = row; minD = d; }
      }

      const rItems = tRow.items;
      let insIdx: number, indX = 0;

      if (rx < rItems[0].left - gapPx / 2) {
        insIdx = rItems[0].idx; indX = rItems[0].left - gapPx / 2;
      } else if (rx > rItems[rItems.length - 1].right + gapPx / 2) {
        insIdx = rItems[rItems.length - 1].idx + 1;
        indX = rItems[rItems.length - 1].right + gapPx / 2;
      } else {
        insIdx = -1;
        for (let i = 0; i < rItems.length; i++) {
          const it = rItems[i];
          if (rx >= it.left && rx <= it.right) {
            if (rx < it.left + (it.right - it.left) / 2) {
              insIdx = it.idx; indX = it.left;
            } else {
              insIdx = it.idx + 1; indX = it.right;
            }
            break;
          }
          if (i < rItems.length - 1) {
            const nxt = rItems[i + 1];
            if (rx > it.right && rx < nxt.left) {
              insIdx = nxt.idx; indX = (it.right + nxt.left) / 2;
              break;
            }
          }
        }
        if (insIdx < 0) { insIdx = rItems[0].idx; indX = rItems[0].left; }
      }

      let splIdx = insIdx;
      if (splIdx > s.idx) splIdx--;
      const noChange = (splIdx === s.idx);

      const rowH = tRow.bottom - tRow.top;
      setIndStyle({
        position: 'absolute', width: '2px', height: `${rowH}px`,
        top: `${tRow.top}px`, left: `${indX}px`,
        background: 'var(--accent-color)', borderRadius: '1px',
        pointerEvents: 'none', zIndex: 99,
        boxShadow: '0 0 6px rgba(44,107,255,0.3)',
        display: noChange ? 'none' : 'block',
      });
      setTi(noChange ? -1 : insIdx);
      s._splIdx = splIdx;
    };

    const onMove=(ev:PointerEvent)=>{
      if(!s.active&&(Math.abs(ev.clientX-s.startX)>6||Math.abs(ev.clientY-s.startY)>6)){s.active=true;setDi(idx)}
      if(s.active) computeDrop(ev.clientX, ev.clientY);
    };
    const onUp=()=>{el.releasePointerCapture(e.pointerId);document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);
      const splIdx = s._splIdx;
      if(s.active && typeof splIdx === 'number' && splIdx >= 0 && splIdx !== s.idx)
        persist((prev:string[])=>{const r=[...prev];const[m]=r.splice(s.idx,1);r.splice(splIdx,0,m);return r});
      s.active=false;setDi(-1);setTi(-1);setIndStyle({});
    };
    document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',onUp);
  };

  return (<div className="emoji-panel" style={{padding:"8px"}}>
    <div className="emoji-tabs">
      <button className={`emoji-tab ${p.activeTab==="favorites"?"active":""}`} onClick={()=>{p.setActiveTab("favorites");p.saveSetting("app.emoji_panel_tab","favorites")}}><span className="emoji-tab-text">颜文字</span></button>
      <button className={`emoji-tab ${p.activeTab==="emoji"?"active":""}`} onClick={()=>{p.setActiveTab("emoji");p.saveSetting("app.emoji_panel_tab","emoji")}}><span className="emoji-tab-text">图片</span></button>
    </div>
    <div ref={containerRef} style={{display:"flex",flexWrap:"wrap",gap:"6px",padding:"8px 0",alignItems:"flex-start",position:"relative"}}>
      {p.activeTab==="favorites"?items.map((text,idx)=>{
        const isDrag=di===idx; const isDrop=ti===idx;
        return (<span key={`k-${idx}`} data-emoji-idx={idx} style={{position:'relative',display:'inline-block'}}>
          <span onPointerDown={e=>onPtrDown(e,idx,'favorites')} onClick={()=>{if(!ds.current.active)cn(text)}}
            onContextMenu={e=>{e.preventDefault();setCtxTag({idx,tab:'favorites'})}}
            style={{display:"inline-block",padding:"4px 8px",fontSize:"13px",lineHeight:"1.4",cursor:"default",border:"1px solid var(--border-color)",borderRadius:"8px",background:"var(--bg-element)",color:"var(--text-primary)",whiteSpace:"nowrap",userSelect:"none",touchAction:"none",opacity:isDrag?0.35:1,outline:isDrop?'2px solid var(--accent-color)':'none',transition:'opacity 0.15s'}}>{text}</span>
          {ctxTag?.idx===idx&&ctxTag?.tab==='favorites'&&<span ref={ctxRef} onClick={e=>{e.stopPropagation();pk((prev:string[])=>prev.filter((_,i)=>i!==idx)as any);setCtxTag(null)}}
            style={{position:'absolute',right:'-8px',top:'-8px',width:'18px',height:'18px',borderRadius:'50%',background:'#ef4444',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'11px',fontWeight:'bold',lineHeight:1,zIndex:10,boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}>✕</span>}
        </span>);
      }):items.map((dataUrl,idx)=>{
        const isDrag=di===idx; const isDrop=ti===idx;
        return (<div key={`img-${idx}`} data-emoji-idx={idx} style={{position:'relative'}}>
          <div onPointerDown={e=>onPtrDown(e,idx,'emoji')} onClick={()=>{if(!ds.current.active)cn(dataUrl)}}
            onContextMenu={e=>{e.preventDefault();setCtxTag({idx,tab:'emoji'})}}
            style={{width:"56px",height:"56px",borderRadius:"8px",overflow:"hidden",border:"1px solid var(--border-color)",cursor:"default",touchAction:"none",opacity:isDrag?0.35:1,outline:isDrop?'2px solid var(--accent-color)':'none',outlineOffset:'2px',transition:'opacity 0.15s',flexShrink:0}}>
            <img src={dataUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",pointerEvents:"none"}}/></div>
          {ctxTag?.idx===idx&&ctxTag?.tab==='emoji'&&<span ref={ctxRef} onClick={e=>{e.stopPropagation();pi((prev:string[])=>prev.filter((_,i)=>i!==idx)as any);setCtxTag(null)}}
            style={{position:'absolute',right:'-4px',top:'-4px',width:'18px',height:'18px',borderRadius:'50%',background:'#ef4444',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'11px',fontWeight:'bold',lineHeight:1,zIndex:10,boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}>✕</span>}
        </div>);
      })}
      {p.activeTab==="favorites"?<button onClick={()=>{setShowAdd(true);setNewText("")}} style={{padding:"4px 8px",fontSize:"16px",cursor:"pointer",border:"1px dashed var(--border-color)",borderRadius:"8px",background:"transparent",color:"var(--text-secondary)",minWidth:"32px",display:"flex",alignItems:"center",justifyContent:"center"}} title="添加颜文字"><Plus size={14}/></button>
      :<><div onClick={()=>fileInputRef.current?.click()} style={{width:"56px",height:"56px",borderRadius:"8px",border:"1px dashed var(--border-color)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)",flexShrink:0}} title="上传图片"><Plus size={18}/></div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={hIU}/></>}
      {/* Drop indicator */}
      <div style={indStyle}/>
    </div>

    {showAdd&&<div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)"}} onClick={()=>setShowAdd(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg-secondary)",borderRadius:"12px",padding:"20px",width:"300px",maxWidth:"90vw",border:"1px solid var(--border-color)",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
        <h4 style={{margin:"0 0 14px 0",fontSize:"14px",color:"var(--text-primary)",fontWeight:600}}>添加颜文字</h4>
        <input ref={addInputRef} value={newText} onChange={e=>setNewText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){const t=newText.trim();if(t){pk((prev:string[])=>[...prev,t]);setNewText("");setShowAdd(false)}}}} placeholder="例: (◕‿◕) ✨"
          style={{width:"100%",padding:"8px 10px",borderRadius:"8px",border:"1px solid var(--border-color)",background:"var(--bg-element)",color:"var(--text-primary)",fontSize:"14px",boxSizing:"border-box",outline:"none"}}/>
        <div style={{display:"flex",gap:"8px",marginTop:"14px",justifyContent:"flex-end"}}>
          <button onClick={()=>setShowAdd(false)} style={{padding:"7px 16px",borderRadius:"8px",border:"1px solid var(--border-color)",background:"transparent",color:"var(--text-secondary)",cursor:"pointer",fontSize:"13px"}}>取消</button>
          <button onClick={()=>{const t=newText.trim();if(t){pk((prev:string[])=>[...prev,t]);setNewText("");setShowAdd(false)}}} style={{padding:"7px 16px",borderRadius:"8px",border:"none",background:"var(--accent-color)",color:"#fff",cursor:"pointer",fontSize:"13px",fontWeight:600}}>添加</button>
        </div>
      </div>
    </div>}
  </div>);
};

export default EmojiPanel;
