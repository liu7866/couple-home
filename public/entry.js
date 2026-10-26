// Standalone server onboarding and administrator-owned login labels.
window.LittleDaysEntry = {
 identityNames:['成员一','成员二'],
 applyNames(names){
  if(!Array.isArray(names)||names.length!==2||names.some(x=>typeof x!=='string'))return;
  this.identityNames=names;
  const select=document.querySelector('#login-slot');
  if(select)for(const option of select.options)option.textContent=names[Number(option.value)-1]||'小屋成员';
 },
 async start(){
  loginRequired=true;
  try{
   const entry=await api('/api/entry');this.applyNames(entry.identityNames);this.showEntryActions(entry);
   if(entry.setupRequired){this.showSetup(entry.requiresSetupCode);return}
   document.querySelector('#entry-help').textContent='身份名称可由管理员在小屋设置中修改。';
   loginRequired=false;await sync(true);
  }catch(error){document.querySelector('#login-note').textContent=error.message;showConnectionRetry(true)}
 },
 showEntryActions(entry){
  let actions=document.querySelector('#entry-actions');
  if(!actions){actions=document.createElement('div');actions.id='entry-actions';actions.className='entry-actions';document.querySelector('#key-login-form').before(actions)}
  actions.replaceChildren();
  const status=document.createElement('p');status.className='entry-state';status.textContent=entry.setupRequired?'首次使用 · 先设置两位成员的密码':'已有小屋 · 请选择身份并登录';actions.append(status);
  if(!entry.setupRequired){
   const button=document.createElement('button');button.type='button';button.className='outline';button.id='entry-password-settings';button.textContent='设置 / 找回密码 ↗';
   button.onclick=()=>this.passwordHelp();actions.append(button);
  }
 },
 passwordHelp(){
  modal('设置或找回登录密码', '<p class="form-help">这个小屋已经创建，不能在未验证身份时覆盖原有密码。</p><p class="form-help">已登录的管理员可以在「布置小屋 → 双人设置 → 密码与恢复码」中设置成员密码。忘记密码时，可以使用提前保存的恢复码。</p><div class="backup-actions"><button type="button" class="primary" id="entry-use-recovery">使用恢复码设置新密码 ↗</button></div>');
  document.querySelector('#entry-use-recovery').onclick=()=>{close();document.querySelector('#forgot-password').click()};
 },
 showSetup(requiresCode){
  document.body.classList.add('home-locked');
  document.querySelector('#login-gate').hidden=false;
  document.querySelector('#key-login-form').hidden=true;
  document.querySelector('#forgot-password').hidden=true;
  document.querySelector('#login-note').textContent='成员一拥有管理员权限。请为两位成员分别设置密码。';
  document.querySelector('.key-login-card h1').innerHTML='给我们的小屋，<br><span>设置两把钥匙。</span>';
  document.querySelector('#entry-help').textContent='创建后可在设置中自定义两种身份的名称。';
  let setup=document.querySelector('#setup-form');
  if(!setup){setup=document.createElement('form');setup.id='setup-form';document.querySelector('#key-login-form').after(setup)}
  const password=(label,name)=>`<label for="${name}">${label}</label><input id="${name}" name="${name}" type="password" required minlength="6" maxlength="128" autocomplete="new-password" placeholder="6 至 128 个字符">`;
  setup.innerHTML=(requiresCode?'<label for="setup-code">小屋初始化码</label><input id="setup-code" name="code" required maxlength="128" autocomplete="off" placeholder="由部署者提供">':'')+
   password('成员一的密码（管理员）','setup-password1')+password('确认成员一的密码','setup-confirm1')+
   password('成员二的密码','setup-password2')+password('确认成员二的密码','setup-confirm2')+
   '<p class="form-help">成员一是管理员。创建后会进入小屋设置，可修改名字、身份名称和纪念日。</p><button class="primary" type="submit">设置密码，进入小屋设置 ↗</button>';
  setup.onsubmit=async event=>{
   event.preventDefault();const button=setup.querySelector('button[type=submit]');button.disabled=true;
   const note=document.querySelector('#login-note'),data=new FormData(setup);
   const passwords=[data.get('setup-password1'),data.get('setup-password2')],confirmations=[data.get('setup-confirm1'),data.get('setup-confirm2')];
   try{
    if(passwords.some((value,index)=>value!==confirmations[index]))throw new Error('请确认两位成员各自的密码，两次输入需要一致。');
    note.textContent='正在为你们准备小屋……';
    await api('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passwords,confirmations,code:data.get('code')||''})});
    setup.reset();setup.remove();document.querySelector('#key-login-form').hidden=false;document.querySelector('#forgot-password').hidden=false;
    loginRequired=false;await refreshNow();editSettings();toast('密码已设置，现在来布置你们的小屋 ♡');
   }catch(error){note.textContent=error.message;if(error.status===409){setup.reset();location.reload();}}
   finally{button.disabled=false}
  };
 },
 attachSettings(){
  if(!me?.canManagePasswords)return;
  const button=document.createElement('button');button.type='button';button.id='edit-identities';button.className='outline';button.textContent='修改身份名称 ↗';
  button.onclick=()=>{if(requestModalClose())this.editNames()};
  document.querySelector('#modal-content .backup-actions').prepend(button);
 },
 editNames(){
  if(!me?.canManagePasswords)return;
  modal('自定义登录身份');
  form(field('成员一的身份名称','identity1','text',this.identityNames[0],'required maxlength="20"')+
   field('成员二的身份名称','identity2','text',this.identityNames[1],'required maxlength="20"')+
   '<p class="form-help">名称会显示在登录页。只改显示名称，不改变密码、个人名字、回忆或管理员归属。</p>',async data=>{
    const result=await api('/api/identities',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({identityNames:[data.get('identity1'),data.get('identity2')]})});
    this.applyNames(result.identityNames);await refreshNow();close();toast('登录身份名称已更新 ♡');
   });
 },
};
