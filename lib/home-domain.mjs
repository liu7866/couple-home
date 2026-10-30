import {ensureFeatures,applyFeatureOperation,featurePublicState,validateFeatureBackup,mergeFeatureBackup} from './home-features.mjs';
export class HomeError extends Error {
  constructor(message, status=400) { super(message); this.status=status; }
}
export const sharedToday = (now=Date.now()) => new Date(now+8*3600e3).toISOString().slice(0,10);
export const initialState = (now=Date.now()) => ensureFeatures({v:2,names:['你','我'],start:'',intro:'',stories:[],wishes:[],letters:[],anniversaries:[],moods:{},pet:{name:'团团',kind:'cat',color:'cream',bornAt:now,fullness:75,happiness:80,energy:85,xp:0,updatedAt:now,sleepingUntil:0,cooldowns:{},careLog:[]}});
const string=(x,max=100)=>{if(typeof x!=='string'||!x.trim()||x.trim().length>max)throw new HomeError('请填写合适长度的内容。');return x.trim()};
const date=(x,optional=false)=>{if(optional&&!x)return '';if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))throw new HomeError('请选择有效日期。');const parsed=new Date(x+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==x)throw new HomeError('请选择有效日期。');return x};
const itemId=x=>{if(typeof x!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(x))throw new HomeError('记录编号无效。');return x};
const remove=(s,key,id)=>{const index=s[key].findIndex(x=>x.id===id);if(index<0)throw new HomeError('这条记录已被另一台设备移除。',409);s[key].splice(index,1)};
const add=(s,key,value,max=500)=>{if(s[key].length>=max)throw new HomeError('这个分类的记录已满，请先导出备份。');s[key].push(value)};
const clamp=x=>Math.round(Math.max(20,Math.min(100,x)));
function validatePetStages(stages) {
  if(!Array.isArray(stages)||stages.length<2||stages.length>5)throw new HomeError('请设置 2 至 5 个成长阶段。');
  let previous=-1;
  return stages.map((item,index)=>{
    if(!item||typeof item!=='object'||!Number.isSafeInteger(item.start)||item.start<0||item.start>100000000||(index===0&&item.start!==0)||item.start<=previous)throw new HomeError('成长值门槛需从 0 开始并依次增加。');
    if(!['cat','bunny'].includes(item.kind)||!['baby','young','grown'].includes(item.shape)||!['default','none','bow','star'].includes(item.accessory)||typeof item.color!=='string'||!/^#[0-9a-f]{6}$/i.test(item.color))throw new HomeError('宠物阶段的外观无效。');
    previous=item.start;return {name:string(item.name,12),start:item.start,kind:item.kind,shape:item.shape,accessory:item.accessory,color:item.color.toLowerCase()};
  });
}
export function petNow(p,now=Date.now()) {
  const pet=structuredClone(p);const hours=Math.max(0,(now-pet.updatedAt)/3600e3);
  pet.fullness=clamp(pet.fullness-hours*1.6);pet.happiness=clamp(pet.happiness-hours*.9);
  const sleepHours=Math.max(0,(Math.min(now,pet.sleepingUntil)-pet.updatedAt)/3600e3);
  pet.energy=clamp(pet.energy-hours*.6+sleepHours*60);
  pet.updatedAt=now;return pet;
}
export function applyOperation(current,op,member,now=Date.now()) {
  if(!op||typeof op.kind!=='string'||!member?.userId||![1,2].includes(member.slot))throw new HomeError('请先登录。',401);
  const s=ensureFeatures(structuredClone(current)),p=op.payload||{},actor=s.names[member.slot-1]||member.displayName||'小屋成员';
  switch(op.kind){
    case 'settings': {
      if(!Array.isArray(p.names)||p.names.length!==2)throw new HomeError('请填写两个人的名字。');
      s.names=p.names.map(x=>string(x,15));s.start=date(p.start,true);if(s.start>sharedToday(now))throw new HomeError('恋爱开始日期不能在未来。');s.intro=typeof p.intro==='string'?p.intro.trim().slice(0,100):'';break;
    }
    case 'story.add':add(s,'stories',{id:itemId(p.id),date:date(p.date),title:string(p.title,40),text:string(p.text,1500),author:member.userId});break;
    case 'story.remove':remove(s,'stories',itemId(p.id));break;
    case 'wish.add':add(s,'wishes',{id:itemId(p.id),text:string(p.text,100),done:false,author:member.userId,createdAt:now});break;
    case 'wish.toggle':{const w=s.wishes.find(x=>x.id===itemId(p.id));if(!w)throw new HomeError('这条心愿已被移除。',409);if(typeof p.done!=='boolean')throw new HomeError('心愿状态无效。');w.done=p.done;if(p.done)w.completedAt=now;else delete w.completedAt;break}
    case 'wish.remove':remove(s,'wishes',itemId(p.id));break;
    case 'anniversary.add':add(s,'anniversaries',{id:itemId(p.id),title:string(p.title,30),date:date(p.date)});break;
    case 'anniversary.remove':remove(s,'anniversaries',itemId(p.id));break;
    case 'letter.add':add(s,'letters',{id:itemId(p.id),author:string(p.author,20),authorId:member.userId,text:string(p.text,3000),date:sharedToday(now),openDate:date(p.openDate,true)});break;
    case 'letter.remove':remove(s,'letters',itemId(p.id));break;
    case 'mood': {
      if(!['晴朗','想你','平静','需要抱抱'].includes(p.mood))throw new HomeError('心情无效。');
      const day=sharedToday(now);s.moods[day]={...(typeof s.moods[day]==='object'?s.moods[day]:{}),[member.slot]:p.mood};break;
    }
    case 'pet.settings':s.pet.name=string(p.name,12);if(!['cat','bunny'].includes(p.petKind)||!['cream','rose','sage'].includes(p.color))throw new HomeError('请选择小伙伴的外观。');s.pet.kind=p.petKind;s.pet.color=p.color;if(p.stages!==undefined)s.pet.stages=validatePetStages(p.stages);break;
    case 'pet.duet': {
      const pet=petNow(s.pet,now);if(pet.sleepingUntil>now)throw new HomeError('等小家伙睡醒再一起玩吧。',409);
      const key=member.userId+':duet';if(now-(pet.cooldowns[key]||0)<20000)throw new HomeError('一起歇一小会儿，20 秒后再来。',429);
      pet.cooldowns[key]=now;
      if(pet.duet&&now-pet.duet.at<300000&&pet.duet.slot!==member.slot){pet.happiness=clamp(pet.happiness+15);pet.xp+=20;pet.careLog.unshift({id:op.id,action:'duet',actor:s.names.join(' & '),slot:member.slot,at:now});pet.careLog=pet.careLog.slice(0,100);pet.duet=null}
      else {if(pet.duet&&now-pet.duet.at<300000&&pet.duet.slot===member.slot)throw new HomeError('邀请已送出，等另一位在 5 分钟内回应 ♡',409);pet.duet={slot:member.slot,at:now}}
      s.pet=pet;break;
    }
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
      pet.careLog.unshift({id:op.id,action,actor,slot:member.slot,at:now});pet.careLog=pet.careLog.slice(0,100);s.pet=pet;break;
    }
    case 'import':{
      if(![1,2].includes(p.data?.v))throw new HomeError('请选择有效的小屋备份。');
      const d=p.data;mergeFeatureBackup(s,d,member,now);
      if(!Array.isArray(d.names)||d.names.length!==2)throw new HomeError('备份中的名字无效。');
      const importedNames=d.names.map(x=>string(x,15)),importedStart=date(d.start,true);
      if(importedStart>sharedToday(now))throw new HomeError('备份中的恋爱日期在未来。');
      if(!s.start){s.names=importedNames;s.start=importedStart;s.intro=typeof d.intro==='string'?d.intro.slice(0,100):'';}
      if(d.moods&&typeof d.moods==='object'&&!Array.isArray(d.moods)){
        if(Object.keys(d.moods).length>10000)throw new HomeError('心情记录过多。');
        for(const [day,values]of Object.entries(d.moods)){date(day);if(!values||typeof values!=='object')throw new HomeError('心情记录无效。');for(const slot of [1,2])if(values[slot]!==undefined){if(!['晴朗','想你','平静','需要抱抱'].includes(values[slot]))throw new HomeError('心情记录无效。');s.moods[day]||={};if(s.moods[day][slot]===undefined)s.moods[day][slot]=values[slot]}}
      }
      const imported=initialState(now);imported.names=s.names;
      const types={stories:'story.add',wishes:'wish.add',letters:'letter.add',anniversaries:'anniversary.add'};
      let merged=imported;
      for(const [key,type]of Object.entries(types)){
        if(!Array.isArray(d[key])||d[key].length>500)throw new HomeError('备份记录格式无效。');
        for(const row of d[key]){
          if(key==='letters'&&row.locked)continue;
          if(s[key].some(x=>key==='stories'?x.title===row.title&&x.date===row.date&&x.text===row.text:key==='wishes'?x.text===row.text:key==='letters'?x.text===row.text&&x.author===row.author:x.title===row.title&&x.date===row.date))continue;
          merged=applyOperation(merged,{id:crypto.randomUUID(),kind:type,payload:{...row,id:crypto.randomUUID()}},member,now);
          if(key==='wishes'){merged.wishes[merged.wishes.length-1].done=!!row.done;if(Number.isFinite(row.completedAt)&&row.completedAt>=0)merged.wishes[merged.wishes.length-1].completedAt=row.completedAt;}
          if(key==='letters'&&row.date)merged.letters[merged.letters.length-1].date=date(row.date);
        }
        if(s[key].length+merged[key].length>500)throw new HomeError('合并后的记录太多，请分批导入。');
        s[key].push(...merged[key]);
      }
      for(const idea of s.dateIdeas.filter(x=>(d.dateIdeas||[]).some(y=>y.id===x.id))){if(idea.storyId&&!s.stories.some(x=>x.id===idea.storyId)){const source=d.stories.find(x=>x.id===idea.storyId),target=source&&s.stories.find(x=>x.title===source.title&&x.text===source.text&&x.date===source.date);idea.storyId=target?.id||''}}
      break;
    }
    default:if(!applyFeatureOperation(s,op,member,now))throw new HomeError('不支持这个操作。');
  }
  return s;
}
export function restoreState(data,member,now=Date.now()) {
 if(!data||data.v!==2||!data.pet)throw new HomeError('完整恢复需要新版完整备份。');
 let next=applyOperation(initialState(now),{kind:'settings',payload:data},member,now);
 next=applyOperation(next,{kind:'import',payload:{data}},{...member,canManageSharedImport:true},now);
 const moods={};if(data.moods&&typeof data.moods==='object'&&!Array.isArray(data.moods)){
  if(Object.keys(data.moods).length>10000)throw new HomeError('心情记录过多。');
  for(const [day,values]of Object.entries(data.moods)){date(day);if(!values||typeof values!=='object')throw new HomeError('心情记录格式无效。');moods[day]={};for(const slot of [1,2])if(values[slot]!==undefined){if(!['晴朗','想你','平静','需要抱抱'].includes(values[slot]))throw new HomeError('心情记录无效。');moods[day][slot]=values[slot]}}
 }else throw new HomeError('心情备份无效。');next.moods=moods;
 const p=data.pet;next=applyOperation(next,{kind:'pet.settings',payload:{name:p.name,petKind:p.kind,color:p.color,...(p.stages!==undefined?{stages:p.stages}:{})}},member,now);
 for(const key of ['fullness','happiness','energy','xp','bornAt','updatedAt','sleepingUntil'])if(!Number.isFinite(p[key])||p[key]<0)throw new HomeError('宠物状态无效。');
 if(p.xp>100000000||p.bornAt>now||p.updatedAt>now||p.sleepingUntil>now+86400000||['fullness','happiness','energy'].some(k=>p[k]>100))throw new HomeError('宠物状态超出有效范围。');
 if(!Array.isArray(p.careLog)||p.careLog.length>200)throw new HomeError('照顾日记无效。');
 next.pet={...next.pet,...Object.fromEntries(['fullness','happiness','energy','xp','bornAt','updatedAt','sleepingUntil'].map(k=>[k,p[k]])),cooldowns:{},duet:null,careLog:p.careLog.map(l=>{if(!['feed','play','pet','sleep','duet'].includes(l.action)||![1,2].includes(l.slot)||!Number.isFinite(l.at)||l.at<0||l.at>now)throw new HomeError('照顾日记无效。');return{id:itemId(l.id),action:l.action,actor:string(l.actor,40),slot:l.slot,at:l.at}})};
 const features=validateFeatureBackup(data,member,now);for(const key of ['daily','dateIdeas','calendar','coupons','corners'])next[key]=features[key];next.pet.room=features.pet.room;for(const idea of next.dateIdeas){if(idea.storyId){const source=data.stories.find(x=>x.id===idea.storyId),target=source&&next.stories.find(x=>x.title===source.title&&x.text===source.text&&x.date===source.date);idea.storyId=target?.id||''}}if(data.dateDraw&&features.dateIdeas.some(x=>x.id===data.dateDraw.id))next.dateDraw={id:data.dateDraw.id,at:Number.isFinite(data.dateDraw.at)?data.dateDraw.at:now,by:[1,2].includes(data.dateDraw.by)?data.dateDraw.by:1};return next;
}
export function publicState(s,now=Date.now(),slot=0) {
  const out=structuredClone(s);out.pet=petNow(out.pet,now);delete out.pet.cooldowns;
  out.letters=out.letters.map(l=>l.openDate&&l.openDate>sharedToday(now)?{...l,text:'',locked:true}:{...l,locked:false});
  return featurePublicState(out,slot,now);
}
