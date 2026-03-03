const $ = (id) => document.getElementById(id);

function esc(s){
  return (s||'').toString().trim();
}

function build(){
  const theme = $('theme').value;
  const cred = esc($('cred').value);
  const reach = esc($('reach').value);
  const constraint = $('constraint').value;
  const hate = esc($('hate').value);
  const examples = esc($('examples').value);

  const ctx = { theme, cred, reach, constraint, hate, examples };

  const presets = {
    watchtower: {
      name: 'WatchTower Pulse',
      icp: [
        'MSPs with 5–50 employees',
        'No dedicated SOC / analyst coverage',
        'Alert fatigue + client comms pain',
      ],
      oneLiner: 'A daily/weekly security pulse your clients understand — without drowning your techs.',
      deliverable: 'Daily “Client Pulse” email + weekly exec summary + a short “what to do next” list',
      prototype: 'Manual v0: you run the pulse using existing tools + templates; deliver via email/Google Doc',
      pricing: ['$499/mo Starter (up to 10 endpoints)', '$1,499/mo Pro (multi-client + weekly QBR pack)'],
      metric: 'Time saved per week + fewer escalations + higher renewal confidence',
    },
    hwcc: {
      name: 'HWCC',
      icp: [
        'Parents with 2+ kids',
        'Drowning in school email + apps',
        'Needs “what matters this week” in one place',
      ],
      oneLiner: 'A calm weekly homework + events command center built from school emails.',
      deliverable: 'Weekly dashboard + kid-mode checklist + “ask parent” items',
      prototype: 'Manual v0: forward school emails to a label; you ship a weekly summary page',
      pricing: ['$9/mo family', '$49/yr family (2 months free)'],
      metric: 'Fewer missed deadlines + less nightly chaos',
    },
    stella: {
      name: 'AI at Work — Without the Risk',
      icp: [
        'Small teams that want AI but fear data leaks',
        'No time to test 20 tools',
        'Needs practical SOPs + guardrails',
      ],
      oneLiner: 'A playbook + templates to deploy AI safely in a week.',
      deliverable: 'Templates: policy, prompts, intake forms, review checklists + 2 guided workflows',
      prototype: 'Ship tonight: landing + Gumroad + 3 templates + 1 walkthrough video later',
      pricing: ['$49 playbook', '$199 team pack'],
      metric: 'Less risk + faster adoption',
    }
  };

  const p = presets[theme];

  const nicheOptions = theme === 'watchtower'
    ? [
        {niche:'MSPs serving law firms', pain:'partners demand plain-English security updates', hook:'Client-ready weekly security brief', proof:'reduces “what did you do for us?” churn'},
        {niche:'MSPs serving dentists', pain:'HIPAA anxiety + ransomware fear', hook:'Ransomware-readiness pulse', proof:'turns controls into a simple score'},
        {niche:'MSPs serving manufacturers', pain:'OT/IT gaps + phishing risk', hook:'Attack surface pulse + top 3 fixes', proof:'reduces preventable incidents'},
      ]
    : theme === 'hwcc'
      ? [
          {niche:'Parents of ADHD-ish kids', pain:'executive function load', hook:'one board, tiny steps', proof:'less nightly conflict'},
          {niche:'Sports-heavy families', pain:'schedule chaos', hook:'week grid + travel packing prompts', proof:'fewer misses'},
          {niche:'Two-working-parent households', pain:'handoff failures', hook:'one source of truth', proof:'fewer “did you do it?” loops'},
        ]
      : [
          {niche:'Agencies handling client data', pain:'AI fear + pressure to move fast', hook:'safe AI SOP kit', proof:'ship faster without leaks'},
          {niche:'Ops teams in regulated SMBs', pain:'process + audits', hook:'AI workflows with review gates', proof:'audit-friendly adoption'},
          {niche:'Founders doing everything', pain:'context switching', hook:'AI assistant operating model', proof:'more output per day'},
        ];

  const pick = nicheOptions[0];

  const offer = {
    who: pick.niche,
    pain: pick.pain,
    hook: pick.hook,
    promise: `In 7 days: ${pick.hook} that ${pick.proof}.`,
    deliver: p.deliverable,
    guarantee: theme === 'watchtower' ? 'Cancel anytime; first report free if you hate it.' : '7-day refund.',
  };

  const outbound = buildOutbound(theme, offer);

  const buildPlan = [
    `THEME: ${p.name}`,
    '',
    '1) Pick the lead (1 niche, not 10)',
    `   Default pick: ${offer.who}`,
    `   Their pain: ${offer.pain}`,
    `   Hook: ${offer.hook}`,
    '',
    '2) Offer (sell results, not “AI”)',
    `   One-liner: ${p.oneLiner}`,
    `   Promise: ${offer.promise}`,
    `   Deliverable: ${offer.deliver}`,
    `   Guarantee: ${offer.guarantee}`,
    '',
    '3) Pricing (don’t overthink tonight)',
    ...p.pricing.map(x=>`   - ${x}`),
    '',
    '4) Prototype scope (what you ship tonight)',
    `   - Landing page + clear CTA (“Reply YES / Book call / Buy”)`,
    `   - 1 sample deliverable (PDF/email) that looks real`,
    `   - 10 outbound messages (below)`,
    `   - A simple intake form (Google Form)`,
    '',
    '5) 60-minute validation loop (tomorrow morning)',
    `   - Send 10 messages`,
    `   - Ask for 15 minutes + show sample`,
    `   - Goal: 2 replies, 1 call booked`,
    '',
    'NOTES',
    cred ? `- Your credibility: ${cred}` : '- Your credibility: (add 1 line)',
    reach ? `- Who you can reach today: ${reach}` : '- Who you can reach today: (add 1 line)',
    hate ? `- You hate doing: ${hate} (so bake this into the promise)` : '- You hate doing: (add 1 line)',
    examples ? `- Example customers: ${examples}` : '- Example customers: (optional)',
    `- Constraint: ${constraint}`,
    '',
    '10 OUTBOUND MESSAGES (copy/paste)',
    ...outbound.map((m,i)=>`(${i+1}) ${m}`)
  ].join('\n');

  $('out').textContent = buildPlan;
  $('copy').disabled = false;

  return buildPlan;
}

