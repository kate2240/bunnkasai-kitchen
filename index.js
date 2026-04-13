import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

// ── Supabase 初期設定 ─────────────────────────────────────
// ★下の2行をご自身のSupabaseのURLとキーに書き換えてください
const supabaseUrl = "https://ylbkbwrurxndlebigyyb.supabase.co"; 
const supabaseKey = "sb_publishable_PtSgQKOp6xG-945xmJ5ccA_ZpXmjvn6"; 
const supabase = createClient(supabaseUrl, supabaseKey);

// ── マスタデータ ──────────────────────────────────────
const DRINKS = [
  { id:"d1", name:"レモネード",     emoji:"🍋", price:200, stock:400, note:"※スライスレモンが乗っています！🍀" },
  { id:"d2", name:"リンゴジュース", emoji:"🍎", price:170, stock:200 },
  { id:"d3", name:"アイスティー",   emoji:"🥤", price:170, stock:250 },
];
const TOPPINGS = [
  { id:"t1", name:"いちごソース",   emoji:"🍓", price:30 },
  { id:"t2", name:"チョコソース",   emoji:"🍫", price:30 },
  { id:"t3", name:"ミックスベリー", emoji:"🫐", price:30 },
];
const WAFFLE_PRICE      = 250;
const SET_BASE          = 450;
const WAFFLE_STOCK_INIT = 864;
const newWaffle = () => ({ toppings:[] });

const sc          = s => s==="受付中"?"#f59e0b":s==="準備中"?"#e879a0":"#10b981";
const freeTopCount = did => (!did||did==="d1") ? 1 : 2;
const wafflePrice  = (w,type,did) =>
  type==="set"
    ? SET_BASE + Math.max(0,w.toppings.length-freeTopCount(did))*30
    : WAFFLE_PRICE + w.toppings.reduce((s,t)=>s+t.price,0);

