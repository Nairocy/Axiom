import type { RefObject } from "react";
import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Pin, PinOff, Trash2, Smile, Settings as SettingsIcon, MessageSquare, X, Search, Plus } from "lucide-react";
import ColorPicker from "../../../shared/components/ColorPicker";

interface AppHeaderProps {
  t: (key: string) => string; showSettings: boolean; setShowSettings: (v: boolean) => void;
  showTagManager: boolean; setShowTagManager: (v: boolean) => void; tagManagerEnabled: boolean;
  showEmojiPanel: boolean; setShowEmojiPanel: (v: boolean) => void; emojiPanelEnabled: boolean;
  chatMode: boolean; fileServerEnabled: boolean;
  isWindowPinned: boolean; setIsWindowPinned: (v: boolean) => void; clearHistory: () => void;
  showSearchBox: boolean; search: string; setSearch: (v: string) => void; setIsComposing: (v: boolean) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  showTagFilter: boolean; setShowTagFilter: (v: boolean) => void;
  allTags: string[]; tagColors: Record<string, string>; setEditingTagsId: (v: number | null) => void;
  theme: string; colorMode: string; settingsTitle: string;
  typeFilter: string | null; setTypeFilter: (v: string | null) => void;
  tagFilter: string | null; setTagFilter: (v: string | null) => void;
  onBack: () => void; onToggleChat: () => void; pushToast: (msg: string, duration?: number) => number;
}