function buildOutbound(theme, offer){
  const base = theme === 'watchtower'
    ? {
        opener: `Quick question — do you already send clients a plain-English security pulse each week?`,
        pitch: `I’m piloting a ${offer.hook} for ${offer.who}. It’s a client-ready brief + top 3 fixes so you look proactive without extra tech time.`,
        ask: `If I sent you a 1-page sample, would you tell me if it’s useful?`,
      }
    : theme === 'hwcc'
      ? {
          opener: `Quick question — what do you do with all the school emails/app notifications?`,
          pitch: `I’m testing a “weekly homework + events command center” for ${offer.who}. One page, kid checklists, fewer surprises.`,
          ask: `Want me to generate a sample week from a few forwarded emails?`,
        }
      : {
          opener: `Quick question — are you using AI at work yet, or still avoiding it because of risk?`,
          pitch: `I’m shipping a “AI at Work — without the risk” kit: policy + templates + workflows with review gates for ${offer.who}.`,
          ask: `If I send the 1-page outline, would you sanity-check it?`,
        };

  const msgs = [
    `${base.opener}`,
    `${base.pitch} ${base.ask}`,
    `This is super small: 1 deliverable, no platform. ${base.ask}`,
    `If you’re open: I’ll send a sample report in the next hour. No pitch — just feedback.`,
    `Who handles this today — you or someone else?`,
    `If you could wave a wand: what would the perfect ${offer.hook.toLowerCase()} include?`,
    `I’m keeping pricing simple. If it saved you ~2 hours/week, is $499/mo crazy or reasonable?`,
    `If not a fit, could you point me to 1 other ${offer.who} who’d hate this problem?`,
    `One-liner: ${offer.promise} Interested in a sample?`,
    `I can stop bugging you after this: should I send the sample, or is this a “not now”?`
  ];

  return msgs;
}

$('build').addEventListener('click', ()=> build());
$('copy').addEventListener('click', async ()=>{
  const text = $('out').textContent;
  await navigator.clipboard.writeText(text);
  $('copy').textContent = 'Copied';
  setTimeout(()=> $('copy').textContent = 'Copy output', 900);
});