export default function App() {
  const [wStock, setWStock] = useState(WAFFLE_STOCK_INIT);
  const [dStock, setDStock] = useState(Object.fromEntries(DRINKS.map(d=>[d.id,d.stock])));
  const [step,     setStep]     = useState("type");
  const [oType,    setOType]    = useState(null);
  const [qty,      setQty]      = useState(1);
  const [drink,    setDrink]    = useState(null);
  const [waffles,  setWaffles]  = useState([]);
  const [editIdx,  setEditIdx]  = useState(0);
  const [cart,     setCart]     = useState([]);
  const [tableNum, setTableNum] = useState("");
  const [view,     setView]     = useState("order");
  const [orders,   setOrders]   = useState([]);
  const [notif,    setNotif]    = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput,  setPwInput]  = useState("");

  // ── Supabase データ取得とリアルタイム監視 ──────────────────────
  useEffect(() => {
    const fetchData = async () => {
      // 1. 注文の取得
      const { data: ords } = await supabase.from('orders').select('*').order('id', { ascending: false });
      if (ords) setOrders(ords);

      // 2. 在庫の取得
      const { data: inv } = await supabase.from('inventory').select('*');
      if (inv) {
        let newWStock = WAFFLE_STOCK_INIT;
        let newDStock = { ...dStock };
        inv.forEach(item => {
          if (item.id === 'waffle') newWStock = item.stock;
          else newDStock[item.id] = item.stock;
        });
        setWStock(newWStock);
        setDStock(newDStock);
      }
    };

    fetchData(); // 初回読み込み

    // 変更があった時だけ自動で fetch を再実行する（ポーリングの代わり！）
    const channel = supabase.channel('realtime-db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchData)
      .subscribe();

    return () => supabase.removeChannel(channel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showNotif = (msg,type="ok") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),2500); };
  
  // 在庫をSupabaseに保存する関数
  const saveStock = async (w, d) => {
    const updates = [{ id: 'waffle', stock: w }];
    Object.entries(d).forEach(([k, v]) => updates.push({ id: k, stock: v }));
    await supabase.from('inventory').upsert(updates);
  };

  const reset = () => { setStep("type");setOType(null);setQty(1);setDrink(null);setWaffles([]);setEditIdx(0); };
  const pickType = t => { setOType(t);setQty(1);setDrink(null);setWaffles([]);setEditIdx(0);setStep("qty"); };
  const confirmQty = () => {
    if(oType==="drink"){setStep("drink");return;}
    setWaffles(Array.from({length:qty},newWaffle)); setEditIdx(0);
    setStep(oType==="set"?"drink":"toppings");
  };
  const confirmDrink = () => {
    if(!drink){showNotif("ドリンクを選んでください","err");return;}
    if(oType==="drink"){setStep("confirm");return;}
    setWaffles(Array.from({length:qty},newWaffle)); setEditIdx(0); setStep("toppings");
  };

  const addTop = tid => setWaffles(p=>p.map((w,i)=>i!==editIdx?w:{...w,toppings:[...w.toppings,TOPPINGS.find(t=>t.id===tid)]}));
  const remTop = tid => setWaffles(p=>p.map((w,i)=>{
    if(i!==editIdx)return w;
    const a=[...w.toppings]; a.splice(a.map(t=>t.id).lastIndexOf(tid),1); return {...w,toppings:a};
  }));
  const topCnt = tid => waffles[editIdx]?.toppings.filter(t=>t.id===tid).length??0;
  const clrTop = () => setWaffles(p=>p.map((w,i)=>i===editIdx?{...w,toppings:[]}:w));

  const drinkPrice = () => DRINKS.find(d=>d.id===drink)?.price??0;
  const orderTotal = () => oType==="drink"?drinkPrice()*qty:waffles.reduce((s,w)=>s+wafflePrice(w,oType,drink),0);

  const addToCart = () => {
    const drObj=drink?DRINKS.find(d=>d.id===drink):null;
    setCart(p=>[...p,{
      id:Date.now(),type:oType,drink:drObj,qty,
      waffles:oType==="drink"?[...waffles]:[...waffles],
      unitPrices:oType==="drink"?Array(qty).fill(drinkPrice()):waffles.map(w=>wafflePrice(w,oType,drink)),
      total:orderTotal(),
    }]);
    reset(); showNotif("カートに追加しました 🧇");
  };
  const remCart   = id => setCart(p=>p.filter(i=>i.id!==id));
  const cartTotal = cart.reduce((s,i)=>s+i.total,0);

  // 注文送信の処理（Supabase対応）
  const submitOrder = async () => {
    if(!cart.length){showNotif("商品を選んでください","err");return;}
    
    // 1. まずUI上の在庫を計算して減らす
    let wd=0,dd={};
    cart.forEach(item=>{
      if(item.type==="waffle"||item.type==="set") wd+=item.qty;
      if(item.drink) dd[item.drink.id]=(dd[item.drink.id]||0)+item.qty;
    });
    const nw=Math.max(0,wStock-wd); const nd={...dStock};
    Object.entries(dd).forEach(([id,n])=>{nd[id]=Math.max(0,nd[id]-n);});
    setWStock(nw); setDStock(nd); 
    
    // 2. 注文データを送信 (IDはDBが自動で連番を作ってくれます)
    const { data } = await supabase.from('orders').insert([{
      tableNum: tableNum || "未設定",
      items: cart,
      total: cartTotal,
      time: new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}),
      status: "受付中"
    }]).select(); // 追加したデータをすぐ取得する

    // 3. 減らした在庫をDBに保存
    await saveStock(nw, nd);

    setCart([]); setTableNum(""); reset();
    
    // 連番のIDを通知で表示
    const newId = data?.[0]?.id || "新規";
    showNotif(`注文 #${newId} を送信しました！`);
  };

  // ステータス変更（Supabase対応）
  const changeStatus = async (id, status) => { 
    setOrders(p => p.map(o => o.id === id ? { ...o, status } : o)); // UIを即反映
    await supabase.from('orders').update({ status }).eq('id', id); 
  };

  // 注文削除（Supabase対応）
  const deleteOrder = async o => {
    if(!window.confirm(`注文 #${o.id} を削除しますか？\n在庫も元に戻ります。`))return;
    
    await supabase.from('orders').delete().eq('id', o.id);
    
    // 在庫を戻す処理
    let wd=0,dd={};
    (o.items||[]).forEach(item=>{
      if(item.type==="waffle"||item.type==="set") wd+=item.qty;
      if(item.drink) dd[item.drink.id]=(dd[item.drink.id]||0)+item.qty;
    });
    const nw=wStock+wd; const nd={...dStock};
    Object.entries(dd).forEach(([id,n])=>{nd[id]=(nd[id]||0)+n;});
    
    setWStock(nw); setDStock(nd); 
    await saveStock(nw, nd);
    
    showNotif(`注文 #${o.id} を削除しました`);
  };

  const drinkObj   = drink?DRINKS.find(d=>d.id===drink):null;
  const freeCnt    = freeTopCount(drink);
  const stepNames  = oType==="set"?["商品","個数","ドリンク","トッピング","確認"]:oType==="drink"?["商品","個数","ドリンク","確認"]:["商品","個数","トッピング","確認"];
  const stepIdx    = {type:0,qty:1,drink:2,toppings:oType==="set"?3:2,confirm:stepNames.length-1}[step]??0;

  return (
    <div style={{fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",background:"#fff8f9",minHeight:"100vh",color:"#2d1a22"}}>
      <link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700;900&display=swap" rel="stylesheet"/>
      <header style={{background:"linear-gradient(135deg,#e8457a,#f472a8)",padding:"0 16px",boxShadow:"0 4px 20px rgba(232,69,122,0.35)",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:560,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:26}}>🧇</span>
            <div>
              <div style={{color:"white",fontWeight:900,fontSize:17}}>ワッフルショップ</div>
              <div style={{color:"rgba(255,255,255,0.8)",fontSize:11}}>文化祭オーダーシステム</div>
            </div>
          </div>
          {cart.length>0&&<div style={{background:"white",color:"#e8457a",borderRadius:20,padding:"4px 12px",fontWeight:700,fontSize:13}}>カート ¥{cartTotal.toLocaleString()}</div>}
        </div>
      </header>

      {notif&&<div style={{position:"fixed",top:66,left:"50%",transform:"translateX(-50%)",background:notif.type==="err"?"#ef4444":"#10b981",color:"white",padding:"10px 24px",borderRadius:24,fontWeight:700,zIndex:200,boxShadow:"0 4px 20px rgba(0,0,0,0.15)",fontSize:14,whiteSpace:"nowrap"}}>{notif.msg}</div>}

      <div style={{maxWidth:560,margin:"0 auto",padding:"0 12px 100px"}}>
        <div style={{display:"flex",gap:4,padding:"12px 0 8px",position:"sticky",top:58,background:"#fff8f9",zIndex:90}}>
          {[["order","🛒 注文"],["orders",`📋 注文一覧${orders.length>0?` (${orders.length})`:""}`],["stock","📦 在庫"]].map(([v,label])=>(
            <button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",background:view===v?"#e8457a":"#fde8ef",color:view===v?"white":"#8b4567",transition:"all 0.2s"}}>{label}</button>
          ))}
        </div>

        {/* ══ 注文 ══ */}
        {view==="order"&&(
          <div>
            {oType&&(
              <div style={{display:"flex",alignItems:"center",marginBottom:12,gap:4}}>
                {stepNames.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",flex:i<stepNames.length-1?1:"none"}}>
                    <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,flexShrink:0,background:i<=stepIdx?"#e8457a":"#fde8ef",color:i<=stepIdx?"white":"#ccc"}}>{i<stepIdx?"✓":i+1}</div>
                    <div style={{fontSize:10,color:i===stepIdx?"#e8457a":"#aaa",fontWeight:i===stepIdx?700:400,marginLeft:3,whiteSpace:"nowrap"}}>{s}</div>
                    {i<stepNames.length-1&&<div style={{flex:1,height:2,background:i<stepIdx?"#e8457a":"#fde8ef",marginLeft:4}}/>}
                  </div>
                ))}
              </div>
            )}

            {step==="type"&&(
              <div style={{background:"white",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 2px 12px rgba(232,69,122,0.08)"}}>
                <div style={{fontWeight:900,fontSize:16,marginBottom:4,color:"#e8457a"}}>何を注文しますか？</div>
                <div style={{fontSize:12,color:"#aaa",marginBottom:14}}>ワッフル単品 ¥250〜 ／ セット ¥450〜 ／ ドリンク単品</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div onClick={()=>{if(wStock>0)pickType("set");}} style={{borderRadius:14,padding:"18px 16px",cursor:wStock>0?"pointer":"not-allowed",border:"2.5px solid #fde8ef",background:"white",opacity:wStock>0?1:0.5,textAlign:"center",position:"relative"}}>
                    <div style={{position:"absolute",top:-8,right:-8,background:"#e8457a",color:"white",fontSize:10,fontWeight:900,borderRadius:10,padding:"2px 8px"}}>おトク！</div>
                    <div style={{fontSize:40}}>✨</div>
                    <div style={{fontWeight:700,fontSize:15,marginTop:4}}>ワッフルセット</div>
                    <div style={{color:"#e8457a",fontWeight:900,fontSize:18}}>¥450〜</div>
                    <div style={{fontSize:11,color:"#aaa"}}>ドリンク込み</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[{key:"waffle",emoji:"🧇",name:"ワッフル",price:"¥250〜",sub:"単品",dis:wStock<=0},{key:"drink",emoji:"🥤",name:"ドリンク",price:"¥170〜",sub:"単品",dis:false}].map(item=>(
                      <div key={item.key} onClick={()=>{if(!item.dis)pickType(item.key);}} style={{borderRadius:14,padding:16,cursor:item.dis?"not-allowed":"pointer",border:"2.5px solid #fde8ef",background:"white",opacity:item.dis?0.5:1,textAlign:"center"}}>
                        <div style={{fontSize:36}}>{item.emoji}</div>
                        <div style={{fontWeight:700,fontSize:14,marginTop:4}}>{item.name}</div>
                        <div style={{color:"#e8457a",fontWeight:900,fontSize:17}}>{item.price}</div>
                        <div style={{fontSize:11,color:"#aaa"}}>{item.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {wStock===0&&<div style={{textAlign:"center",color:"#ef4444",fontWeight:700,marginTop:8,fontSize:13}}>🚫 ワッフル売り切れ</div>}
                {wStock>0&&wStock<=20&&<div style={{textAlign:"center",color:"#ef4444",fontWeight:700,marginTop:8,fontSize:13}}>⚠️ ワッフル残り僅か</div>}
              </div>
            )}

            {step==="qty"&&(
              <div style={{background:"white",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 2px 12px rgba(232,69,122,0.08)"}}>
                <div style={{fontWeight:900,fontSize:16,marginBottom:16,color:"#e8457a"}}>{oType==="drink"?"🥤 ドリンク":oType==="set"?"✨ ワッフルセット":"🧇 ワッフル"} — 何個？</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:24,marginBottom:20}}>
                  <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{width:48,height:48,borderRadius:"50%",border:"none",background:"#fde8ef",cursor:"pointer",fontWeight:700,fontSize:24,color:"#e8457a"}}>−</button>
                  <span style={{fontSize:40,fontWeight:900,minWidth:50,textAlign:"center"}}>{qty}</span>
                  <button onClick={()=>setQty(q=>q+1)} style={{width:48,height:48,borderRadius:"50%",border:"none",background:"#e8457a",cursor:"pointer",fontWeight:700,fontSize:24,color:"white"}}>＋</button>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={reset} style={{flex:1,padding:12,borderRadius:12,border:"1.5px solid #fde8ef",background:"white",color:"#888",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>← 戻る</button>
                  <button onClick={confirmQty} style={{flex:2,padding:12,borderRadius:12,border:"none",background:"#e8457a",color:"white",fontWeight:900,cursor:"pointer",fontFamily:"inherit",fontSize:15}}>次へ →</button>
                </div>
              </div>
            )}

            {step==="drink"&&(
              <div style={{background:"white",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 2px 12px rgba(232,69,122,0.08)"}}>
                <div style={{fontWeight:900,fontSize:16,marginBottom:12,color:"#e8457a"}}>ドリンクを選ぶ</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  {DRINKS.map(d=>{
                    const ds=dStock[d.id]??0;
                    return (
                      <div key={d.id} onClick={()=>{if(ds>0)setDrink(d.id);}} style={{borderRadius:12,padding:16,cursor:ds>0?"pointer":"not-allowed",border:drink===d.id?"2.5px solid #e8457a":"2.5px solid #fde8ef",background:drink===d.id?"#fff0f4":"white",opacity:ds>0?1:0.5,textAlign:"center",position:"relative"}}>
                        {oType==="set"&&d.id!=="d1"&&<div style={{position:"absolute",top:-8,right:-8,background:"#10b981",color:"white",fontSize:10,fontWeight:900,borderRadius:10,padding:"2px 7px",whiteSpace:"nowrap"}}>トッピング2個無料</div>}
                        {oType==="set"&&d.id==="d1" &&<div style={{position:"absolute",top:-8,right:-8,background:"#f59e0b",color:"white",fontSize:10,fontWeight:900,borderRadius:10,padding:"2px 7px",whiteSpace:"nowrap"}}>トッピング1個無料</div>}
                        <div style={{fontSize:30}}>{d.emoji}</div>
                        <div style={{fontWeight:700,fontSize:14,marginTop:4}}>{d.name}</div>
                        {oType!=="set"&&<div style={{color:"#e8457a",fontWeight:700,fontSize:15}}>¥{d.price}</div>}
                        {ds<=20&&ds>0&&<div style={{fontSize:10,color:"#ef4444",fontWeight:700,marginTop:2}}>⚠️ 残り僅か</div>}
                        {ds===0&&<div style={{fontSize:10,color:"#ef4444",fontWeight:700,marginTop:2}}>🚫 売り切れ</div>}
                        {d.note&&<div style={{fontSize:10,color:"#f59e0b",marginTop:4,lineHeight:1.4}}>{d.note}</div>}
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setStep("qty")} style={{flex:1,padding:12,borderRadius:12,border:"1.5px solid #fde8ef",background:"white",color:"#888",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>← 戻る</button>
                  <button onClick={confirmDrink} disabled={!drink} style={{flex:2,padding:12,borderRadius:12,border:"none",background:drink?"#e8457a":"#f3c5d3",color:"white",fontWeight:900,cursor:drink?"pointer":"not-allowed",fontFamily:"inherit",fontSize:15}}>次へ →</button>
                </div>
              </div>
            )}

            {step==="toppings"&&waffles.length>0&&(
              <div>
                <div style={{display:"flex",gap:4,marginBottom:10,overflowX:"auto",paddingBottom:2}}>
                  {waffles.map((w,i)=>(
                    <button key={i} onClick={()=>setEditIdx(i)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",background:editIdx===i?"#e8457a":"#fde8ef",color:editIdx===i?"white":"#8b4567"}}>
                      🧇 {i+1}個目{w.toppings.length>0?` (${w.toppings.length})`:""}
                    </button>
                  ))}
                </div>
                <div style={{background:"white",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 2px 12px rgba(232,69,122,0.08)"}}>
                  <div style={{fontWeight:900,fontSize:16,marginBottom:2,color:"#e8457a"}}>{editIdx+1}個目のトッピング</div>
                  <div style={{fontSize:12,color:"#aaa",marginBottom:14}}>複数・同じものも OK　各 +¥30{oType==="set"?`（最初の${freeCnt}個無料）`:""}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                    {TOPPINGS.map(t=>{
                      const cnt=topCnt(t.id);
                      return (
                        <div key={t.id} style={{borderRadius:12,padding:"10px 12px",textAlign:"center",border:cnt>0?"2.5px solid #e8457a":"2.5px solid #fde8ef",background:cnt>0?"#fff0f4":"white",position:"relative"}}>
                          {cnt>0&&<div style={{position:"absolute",top:5,right:8,background:"#e8457a",color:"white",borderRadius:10,fontSize:11,fontWeight:900,padding:"1px 7px"}}>×{cnt}</div>}
                          <div style={{fontSize:24}}>{t.emoji}</div>
                          <div style={{fontWeight:700,fontSize:12,marginTop:3}}>{t.name}</div>
                          <div style={{color:"#e8457a",fontSize:11,marginBottom:7}}>+¥{t.price}</div>
                          <div style={{display:"flex",justifyContent:"center",gap:10}}>
                            <button onClick={()=>remTop(t.id)} disabled={cnt===0} style={{width:28,height:28,borderRadius:"50%",border:"none",background:cnt>0?"#fde8ef":"#f3f3f3",color:cnt>0?"#e8457a":"#ccc",cursor:cnt>0?"pointer":"default",fontWeight:700,fontSize:18}}>−</button>
                            <button onClick={()=>addTop(t.id)} style={{width:28,height:28,borderRadius:"50%",border:"none",background:"#e8457a",color:"white",cursor:"pointer",fontWeight:700,fontSize:18}}>＋</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{background:"#fff8f9",borderRadius:10,padding:10,fontSize:12,marginBottom:14}}>
                    <div style={{fontWeight:700,marginBottom:4}}>
                      {editIdx+1}個目：
                      {waffles[editIdx].toppings.length===0
                        ?<span style={{color:"#aaa"}}>トッピングなし</span>
                        :waffles[editIdx].toppings.map((t,i)=>{
                          const f=oType==="set"&&i<freeCnt;
                          return <span key={i} style={{marginLeft:4,color:f?"#10b981":"#e8457a"}}>{t.emoji}{t.name}{f?"🎉":""}</span>;
                        })
                      }
                    </div>
                    {waffles[editIdx].toppings.length>0&&(
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:"#e8457a"}}>
                          {oType==="set"
                            ?`+¥${Math.max(0,waffles[editIdx].toppings.length-freeCnt)*30}（${freeCnt}個無料）`
                            :`+¥${waffles[editIdx].toppings.reduce((s,t)=>s+t.price,0)}`}
                        </span>
                        <span onClick={clrTop} style={{color:"#aaa",cursor:"pointer"}}>クリア</span>
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{editIdx>0?setEditIdx(i=>i-1):setStep(oType==="set"?"drink":"qty");}} style={{flex:1,padding:11,borderRadius:12,border:"1.5px solid #fde8ef",background:"white",color:"#888",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>← 戻る</button>
                    {editIdx<waffles.length-1
                      ?<button onClick={()=>setEditIdx(i=>i+1)} style={{flex:2,padding:11,borderRadius:12,border:"none",background:"#e8457a",color:"white",fontWeight:900,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>次のワッフル ({editIdx+2}個目) →</button>
                      :<button onClick={()=>setStep("confirm")} style={{flex:2,padding:11,borderRadius:12,border:"none",background:"#e8457a",color:"white",fontWeight:900,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>確認へ →</button>
                    }
                  </div>
                </div>
              </div>
            )}

            {step==="confirm"&&(
              <div style={{background:"white",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 2px 12px rgba(232,69,122,0.08)"}}>
                <div style={{fontWeight:900,fontSize:16,marginBottom:14,color:"#e8457a"}}>注文内容を確認</div>
                {oType==="drink"&&drinkObj&&(
                  <div style={{padding:"6px 0",borderBottom:"1px solid #fde8ef"}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span>{drinkObj.emoji} {drinkObj.name} × {qty}</span>
                      <span style={{fontWeight:700}}>¥{(drinkObj.price*qty).toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {oType!=="drink"&&waffles.map((w,i)=>{
                  const up=wafflePrice(w,oType,drink); const fc=oType==="set"?freeCnt:0;
                  return (
                    <div key={i} style={{padding:"8px 0",borderBottom:"1px solid #fde8ef"}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontWeight:700}}>{oType==="set"?`✨ セット (${drinkObj?.emoji}${drinkObj?.name})`:"🧇 ワッフル"}<span style={{fontSize:12,color:"#aaa",marginLeft:4}}>{i+1}個目</span></span>
                        <span style={{fontWeight:700,color:"#e8457a"}}>¥{up.toLocaleString()}</span>
                      </div>
                      {oType==="set"&&fc>=2&&<div style={{fontSize:11,color:"#10b981",paddingLeft:8}}>🎉 トッピング2個無料！</div>}
                      {w.toppings.length===0&&<div style={{fontSize:12,color:"#aaa",paddingLeft:8}}>トッピングなし</div>}
                      {w.toppings.map((t,j)=>(
                        <div key={j} style={{fontSize:12,paddingLeft:8,display:"flex",justifyContent:"space-between"}}>
                          <span style={{color:j<fc?"#10b981":"#e8457a"}}>{t.emoji}{t.name}{j<fc?" 🎉無料":""}</span>
                          <span style={{color:j<fc?"#10b981":"#e8457a"}}>{j<fc?"¥0":"+¥30"}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div style={{display:"flex",justifyContent:"space-between",marginTop:12,fontWeight:900,fontSize:18,color:"#e8457a"}}>
                  <span>小計</span><span>¥{orderTotal().toLocaleString()}</span>
                </div>
                <div style={{display:"flex",gap:8,marginTop:14}}>
                  <button onClick={()=>setStep(oType==="drink"?"drink":"toppings")} style={{flex:1,padding:12,borderRadius:12,border:"1.5px solid #fde8ef",background:"white",color:"#888",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>← 戻る</button>
                  <button onClick={addToCart} style={{flex:2,padding:12,borderRadius:12,border:"none",background:"linear-gradient(135deg,#e8457a,#f472a8)",color:"white",fontWeight:900,cursor:"pointer",fontFamily:"inherit",fontSize:15,boxShadow:"0 4px 16px rgba(232,69,122,0.35)"}}>カートに追加 🧇</button>
                </div>
              </div>
            )}

            {cart.length>0&&(
              <div style={{background:"white",borderRadius:16,padding:16,boxShadow:"0 4px 20px rgba(232,69,122,0.12)"}}>
                <div style={{fontWeight:900,fontSize:16,marginBottom:12,color:"#e8457a"}}>🛒 カート</div>
                <input value={tableNum} onChange={e=>setTableNum(e.target.value)} placeholder="テーブル番号（任意）" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1.5px solid #fde8ef",marginBottom:10,fontFamily:"inherit",fontSize:13,boxSizing:"border-box"}}/>
                {cart.map(entry=>(
                  <div key={entry.id} style={{marginBottom:10,paddingBottom:10,borderBottom:"1px solid #fde8ef"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,fontSize:13}}>
                        {entry.type==="drink"&&<div style={{fontWeight:700}}>{entry.drink.emoji} {entry.drink.name} × {entry.qty}</div>}
                        {entry.type!=="drink"&&entry.waffles.map((w,i)=>(
                          <div key={i} style={{marginBottom:2}}>
                            <span style={{fontWeight:700}}>{entry.type==="set"?`✨ セット(${entry.drink.emoji}${entry.drink.name})`:"🧇 ワッフル"}<span style={{fontSize:11,color:"#aaa",marginLeft:4}}>{i+1}個目</span></span>
                            {w.toppings.length>0&&<span style={{color:"#e8457a",fontSize:12,marginLeft:6}}>{w.toppings.map(t=>`${t.emoji}${t.name}`).join("・")}</span>}
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:8}}>
                        <span style={{fontWeight:700}}>¥{(entry.total||0).toLocaleString()}</span>
                        <button onClick={()=>remCart(entry.id)} style={{background:"#fde8ef",border:"none",borderRadius:"50%",width:22,height:22,cursor:"pointer",color:"#e8457a",fontWeight:700,fontSize:14,lineHeight:1}}>×</button>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontWeight:900,fontSize:18}}>
                  <span>合計</span><span style={{color:"#e8457a"}}>¥{cartTotal.toLocaleString()}</span>
                </div>
                <button onClick={submitOrder} style={{width:"100%",marginTop:14,padding:14,background:"linear-gradient(135deg,#e8457a,#f472a8)",color:"white",border:"none",borderRadius:12,fontWeight:900,fontSize:16,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(232,69,122,0.4)"}}>注文を送信する 🧇✨</button>
              </div>
            )}
          </div>
        )}

        {/* ══ 注文一覧 ══ */}
        {view==="orders"&&(
          <div>
            {orders.length>0&&(()=>{
              const total=orders.reduce((s,o)=>s+(o.total||0),0);
              const done =orders.filter(o=>o.status==="完了").reduce((s,o)=>s+(o.total||0),0);
              return (
                <div style={{background:"linear-gradient(135deg,#e8457a,#f472a8)",borderRadius:16,padding:"14px 18px",marginBottom:14,color:"white"}}>
                  <div style={{fontSize:12,opacity:0.85,marginBottom:4}}>💰 売上サマリー</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                    <div><div style={{fontSize:11,opacity:0.75}}>全注文合計</div><div style={{fontSize:26,fontWeight:900}}>¥{total.toLocaleString()}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:11,opacity:0.75}}>完了済み</div><div style={{fontSize:20,fontWeight:700}}>¥{done.toLocaleString()}</div></div>
                  </div>
                  <div style={{marginTop:8,fontSize:11,opacity:0.7}}>注文数: {orders.length}件　完了: {orders.filter(o=>o.status==="完了").length}件</div>
                </div>
              );
            })()}

            {orders.length===0
              ?<div style={{textAlign:"center",padding:60,color:"#ccc"}}><div style={{fontSize:48,marginBottom:12}}>📋</div><div>まだ注文がありません</div></div>
              :(()=>{
                const active=orders.filter(o=>o.status!=="完了");
                const done  =orders.filter(o=>o.status==="完了");
                const Card=({o})=>{
                  try{return(
                    <div style={{background:o.status==="完了"?"#f9f9f9":"white",borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 2px 12px rgba(232,69,122,0.07)",opacity:o.status==="完了"?0.7:1,borderLeft:`4px solid ${sc(o.status||"受付中")}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{background:sc(o.status||"受付中"),color:"white",fontSize:11,fontWeight:900,borderRadius:8,padding:"2px 8px"}}>{o.status||"受付中"}</span>
                          <span style={{fontWeight:900,fontSize:15}}>#{o.id}</span>
                          {o.tableNum&&o.tableNum!=="未設定"&&<span style={{fontSize:12,color:"#aaa"}}>テーブル {o.tableNum}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:12,color:"#aaa"}}>{o.time}</span>
                          <button onClick={()=>deleteOrder(o)} style={{background:"#fff0f0",border:"1px solid #fca5a5",borderRadius:8,padding:"2px 8px",cursor:"pointer",color:"#ef4444",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>🗑 削除</button>
                        </div>
                      </div>
                      {(o.items||[]).map((entry,ei)=>(
                        <div key={ei} style={{fontSize:13,paddingBottom:5,marginBottom:5,borderBottom:"1px solid #f3e6d8"}}>
                          {entry.type==="drink"&&<div>{entry.drink?.emoji} {entry.drink?.name} × {entry.qty}　<span style={{fontWeight:700}}>¥{(entry.total||0).toLocaleString()}</span></div>}
                          {entry.type!=="drink"&&(entry.waffles||[]).map((w,i)=>(
                            <div key={i}>
                              <span style={{fontWeight:700}}>{entry.type==="set"?`✨ セット(${entry.drink?.emoji||""}${entry.drink?.name||""})`:"🧇 ワッフル"}<span style={{fontSize:11,color:"#aaa",marginLeft:4}}>{i+1}個目</span></span>
                              <span style={{float:"right",fontWeight:700}}>¥{(entry.unitPrices?.[i]||0).toLocaleString()}</span>
                              {(w.toppings||[]).length>0&&<div style={{fontSize:11,color:"#e8457a",paddingLeft:12}}>{(w.toppings||[]).map(t=>`${t.emoji}${t.name}`).join(" · ")}</div>}
                            </div>
                          ))}
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:6,alignItems:"center"}}>
                        <div style={{display:"flex",gap:5}}>
                          {["受付中","準備中","完了"].map(s=>(
                            <button key={s} onClick={()=>changeStatus(o.id,s)} style={{padding:"4px 10px",borderRadius:12,border:"none",fontSize:11,cursor:"pointer",fontWeight:700,fontFamily:"inherit",background:o.status===s?sc(s):"#f3e6d8",color:o.status===s?"white":"#999"}}>{s}</button>
                          ))}
                        </div>
                        <span style={{fontWeight:900,color:"#e8457a"}}>¥{(o.total||0).toLocaleString()}</span>
                      </div>
                    </div>
                  );}catch(e){return<div key={o.id} style={{background:"#fff0f0",borderRadius:12,padding:12,marginBottom:8,fontSize:12,color:"#ef4444"}}>注文 #{o.id} の表示でエラーが発生しました</div>;}
                };
                return(
                  <>
                    <div style={{marginBottom:16}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <div style={{fontWeight:900,fontSize:14,color:"#e8457a"}}>🔥 対応中</div>
                        <div style={{background:"#e8457a",color:"white",borderRadius:10,fontSize:11,fontWeight:700,padding:"1px 8px"}}>{active.length}</div>
                      </div>
                      {active.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#ccc",fontSize:13}}>対応中の注文はありません</div>:active.map(o=><Card key={o.id} o={o}/>)}
                    </div>
                    {done.length>0&&(
                      <div>
                        <button onClick={()=>setShowDone(v=>!v)} style={{width:"100%",padding:"10px 16px",borderRadius:12,border:"1.5px solid #d1fae5",background:showDone?"#d1fae5":"white",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:showDone?10:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontWeight:900,fontSize:14,color:"#10b981"}}>✅ 完了済み</span>
                            <span style={{background:"#10b981",color:"white",borderRadius:10,fontSize:11,fontWeight:700,padding:"1px 8px"}}>{done.length}件</span>
                          </div>
                          <span style={{color:"#10b981",fontSize:13,fontWeight:700}}>{showDone?"▲ 閉じる":"▼ 履歴を見る"}</span>
                        </button>
                        {showDone&&done.map(o=><Card key={o.id} o={o}/>)}
                      </div>
                    )}
                  </>
                );
              })()
            }
          </div>
        )}

        {/* ══ 在庫 ══ */}
        {view==="stock"&&(
          <div>
            {!unlocked?(
              <div style={{background:"white",borderRadius:16,padding:24,marginTop:8,textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:8}}>🔒</div>
                <div style={{fontWeight:900,fontSize:16,marginBottom:4,color:"#e8457a"}}>在庫管理</div>
                <div style={{fontSize:13,color:"#aaa",marginBottom:16}}>パスワードを入力してください</div>
                <input type="password" value={pwInput} onChange={e=>setPwInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"){if(pwInput==="password"){setUnlocked(true);setPwInput("");}else{showNotif("パスワードが違います","err");setPwInput("");}}}}
                  placeholder="パスワード" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid #fde8ef",fontFamily:"inherit",fontSize:15,boxSizing:"border-box",marginBottom:10,textAlign:"center"}}/>
                <button onClick={()=>{if(pwInput==="password"){setUnlocked(true);setPwInput("");}else{showNotif("パスワードが違います","err");setPwInput("");}}}
                  style={{width:"100%",padding:12,borderRadius:12,border:"none",background:"#e8457a",color:"white",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>ロック解除</button>
              </div>
            ):(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#aaa"}}>※ 注文確定時に自動で在庫が減ります</div>
                  <button onClick={()=>setUnlocked(false)} style={{fontSize:11,color:"#aaa",background:"none",border:"1px solid #eee",borderRadius:8,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit"}}>🔒 ロック</button>
                </div>
                {[
                  {name:"ワッフル",emoji:"🧇",stock:wStock,init:WAFFLE_STOCK_INIT,
                   onReset:()=>{setWStock(WAFFLE_STOCK_INIT);saveStock(WAFFLE_STOCK_INIT,dStock);},
                   onSet:(v)=>{const n=Math.max(0,v);setWStock(n);saveStock(n,dStock);}},
                  ...DRINKS.map(d=>({name:d.name,emoji:d.emoji,stock:dStock[d.id]??0,init:d.stock,
                   onReset:()=>{const nd={...dStock,[d.id]:d.stock};setDStock(nd);saveStock(wStock,nd);},
                   onSet:(v)=>{const nd={...dStock,[d.id]:Math.max(0,v)};setDStock(nd);saveStock(wStock,nd);}}))
                ].map((item,i)=>{
                  const pct=Math.min(100,item.stock/item.init*100);
                  const bc=pct>50?"#10b981":pct>20?"#f59e0b":"#ef4444";
                  return(
                    <div key={i} style={{background:"white",borderRadius:14,padding:"12px 16px",marginBottom:8,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontWeight:700}}>{item.emoji} {item.name}</span>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontWeight:900,color:item.stock<=10?"#ef4444":"#333"}}>{item.stock}個 {item.stock===0?"🚫":item.stock<=10?"⚠️":""}</span>
                          <button onClick={item.onReset} style={{fontSize:11,color:"#e8457a",background:"#fde8ef",border:"none",borderRadius:8,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>リセット</button>
                        </div>
                      </div>
                      <div style={{background:"#fde8ef",borderRadius:4,height:6,overflow:"hidden",marginBottom:8}}>
                        <div style={{width:`${pct}%`,height:"100%",background:bc,borderRadius:4,transition:"width 0.5s"}}/>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:12,color:"#aaa"}}>手動変更:</span>
                        <button onClick={()=>item.onSet(item.stock-1)} disabled={item.stock===0} style={{width:24,height:24,borderRadius:"50%",border:"none",background:item.stock>0?"#fde8ef":"#eee",color:item.stock>0?"#e8457a":"#ccc",cursor:item.stock>0?"pointer":"default",fontWeight:700,fontSize:14}}>−</button>
                        <span style={{minWidth:32,textAlign:"center",fontWeight:700,fontSize:14}}>{item.stock}</span>
                        <button onClick={()=>item.onSet(item.stock+1)} style={{width:24,height:24,borderRadius:"50%",border:"none",background:"#e8457a",color:"white",cursor:"pointer",fontWeight:700,fontSize:14}}>＋</button>
                      </div>
                    </div>
                  );
                })}
                <div style={{marginTop:12,padding:14,background:"#fff0f4",borderRadius:12,fontSize:13}}>
                  <div style={{fontWeight:700,marginBottom:6}}>凡例</div>
                  <div style={{display:"flex",gap:16}}><span>🟢 充分</span><span>🟡 残り少</span><span>🔴 要補充 / 🚫 売り切れ</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`*{-webkit-tap-highlight-color:transparent}`}</style>
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);