const AppHeader = (p: AppHeaderProps) => {
  void p.theme;
  const [sTA, sSTA] = useState(false);
  const [nTN, sNTN] = useState(""); const [nTC, sNTC] = useState("#3b82f6"); const [nTxtC, sNTxtC] = useState("#ffffff");
  const [eT, sET] = useState<string|null>(null); const [eN, sEN] = useState(""); const [eC, sEC] = useState("#3b82f6"); const [eTxtC, sETxtC] = useState("#ffffff");
  const [clrTab, sClrTab] = useState<'bg'|'text'>('bg'); // which color picker: bg or text
  const [txtColors, sTxtColors] = useState<Record<string,string>>(()=>{try{return JSON.parse(localStorage.getItem("axiom_tag_text_colors")||"{}");}catch{return {};}});
  const saveTxtColors = (m: Record<string,string>) => { sTxtColors(m); localStorage.setItem("axiom_tag_text_colors", JSON.stringify(m)); };
  const mIR = useRef<HTMLInputElement>(null);
  const [tO, sTO] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("axiom_tag_order")||"[]"); } catch { return []; } });
  const oT = (() => { const ex = new Set(p.allTags); const r: string[] = []; for (const t of tO) if (ex.has(t)) { r.push(t); ex.delete(t); } for (const t of p.allTags) if (ex.has(t)) { r.push(t); ex.delete(t); } return r; })();
  const sTOrd = (o: string[]) => { sTO(o); localStorage.setItem("axiom_tag_order", JSON.stringify(o)); };

  const hAT = () => { const n = nTN.trim(); if (!n) return; if (p.allTags.includes(n)) { p.pushToast("标签已存在",2000); return; } invoke("create_new_tag",{tagName:n}).then(()=>{invoke("set_tag_color",{name:n,color:nTC}).then(()=>{emit("tag-colors-updated").catch(()=>{});emit("clipboard-changed").catch(()=>{});}).catch(()=>{});}).catch(console.error); const m={...txtColors};m[n]=nTxtC;saveTxtColors(m); sNTN(""); sNTC("#3b82f6"); sNTxtC("#ffffff"); sClrTab('bg'); sSTA(false); p.pushToast("标签已添加",1500); };
  const hDT = (tn: string) => { if (p.tagFilter===tn) p.setTagFilter(null); invoke("delete_tag_from_all",{tagName:tn}).then(()=>{emit("clipboard-changed").catch(()=>{}); const m={...txtColors};delete m[tn];saveTxtColors(m);}).catch(console.error); };
  const hET = () => { const n = eN.trim(); if (!n||!eT) return; if (n!==eT) invoke("rename_tag_globally",{oldName:eT,newName:n}).then(()=>{if(p.tagFilter===eT)p.setTagFilter(n);}).catch(console.error); invoke("set_tag_color",{name:n,color:eC}).then(()=>{emit("tag-colors-updated").catch(()=>{});emit("clipboard-changed").catch(()=>{});}).catch(()=>{}); const m={...txtColors}; if (n!==eT){delete m[eT];} m[n]=eTxtC; saveTxtColors(m); sET(null); };
  const sEd = (tag: string) => { sET(tag); sEN(tag); sEC(p.tagColors[tag]||"#3b82f6"); sETxtC(txtColors[tag]||"#ffffff"); sClrTab('bg'); };
  useEffect(() => { if (sTA && mIR.current) setTimeout(()=>mIR.current?.focus(),50); }, [sTA]);

  // Right-click delete button
  const [cMT, sCMT] = useState<string|null>(null);
  const cBR = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (!cMT) return; const h = (e: MouseEvent) => { if (cBR.current&&cBR.current.contains(e.target as Node)) return; sCMT(null); }; document.addEventListener('click',h); return ()=>document.removeEventListener('click',h); }, [cMT]);

  // === Pointer-based drag for tags (multi-row aware) ===
  const dragState = useRef({ active: false, idx: -1, startX: 0, startY: 0, _splIdx: -1 as number });
  const [dragIdx, setDragIdx] = useState(-1);
  const [dropIdx, setDropIdx] = useState(-1);
  const [indStyle, setIndStyle] = useState<React.CSSProperties>({});
  const barRef = useRef<HTMLDivElement>(null);
  const gapPx = 4; // matches CSS gap:'4px'

  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    // Ignore clicks on the delete (red X) button
    const target = e.target as HTMLElement;
    if (target.closest?.('[data-tag-delete]')) return;
    dragState.current = { active: false, idx, startX: e.clientX, startY: e.clientY, _splIdx: -1 };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const computeDrop = (mx: number, my: number) => {
      const bar = barRef.current; if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const rx = mx - rect.left, ry = my - rect.top;
      const children = bar.querySelectorAll('[data-tag-idx]');
      if (children.length === 0) return;

      // Gather positions relative to bar
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
      // Determine insertIdx (in original array) & indicator X
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
          // Mouse within this item's X range → decide left half or right half
          if (rx >= it.left && rx <= it.right) {
            if (rx < it.left + (it.right - it.left) / 2) {
              insIdx = it.idx; indX = it.left;
            } else {
              insIdx = it.idx + 1; indX = it.right;
            }
            break;
          }
          // Gap between items
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

      // Map insertIdx → spliceIdx (after removing dragged item)
      let splIdx = insIdx;
      if (splIdx > dragState.current.idx) splIdx--;
      const noChange = (splIdx === dragState.current.idx);

      // Set indicator position relative to bar
      const rowH = tRow.bottom - tRow.top;
      setIndStyle({
        position: 'absolute',
        width: '2px',
        height: `${rowH}px`,
        top: `${tRow.top}px`,
        left: `${indX}px`,
        background: 'var(--accent-color)',
        borderRadius: '1px',
        pointerEvents: 'none',
        zIndex: 99,
        boxShadow: '0 0 6px rgba(44,107,255,0.3)',
        display: noChange ? 'none' : 'block',
      });
      setDropIdx(noChange ? -1 : insIdx);
      dragState.current._splIdx = splIdx;
    };

    const onMove = (ev: PointerEvent) => {
      if (!dragState.current.active && (Math.abs(ev.clientX - dragState.current.startX) > 6 || Math.abs(ev.clientY - dragState.current.startY) > 6)) {
        dragState.current.active = true;
        setDragIdx(dragState.current.idx);
      }
      if (dragState.current.active) computeDrop(ev.clientX, ev.clientY);
    };

    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const splIdx = dragState.current._splIdx;
      if (dragState.current.active && typeof splIdx === 'number' && splIdx >= 0 && splIdx !== dragState.current.idx) {
        const r = [...oT]; const [m] = r.splice(dragState.current.idx, 1);
        r.splice(splIdx, 0, m); sTOrd(r);
      }
      dragState.current.active = false; dragState.current.idx = -1;
      setDragIdx(-1); setDropIdx(-1); setIndStyle({});
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const fB = (a: boolean): React.CSSProperties => ({ padding:'2px 6px', fontSize:'11px', borderRadius:'4px', whiteSpace:'nowrap', opacity:a?1:0.6, cursor:'default', userSelect:'none', fontWeight:a?600:400 });

  return (<header className="window-drag-region">
    <div className="header-top">
      <div className="header-leading">
        {(p.showSettings||p.showTagManager||p.showEmojiPanel)&&<button className="btn-icon window-no-drag" onClick={p.onBack}><ChevronLeft size={18}/></button>}
        <div className="header-drag-region" data-tauri-drag-region><span className="header-title">{p.showEmojiPanel?'表情包':p.showSettings?p.settingsTitle:p.t('app_name')}</span></div>
      </div>
      <div className="header-actions window-no-drag">
        <button className={`btn-icon ${p.isWindowPinned?'active':''}`} title={p.t('pin')} onClick={()=>{const n=!p.isWindowPinned;p.setIsWindowPinned(n);invoke("set_window_pinned",{pinned:n}).catch(console.error)}}>{p.isWindowPinned?<PinOff size={16}/>:<Pin size={16}/>}</button>
        {!p.showSettings&&!p.showTagManager&&!p.showEmojiPanel&&(<>
          <button className="btn-icon" title={p.t('clear_history')} onClick={p.clearHistory}><Trash2 size={16}/></button>
          {p.emojiPanelEnabled&&<button className="btn-icon" title="表情包" onClick={()=>p.setShowEmojiPanel(true)}><Smile size={16}/></button>}
          <button className="btn-icon" title={p.t('settings')} onClick={()=>p.setShowSettings(true)}><SettingsIcon size={16}/></button>
        </>)}
        {p.fileServerEnabled&&<button className={`btn-icon header-chat-btn ${p.chatMode&&p.showSettings?'active':''}`} title="Chat" onClick={p.onToggleChat}><MessageSquare size={16}/></button>}
        <button className="btn-icon" title={p.t('hide')} onClick={async()=>{invoke("hide_window_cmd").catch(console.error)}}><X size={16}/></button>
      </div>
    </div>

    {!p.showSettings&&!p.showTagManager&&!p.showEmojiPanel&&(<AnimatePresence>{(p.showSearchBox||p.search.trim().length>0)&&(
      <motion.div initial={{height:0,opacity:0,overflow:'hidden'}} animate={{height:"auto",opacity:1,transitionEnd:{overflow:"visible"}}} exit={{height:0,opacity:0,overflow:'hidden'}} transition={{duration:0.2,ease:"circOut"}} style={{flexShrink:0}}>
        <div className="search-container window-no-drag" style={{gap:'4px'}}>
          <div style={{position:'relative',flex:1}}>
            <Search size={14} className="search-icon"/>
            <input ref={p.searchInputRef} type="text" className={`search-input ${p.showTagFilter&&p.allTags.length>0?'dropdown-open':''}`}
              placeholder={p.t('search_placeholder')} value={p.search} onCompositionStart={()=>p.setIsComposing(true)}
              onCompositionEnd={(e)=>{p.setIsComposing(false);p.setSearch((e.target as HTMLInputElement).value)}} onChange={(e)=>p.setSearch(e.target.value)}
              onMouseDown={()=>invoke("activate_window_focus").catch(console.error)} onClick={()=>{p.setShowTagFilter(true);p.setEditingTagsId(null)}}
              onFocus={()=>{invoke("activate_window_focus").catch(console.error);p.setShowTagFilter(true);p.setEditingTagsId(null)}} onBlur={()=>{setTimeout(()=>p.setShowTagFilter(false),200)}}
              style={{color:p.colorMode==='dark'?'#fff':undefined}}/>
          </div>
          <div ref={barRef} style={{display:'inline-flex',gap:'4px',flexWrap:'wrap',alignItems:'center',flexShrink:0,position:'relative'}}>
            {['text','image'].map(t=>(<button key={t} className={p.typeFilter===t?'btn-icon active':'btn-icon'} onClick={()=>p.setTypeFilter(p.typeFilter===t?null:t)} style={fB(p.typeFilter===t)}>{t==='image'?'图片':'文本'}</button>))}
            {oT.map((tag,idx)=>{
              const active=p.tagFilter===tag; const isDrag=dragIdx===idx;
              return (<span key={tag} data-tag-idx={idx}
                onPointerDown={(e)=>onPointerDown(e,idx)}
                onClick={()=>{if(!dragState.current.active)p.setTagFilter(active?null:tag);}}
                onContextMenu={(e)=>{e.preventDefault();sCMT(tag);}}
                className={active?'btn-icon active':'btn-icon'}
                style={{...fB(active),display:'inline-block',position:'relative',touchAction:'none',opacity:isDrag?0.35:(active?1:0.6),transition:'opacity 0.15s',userSelect:'none'}}>
                {tag}{cMT===tag&&<span ref={cBR} data-tag-delete onPointerDown={e=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();e.preventDefault();hDT(tag);sCMT(null)}}
                  style={{position:'absolute',right:'-10px',top:'-10px',width:'18px',height:'18px',borderRadius:'50%',background:'#ef4444',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'11px',fontWeight:'bold',lineHeight:1,zIndex:10,boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}>✕</span>}
                </span>);
            })}
            <button onClick={()=>{sSTA(true);sNTN("");sNTC("#3b82f6");sNTxtC("#ffffff");sClrTab('bg');sET(null)}} style={{padding:'2px 6px',fontSize:'13px',cursor:'pointer',border:'1px dashed var(--border-color)',borderRadius:'4px',background:'transparent',color:'var(--text-secondary)',display:'inline-flex',alignItems:'center',justifyContent:'center',opacity:0.6}} title="添加标签"><Plus size={12}/></button>
            {/* Drop indicator */}
            {dropIdx>=0&&<div style={indStyle}/>}
          </div>
        </div>
      </motion.div>
    )}</AnimatePresence>)}

    {sTA&&<div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.4)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)'}} onClick={()=>{sSTA(false);sET(null)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-secondary)',borderRadius:'12px',padding:'20px',width:'480px',maxWidth:'95vw',maxHeight:'85vh',border:'1px solid var(--border-color)',boxShadow:'0 12px 48px rgba(0,0,0,0.4)',display:'flex',gap:'16px',overflow:'hidden'}}>
        <div style={{flex:1,overflowY:'auto',maxHeight:'65vh'}}>
          <h4 style={{margin:'0 0 10px 0',fontSize:'13px',color:'var(--text-secondary)',fontWeight:600}}>已有标签</h4>
          {p.allTags.length===0?<div style={{fontSize:'12px',color:'var(--text-muted)',padding:'8px 0'}}>暂无标签</div>
          :<div style={{display:'flex',flexDirection:'column',gap:'4px'}}>{p.allTags.map(tag=>{const bg=p.tagColors[tag]||'var(--accent-color)';return(
            <div key={tag} style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 8px',borderRadius:'8px',background:'var(--bg-element)'}}>
              <span style={{width:'10px',height:'10px',borderRadius:'50%',background:bg,flexShrink:0}}/>
              <span style={{flex:1,fontSize:'12px',color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tag}</span>
              <button onClick={()=>sEd(tag)} style={{border:'none',background:'transparent',color:'var(--accent-color)',cursor:'pointer',fontSize:'11px',padding:'2px 4px'}}>编辑</button>
              <button onClick={()=>hDT(tag)} style={{border:'none',background:'transparent',color:'#ef4444',cursor:'pointer',fontSize:'11px',padding:'2px 4px'}}>删除</button>
            </div>);})}</div>}
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:'10px'}}>
          {eT?<><h4 style={{margin:0,fontSize:'14px',color:'var(--text-primary)',fontWeight:600}}>编辑标签</h4>
            <input ref={mIR} value={eN} onChange={e=>sEN(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')hET();if(e.key==='Escape')sET(null)}}
              style={{width:'100%',padding:'8px 10px',borderRadius:'8px',border:'1px solid var(--border-color)',background:'var(--bg-element)',color:'var(--text-primary)',fontSize:'13px',boxSizing:'border-box',outline:'none'}}/>
            {/* Tag preview */}
            {eN.trim()&&<div style={{padding:'6px 10px',borderRadius:'6px',background:eC,color:eTxtC,fontSize:'12px',fontWeight:600,textAlign:'center',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',border:'1px solid var(--border-color)'}}>{eN.trim()}</div>}
            {/* Color mode toggle */}
            <div style={{display:'flex',gap:'4px'}}>
              <button onClick={()=>sClrTab('bg')} style={{flex:1,padding:'5px 8px',borderRadius:'6px',border:clrTab==='bg'?'2px solid var(--accent-color)':'1px solid var(--border-color)',background:clrTab==='bg'?'var(--bg-element)':'transparent',color:'var(--text-primary)',cursor:'pointer',fontSize:'12px',fontWeight:clrTab==='bg'?600:400}}>背景</button>
              <button onClick={()=>sClrTab('text')} style={{flex:1,padding:'5px 8px',borderRadius:'6px',border:clrTab==='text'?'2px solid var(--accent-color)':'1px solid var(--border-color)',background:clrTab==='text'?'var(--bg-element)':'transparent',color:'var(--text-primary)',cursor:'pointer',fontSize:'12px',fontWeight:clrTab==='text'?600:400}}>文字</button>
            </div>
            <ColorPicker value={clrTab==='bg'?eC:eTxtC} onChange={clrTab==='bg'?sEC:sETxtC}/>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>sET(null)} style={{flex:1,padding:'8px',borderRadius:'8px',border:'1px solid var(--border-color)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',fontSize:'13px'}}>取消</button>
              <button onClick={hET} style={{flex:1,padding:'8px',borderRadius:'8px',border:'none',background:'var(--accent-color)',color:'#fff',cursor:'pointer',fontSize:'13px',fontWeight:600}}>保存</button>
            </div></>
          :<><h4 style={{margin:0,fontSize:'14px',color:'var(--text-primary)',fontWeight:600}}>新建标签</h4>
            <input ref={mIR} value={nTN} onChange={e=>sNTN(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')hAT()}} placeholder="输入标签名称..."
              style={{width:'100%',padding:'8px 10px',borderRadius:'8px',border:'1px solid var(--border-color)',background:'var(--bg-element)',color:'var(--text-primary)',fontSize:'13px',boxSizing:'border-box',outline:'none'}}/>
            {/* Tag preview */}
            {nTN.trim()&&<div style={{padding:'6px 10px',borderRadius:'6px',background:nTC,color:nTxtC,fontSize:'12px',fontWeight:600,textAlign:'center',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',border:'1px solid var(--border-color)'}}>{nTN.trim()}</div>}
            {/* Color mode toggle */}
            <div style={{display:'flex',gap:'4px'}}>
              <button onClick={()=>sClrTab('bg')} style={{flex:1,padding:'5px 8px',borderRadius:'6px',border:clrTab==='bg'?'2px solid var(--accent-color)':'1px solid var(--border-color)',background:clrTab==='bg'?'var(--bg-element)':'transparent',color:'var(--text-primary)',cursor:'pointer',fontSize:'12px',fontWeight:clrTab==='bg'?600:400}}>背景</button>
              <button onClick={()=>sClrTab('text')} style={{flex:1,padding:'5px 8px',borderRadius:'6px',border:clrTab==='text'?'2px solid var(--accent-color)':'1px solid var(--border-color)',background:clrTab==='text'?'var(--bg-element)':'transparent',color:'var(--text-primary)',cursor:'pointer',fontSize:'12px',fontWeight:clrTab==='text'?600:400}}>文字</button>
            </div>
            <ColorPicker value={clrTab==='bg'?nTC:nTxtC} onChange={clrTab==='bg'?sNTC:sNTxtC}/>
            <button onClick={hAT} style={{padding:'8px',borderRadius:'8px',border:'none',background:'var(--accent-color)',color:'#fff',cursor:'pointer',fontSize:'13px',fontWeight:600,width:'100%',marginTop:'4px'}}>添加</button></>}
        </div>
      </div>
    </div>}
  </header>);
};

export default AppHeader;
