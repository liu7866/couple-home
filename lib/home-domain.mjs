export class HomeError extends Error {
  constructor(message, status=400) { super(message); this.status=status; }
}
export const sharedToday = (now=Date.now()) => new Date(now+8*3600e3).toISOString().slice(0,10);
export const initialState = (now=Date.now()) => ({v:2,names:['你','我'],start:'',intro:'',stories:[],wishes:[],letters:[],anniversaries:[],moods:{},pet:{name:'团团',kind:'cat',color:'cream',bornAt:now,fullness:75,happiness:80,energy:85,xp:0,updatedAt:now,sleepingUntil:0,cooldowns:{},careLog:[]}});
const string=(x,max=100)=>{if(typeof x!=='string'||!x.trim()||x.trim().length>max)throw new HomeError('请填写合适长度的内容。');return x.trim()};
const date=(x,optional=false)=>{if(optional&&!x)return '';if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))throw new HomeError('请选择有效日期。');const parsed=new Date(x+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==x)throw new HomeError('请选择有效日期。');return x};
const itemId=x=>{if(typeof x!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(x))throw new HomeError('记录编号无效。');return x};
const remove=(s,key,id)=>{const index=s[key].findIndex(x=>x.id===id);if(index<0)throw new HomeError('这条记录已被另一台设备移除。',409);s[key].splice(index,1)};
const add=(s,key,value,max=500)=>{if(s[key].length>=max)throw new HomeError('这个分类的记录已满，请先导出备份。');s[key].push(value)};
const clamp=x=>Math.round(Math.max(20,Math.min(100,x)));
export function petNow(p,now=Date.now()) {
  const pet=structuredClone(p);const hours=Math.max(0,(now-pet.updatedAt)/3600e3);
  pet.fullness=clamp(pet.fullness-hours*1.6);pet.happiness=clamp(pet.happiness-hours*.9);
  const sleepHours=Math.max(0,(Math.min(now,pet.sleepingUntil)-pet.updatedAt)/3600e3);
  pet.energy=clamp(pet.energy-hours*.6+sleepHours*60);
  pet.updatedAt=now;return pet;
}
export function applyOperation(current,op,member,now=Date.now()) {
  if(!op||typeof op.kind!=='string'||!member?.userId||![1,2].includes(member.slot))throw new HomeError('请先登录。',401);
  const s=structuredClone(current),p=op.payload||{},actor=s.names[member.slot-1]||member.displayName||'小屋成员';
  switch(op.kind){
    case 'settings': {
      if(!Array.isArray(p.names)||p.names.length!==2)throw new HomeError('请填写两个人的名字。');
      s.names=p.names.map(x=>string(x,15));s.start=date(p.start,true);if(s.start>sharedToday(now))throw new HomeError('恋爱开始日期不能在未来。');s.intro=typeof p.intro==='string'?p.intro.trim().slice(0,100):'';break;
    }
    case 'story.add':add(s,'stories',{id:itemId(p.id),date:date(p.date),title:string(p.title,40),text:string(p.text,1500),author:member.userId});break;
    case 'story.remove':remove(s,'stories',itemId(p.id));break;
    case 'wish.add':add(s,'wishes',{id:itemId(p.id),text:string(p.text,100),done:false,author:member.userId});break;
    case 'wish.toggle':{const w=s.wishes.find(x=>x.id===itemId(p.id));if(!w)throw new HomeError('这条心愿已被移除。',409);if(typeof p.done!=='boolean')throw new HomeError('心愿状态无效。');w.done=p.done;break}
    case 'wish.remove':remove(s,'wishes',itemId(p.id));break;
    case 'anniversary.add':add(s,'anniversaries',{id:itemId(p.id),title:string(p.title,30),date:date(p.date)});break;
    case 'anniversary.remove':remove(s,'anniversaries',itemId(p.id));break;
    case 'letter.add':add(s,'letters',{id:itemId(p.id),author:string(p.author,20),authorId:member.userId,text:string(p.text,3000),date:sharedToday(now),openDate:date(p.openDate,true)});break;
    case 'letter.remove':remove(s,'letters',itemId(p.id));break;
    case 'mood': {
      if(!['晴朗','想你','平静','需要抱抱'].includes(p.mood))throw new HomeError('心情无效。');
      const day=sharedToday(now);s.moods[day]={...(typeof s.moods[day]==='object'?s.moods[day]:{}),[member.slot]:p.mood};break;
    }
    case 'pet.settings':s.pet.name=string(p.name,12);if(!['cat','bunny'].includes(p.petKind)||!['cream','rose','sage'].includes(p.color))throw new HomeError('请选择小伙伴的外观。');s.pet.kind=p.petKind;s.pet.color=p.color;break;
    case 'pet.care': {
      const action=p.action;if(!['feed','play','pet','sleep'].includes(action))throw new HomeError('照顾方式无效。');
      const pet=petNow(s.pet,now),key=member.userId+':'+action,last=pet.cooldowns[key]||0;
      if(now-last<20000)throw new HomeError('让小家伙缓一缓，20 秒后再来吧。',429);
      if(pet.sleepingUntil>now&&action!=='pet')throw new HomeError('小家伙在休息，先轻轻摸摸它吧。',409);
      if(action==='feed'){pet.fullness=clamp(pet.fullness+18);pet.happiness=clamp(pet.happiness+3)}
      if(action==='play'){pet.happiness=clamp(pet.happiness+20);pet.energy=clamp(pet.energy-10)}
      if(action==='pet'){pet.happiness=clamp(pet.happiness+10);pet.energy=clamp(pet.energy+3)}
      if(action==='sleep'){pet.sleepingUntil=now+5*60e3;pet.energy=clamp(pet.energy+8)}
      pet.xp+=action==='pet'?5:10;pet.cooldowns[key]=now;
      pet.careLog.unshift({id:op.id,action,actor,slot:member.slot,at:now});pet.careLog=pet.careLog.slice(0,30);s.pet=pet;break;
    }
    case 'import':{
      if(![1,2].includes(p.data?.v))throw new HomeError('请选择有效的小屋备份。');
      const d=p.data;
      if(!Array.isArray(d.names)||d.names.length!==2)throw new HomeError('备份中的名字无效。');
      const importedNames=d.names.map(x=>string(x,15)),importedStart=date(d.start,true);
      if(importedStart>sharedToday(now))throw new HomeError('备份中的恋爱日期在未来。');
      if(!s.start){s.names=importedNames;s.start=importedStart;s.intro=typeof d.intro==='string'?d.intro.slice(0,100):'';}
      const imported=initialState(now);imported.names=s.names;
      const types={stories:'story.add',wishes:'wish.add',letters:'letter.add',anniversaries:'anniversary.add'};
      let merged=imported;
      for(const [key,type]of Object.entries(types)){
        if(!Array.isArray(d[key])||d[key].length>500)throw new HomeError('备份记录格式无效。');
        for(const row of d[key]){
          if(key==='letters'&&row.locked)continue;
          if(s[key].some(x=>key==='stories'?x.title===row.title&&x.date===row.date&&x.text===row.text:key==='wishes'?x.text===row.text:key==='letters'?x.text===row.text&&x.author===row.author:x.title===row.title&&x.date===row.date))continue;
          merged=applyOperation(merged,{id:crypto.randomUUID(),kind:type,payload:{...row,id:crypto.randomUUID()}},member,now);
          if(key==='wishes')merged.wishes[merged.wishes.length-1].done=!!row.done;
          if(key==='letters'&&row.date)merged.letters[merged.letters.length-1].date=date(row.date);
        }
        if(s[key].length+merged[key].length>500)throw new HomeError('合并后的记录太多，请分批导入。');
        s[key].push(...merged[key]);
      }
      break;
    }
    default:throw new HomeError('不支持这个操作。');
  }
  return s;
}
export function publicState(s,now=Date.now()) {
  const out=structuredClone(s);out.pet=petNow(out.pet,now);delete out.pet.cooldowns;
  out.letters=out.letters.map(l=>l.openDate&&l.openDate>sharedToday(now)?{...l,text:'',locked:true}:{...l,locked:false});
  return out;
}
