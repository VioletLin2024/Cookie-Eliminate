"use strict";
let nodeCounter = 0;
const REPORT_STEP = 12000; //每12000个节点上报一次进度，平衡性能和UI刷新
function popcount(x){ let c=0; while(x){ x&=x-1; c++; } return c; }
function normalize(cells){
  if(!cells.length) return [];
  let minR=99,minC=99,maxR=-1,maxC=-1;
  for(const [r,c] of cells){ if(r<minR)minR=r; if(c<minC)minC=c; if(r>maxR)maxR=r; if(c>maxC)maxC=c; }
  return cells.map(([r,c])=>[r-minR,c-minC]);
}
function rotate90(cells){
  let h=0,w=0;
  for(const [r,c] of cells){ if(r+1>h)h=r+1; if(c+1>w)w=c+1; }
  return normalize(cells.map(([r,c])=>[c,h-1-r]));
}
function keyOf(cells){ return cells.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(p=>p[0]+','+p[1]).join(';'); }
function orientations(cells,rotCost){
  const seen=new Set(), res=[];
  let cur=cells;
  for(let s=0;s<4;s++){
    const k=keyOf(cur);
    if(!seen.has(k)){
      seen.add(k);
      const cost = s===0 ? 0 : rotCost;
      res.push({cells:cur,cost:cost,angle:s*90});
    }
    cur=rotate90(cur);
  }
  return res;
}
function validPositions(rows,cells){
  const out=[]; let h=0,w=0;
  for(const [r,c] of cells){ if(r+1>h)h=r+1; if(c+1>w)w=c+1; }
  for(let r=0;r+h<=8;r++) for(let c=0;c+w<=8;c++){
    let ok=true;
    for(const [dr,dc] of cells){ if(rows[r+dr]&(1<<(c+dc))){ ok=false; break; } }
    if(ok) out.push([r,c]);
  }
  return out;
}
function placeAndClear(rows,cells,pos,combo){
  const [r0,c0]=pos, nr=rows.slice();
  for(const [dr,dc] of cells) nr[r0+dr]|=(1<<(c0+dc));
  let rowFull=0,colFull=0;
  for(let r=0;r<8;r++) if(nr[r]===255) rowFull|=(1<<r);
  for(let c=0;c<8;c++){ let full=true; for(let r=0;r<8;r++) if(!(nr[r]&(1<<c))){full=false;break;} if(full) colFull|=(1<<c); }
  const rc=popcount(rowFull), cc=popcount(colFull), lines=rc+cc;
  const cleared=[];
  for(let r=0;r<8;r++) if(rowFull&(1<<r)) for(let c=0;c<8;c++) cleared.push([r,c]);
  for(let c=0;c<8;c++) if(colFull&(1<<c)) for(let r=0;r<8;r++) if(!(rowFull&(1<<r))) cleared.push([r,c]);
  if(rowFull) for(let r=0;r<8;r++) if(rowFull&(1<<r)) nr[r]=0;
  if(colFull) for(let r=0;r<8;r++) nr[r]&=~colFull;
  const pts=lines===0?0:combo[Math.min(lines-1,combo.length-1)];
  return {rows:nr,lines,rc,cc,cleared,pts};
}
function countFilled(rows){ let s=0; for(const x of rows) s+=popcount(x); return s; }
function countPropUse(plan,rotWeight,oneWeight){
  let rotCnt=0,oneCnt=0;
  for(const step of plan){
    if(step.cost>0&&!step.isOne) rotCnt+=1;
    if(step.isOne) oneCnt+=1;
  }
  return {rotCnt,oneCnt,weightedCost: rotCnt*rotWeight + oneCnt*oneWeight,realCount:rotCnt+oneCnt};
}
function solveCollectCandidates(blocksOris,board,opts){
  const MAX=opts.budget;
  let candidates=[];
  nodeCounter=0;
  function dfs(rows,rem,oneLeft,accRot,accOne,plan,points){
    nodeCounter++;
    if(nodeCounter % REPORT_STEP === 0){
      self.postMessage({type:"progress", nodes:nodeCounter});
    }
    if(nodeCounter>MAX) return;
    if(rem.length===0){
      const filled=countFilled(rows);
      const weightedCost = accRot*opts.rotWeight + accOne*opts.oneWeight;
      const realCount=accRot+accOne;
      const util=points-opts.weight*filled;
      candidates.push({weightedCost,util,plan:plan.slice(),points,filled,rotCnt:accRot,oneCnt:accOne,realCount});
      return;
    }
    for(let i=0;i<rem.length;i++){
      const b=rem[i], rest=rem.slice(0,i).concat(rem.slice(i+1));
      for(const o of b.oris){
        const newRot = accRot + (o.cost>0?1:0);
        const newOne = accOne;
        const newW = newRot*opts.rotWeight + newOne*opts.oneWeight;
        const newRC=newRot+newOne;
        if(opts.objective!=='maxutil' && candidates.length>0){
          const minRC=Math.min(...candidates.map(x=>x.realCount));
          if(newRC>minRC) continue;
          if(newRC===minRC){
            const minW=Math.min(...candidates.filter(x=>x.realCount===minRC).map(x=>x.weightedCost));
            if(newW>minW*1.35) continue;
          }
        }
        const poss=validPositions(rows,o.cells);
        for(const pos of poss){
          const r=placeAndClear(rows,o.cells,pos,opts.combo);
          plan.push({block:b.id,ori:o.cells,pos,lines:r.lines,rc:r.rc,cc:r.cc,pts:r.pts,cost:o.cost,angle:o.angle,cleared:r.cleared,isOne:false});
          dfs(r.rows,rest,oneLeft,newRot,newOne,plan,points+r.pts);
          plan.pop();
        }
      }
    }
    if(oneLeft){
      for(let rr=0;rr<8;rr++) for(let c=0;c<8;c++){
        if(rows[rr]&(1<<c)) continue;
        const newRot=accRot;
        const newOne=accOne+1;
        const newW = newRot*opts.rotWeight + newOne*opts.oneWeight;
        const newRC=newRot+newOne;
        if(opts.objective!=='maxutil' && candidates.length>0){
          const minRC=Math.min(...candidates.map(x=>x.realCount));
          if(newRC>minRC) continue;
          if(newRC===minRC){
            const minW=Math.min(...candidates.filter(x=>x.realCount===minRC).map(x=>x.weightedCost));
            if(newW>minW*1.35) continue;
          }
        }
        const oneCells=[[0,0]];
        const res=placeAndClear(rows,oneCells,[rr,c],opts.combo);
        plan.push({block:'1x1',ori:[[0,0]],pos:[rr,c],lines:res.lines,rc:res.rc,cc:res.cc,pts:res.pts,cost:opts.oneCost,angle:0,cleared:res.cleared,isOne:true});
        dfs(res.rows,rem,false,newRot,newOne,plan,points+res.pts);
        plan.pop();
      }
    }
  }
  dfs(board,blocksOris,!!opts.oneAvailable,0,0,[],0);
  return candidates;
}

