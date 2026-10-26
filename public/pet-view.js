(function (global) {
  const stage = xp => xp < 200 ? 'baby' : xp < 500 ? 'young' : 'grown';
  const clamp = n => Math.max(20, Math.min(100, Math.round(n)));
  function project(p, now = Date.now()) {
    const hours = Math.max(0, (now - p.updatedAt) / 3600000);
    const sleepHours = Math.max(0, (Math.min(now, p.sleepingUntil) - p.updatedAt) / 3600000);
    return {...p, fullness: clamp(p.fullness - hours * 1.6), happiness: clamp(p.happiness - hours * .9), energy: clamp(p.energy - hours * .6 + sleepHours * 60)};
  }
  function motion(p, now = Date.now()) {
    if (p.sleepingUntil > now) return 'sleep';
    const last = p.careLog?.[0];
    if (last && now >= last.at && now - last.at < 5500 && ['feed', 'play', 'pet', 'duet'].includes(last.action)) return last.action;
    return p.energy < 45 ? 'tired' : p.fullness < 45 ? 'hungry' : p.happiness < 45 ? 'lonely' : 'idle';
  }
  const escape = text => String(text || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function art(p) {
    const age = stage(p.xp), baby = age === 'baby', young = age === 'young', rabbit = p.kind === 'bunny';
    const [fur, light, dark] = ({cream:['#e9c49a','#fff0d7','#c39b73'],rose:['#dfb8ab','#ffe9dc','#bc8f87'],sage:['#c3c8a4','#f0f1da','#98a780']})[p.color] || ['#e9c49a','#fff0d7','#c39b73'];
    const headY = baby ? 126 : young ? 108 : 98, headX = baby ? 49 : young ? 51 : 46, headH = baby ? 42 : 39;
    const bodyY = baby ? 179 : young ? 170 : 161, bodyX = baby ? 39 : young ? 49 : 57, bodyH = baby ? 30 : young ? 39 : 48;
    const ears = rabbit
      ? `<ellipse cx="99" cy="${headY-48}" rx="${baby?10:12}" ry="${baby?25:young?38:48}" transform="rotate(-13 99 ${headY-48})"/><ellipse cx="141" cy="${headY-48}" rx="${baby?10:12}" ry="${baby?25:young?38:48}" transform="rotate(13 141 ${headY-48})"/>`
      : `<path d="M${120-headX+5} ${headY-8}L${120-headX+6} ${headY-(baby?51:young?61:66)}Q${120-headX+9} ${headY-(baby?57:67)} ${120-headX+16} ${headY-(baby?49:57)}L103 ${headY-28}M137 ${headY-28}L${120+headX-16} ${headY-(baby?49:57)}Q${120+headX-9} ${headY-(baby?57:67)} ${120+headX-6} ${headY-(baby?51:young?61:66)}L${120+headX-5} ${headY-8}"/>`;
    const accessory = baby
      ? `<path d="M100 ${headY+35}q20 10 40 0l-10 27h-20Z" fill="#f2c6ac"/><path d="M118 ${headY+45}h5m-2-3v6" stroke="#fff7e9" stroke-width="2"/>`
      : young ? `<path d="M94 ${headY+34}q26 12 52 0l-24 28Z" fill="#a5b7a0"/><circle cx="122" cy="${headY+48}" r="3" fill="#ffedc8"/>`
      : `<path d="M94 ${headY+34}q26 12 52 0" fill="none" stroke="#ae7f69" stroke-width="6"/><circle cx="121" cy="${headY+45}" r="7" fill="#e5bd6f"/><path d="M121 ${headY+41}v6" stroke="#a88852" stroke-width="2"/>`;
    return `<svg viewBox="0 0 240 230" role="img" aria-label="${escape(p.name)}，${({baby:'幼年',young:'少年',grown:'成年'})[age]}${rabbit?'小兔':'小猫'}" data-growth="${age}"><ellipse cx="121" cy="212" rx="64" ry="8" fill="#8d705624"/><g class="pet-body"><g fill="${fur}" stroke="${dark}" stroke-width="2"><path class="pet-tail" d="M${120+bodyX-8} 188Q210 204 207 174Q205 159 196 170Q192 183 173 179" ${rabbit?'visibility="hidden"':''}/><ellipse cx="120" cy="${bodyY}" rx="${bodyX}" ry="${bodyH}"/>${ears}</g><ellipse cx="120" cy="${bodyY+7}" rx="${bodyX*.55}" ry="${bodyH*.7}" fill="${light}"/><ellipse cx="120" cy="${headY}" rx="${headX}" ry="${headH}" fill="${fur}" stroke="${dark}" stroke-width="2"/><path d="M108 ${headY-headH+3}l3 10M121 ${headY-headH}v11M134 ${headY-headH+3}l-3 10" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><g class="pet-eyes" fill="#695448"><ellipse cx="99" cy="${headY+1}" rx="${baby?5:4}" ry="${baby?7:6}"/><ellipse cx="141" cy="${headY+1}" rx="${baby?5:4}" ry="${baby?7:6}"/><circle cx="100" cy="${headY-1}" r="1.6" fill="white"/><circle cx="142" cy="${headY-1}" r="1.6" fill="white"/></g><g class="sleep-eyes" fill="none" stroke="#84674f" stroke-width="2.5" stroke-linecap="round"><path d="M93 ${headY+3}q6-6 12 0M135 ${headY+3}q6-6 12 0"/></g><ellipse cx="85" cy="${headY+13}" rx="10" ry="5" fill="#e8a99c" opacity=".65"/><ellipse cx="155" cy="${headY+13}" rx="10" ry="5" fill="#e8a99c" opacity=".65"/><path d="M115 ${headY+10}q5-4 10 0l-5 5Z" fill="#b68176"/><path class="pet-mouth" d="M120 ${headY+15}q-4 8-10 2m10-2q4 8 10 2" fill="none" stroke="#94715e" stroke-width="2" stroke-linecap="round"/>${accessory}<ellipse cx="${120-bodyX+13}" cy="205" rx="${baby?15:20}" ry="9" fill="${light}" stroke="${dark}"/><ellipse cx="${120+bodyX-13}" cy="205" rx="${baby?15:20}" ry="9" fill="${light}" stroke="${dark}"/></g><g aria-hidden="true" class="pet-effect effect-sleep" fill="#9b8eae"><text x="173" y="82" font-size="22">z</text><text x="193" y="59" font-size="17">z</text></g><g aria-hidden="true" class="pet-effect effect-feed"><ellipse cx="118" cy="215" rx="27" ry="8" fill="#b78065"/><path d="M94 205h48l-5 12h-38Z" fill="#e1b090"/><circle cx="110" cy="204" r="4" fill="#996a4d"/><circle cx="125" cy="203" r="4" fill="#996a4d"/></g><g aria-hidden="true" class="pet-effect effect-play"><circle cx="191" cy="196" r="14" fill="#eab99d"/><path d="M179 192l24 8m-17-17l8 26" stroke="#fff0d7" stroke-width="3"/></g><g aria-hidden="true" class="pet-effect effect-pet" fill="#c99390"><text x="177" y="95" font-size="25">♡</text></g></svg>`;
  }
  global.LittleDaysPetView = {stage, project, motion, art};
})(typeof window === 'undefined' ? globalThis : window);