self.onmessage = function(e){
  const {board,blocks,rotWeight,oneWeight,rotCost,oneCost,weight,combo,budget}=e.data;
  const opts={
    weight:weight,
    combo:combo,
    oneAvailable:true,
    oneCost:oneCost,
    objective:'mincost',
    budget:budget,
    rotWeight:rotWeight,
    oneWeight:oneWeight
  };
  //先跑不旋转
  const blocksNormal = blocks.map(b=>{
    return {...b, oris:[{cells:b.oris[0].cells, cost:0, angle:0}]};
  });
  const a = solveCollectCandidates(blocksNormal,board,opts);
  const normalOk = a.filter(x=>x.realCount===0);
  if(normalOk.length>0){
    normalOk.sort((p,q)=>{
      if(p.weightedCost!==q.weightedCost) return p.weightedCost - q.weightedCost;
      return q.points-p.points;
    });
    const best = normalOk[0];
    self.postMessage({
      type:"done",
      result:{
        rotCnt:best.rotCnt,
        oneCnt:best.oneCnt,
        cost:0,
        points:best.points,
        plan:best.plan,
        mode:'normal',
        base:board.slice(),
        combo:combo
      }
    });
    return;
  }
  //开启旋转破解
  const escCandidates = solveCollectCandidates(blocks,board,opts);
  if(escCandidates.length>0){
    const minRC=Math.min(...escCandidates.map(x=>x.realCount));
    const filterMinRC=escCandidates.filter(x=>x.realCount===minRC);
    filterMinRC.sort((p,q)=>{
      if(p.weightedCost!==q.weightedCost) return p.weightedCost - q.weightedCost;
      return q.points-p.points;
    });
    const best=filterMinRC[0];
    self.postMessage({
      type:"done",
      result:{
        rotCnt:best.rotCnt,
        oneCnt:best.oneCnt,
        cost:best.realCount,
        points:best.points,
        plan:best.plan,
        mode:'escape',
        base:board.slice(),
        combo:combo
      }
    });
  }else{
    self.postMessage({type:"done", result:null});
  }
}
