/**
 * 海龟汤智能裁判引擎
 * 支持：1. 离线/内置智能规则匹配 (Mock Mode) + 16卷绝密庄园古卷库
 *       2. 真实大模型 API 模式 (OpenAI兼容接口，如 DeepSeek、Kimi、Gemini、智谱等)
 *       3. 自动化服务端代理 (解决浏览器端直接请求的 CORS 跨域问题)
 */

export async function judgeQuestion({ soup, question, unlockedClueIds, apiConfig }) {
  // 如果用户配置了大模型 API 且开启了真实 AI 模式
  if (apiConfig && apiConfig.enabled && apiConfig.apiKey) {
    try {
      return await callLLMJudge({ soup, question, unlockedClueIds, apiConfig });
    } catch (err) {
      console.warn('调用大模型失败，自动降级为本地裁判规则:', err);
      // 降级回本地规则并加上提示
      const fallbackResult = localJudgeRule({ soup, question, unlockedClueIds });
      fallbackResult.dmComment = `(API暂时异常[${(err.message || '').slice(0, 20)}]，已转本地裁判) ${fallbackResult.dmComment}`;
      return fallbackResult;
    }
  }

  // 默认使用本地智能判定规则
  return localJudgeRule({ soup, question, unlockedClueIds });
}

/**
 * 本地智能规则判定器
 */
function localJudgeRule({ soup, question, unlockedClueIds }) {
  const normalizedQ = question.trim().toLowerCase();
  const cluesList = Array.isArray(soup.clues) ? soup.clues : [];

  // 1. 检查是否命中线索的专属关键词（即使 mockRules 没写完整，只要线索 keywords 命中也触发）
  let newUnlockedClue = null;
  for (const clue of cluesList) {
    if (!unlockedClueIds.includes(clue.id) && Array.isArray(clue.matchKeywords)) {
      const isMatch = clue.matchKeywords.some(kw => normalizedQ.includes(kw.toLowerCase()));
      if (isMatch) {
        newUnlockedClue = clue;
        break;
      }
    }
  }

  // 2. 检查具体的 mockRules 预设问答（做防御性容错，兼容 AI 创编案件）
  const mockRules = Array.isArray(soup.mockRules) ? soup.mockRules : [];
  for (const rule of mockRules) {
    if (!rule || !Array.isArray(rule.keys)) continue;
    const isHit = rule.keys.some(k => normalizedQ.includes(k.toLowerCase()));
    if (isHit) {
      let triggerClueObj = null;
      if (rule.triggerClue && !unlockedClueIds.includes(rule.triggerClue)) {
        triggerClueObj = cluesList.find(c => c.id === rule.triggerClue);
      } else if (newUnlockedClue) {
        triggerClueObj = newUnlockedClue;
      }

      return {
        judgment: rule.answer || '是',
        dmComment: rule.comment || '庄园主冷眼凝视着你，微微颔首。',
        newClue: triggerClueObj,
        isCustom: false
      };
    }
  }

  // 3. 如果命中未解锁线索，但没有命中特定否定规则，默认是肯定并点亮线索
  if (newUnlockedClue) {
    return {
      judgment: '是',
      dmComment: `直觉很准！你察觉到了关于【${newUnlockedClue.title}】的蛛丝马迹。`,
      newClue: newUnlockedClue,
      isCustom: false
    };
  }

  // 4. 常见通用问题模糊匹配
  if (normalizedQ.includes('人') || normalizedQ.includes('男') || normalizedQ.includes('谁')) {
    return {
      judgment: '是',
      dmComment: '在这个情境中，角色的特征是非常重要的。',
      newClue: null
    };
  }

  if (normalizedQ.includes('鬼') || normalizedQ.includes('外星人') || normalizedQ.includes('超自然') || normalizedQ.includes('魔法')) {
    return {
      judgment: '否',
      dmComment: '这是一个现实世界发生的故事，没有怪力乱神。',
      newClue: null
    };
  }

  // 默认兜底：视作提问方向无关或需换个角度
  return {
    judgment: '无关',
    dmComment: '这个细节与事件的根本核心关联不大，试着从主角的身份或异常动机切入？',
    newClue: null
  };
}

/**
 * 玩家尝试提交“真相结算”的评估判定
 */
export async function evaluateTruthAttempt({ soup, attemptText, unlockedClueIds, apiConfig }) {
  if (apiConfig && apiConfig.enabled && apiConfig.apiKey) {
    try {
      return await callLLMTruthEvaluation({ soup, attemptText, apiConfig });
    } catch (e) {
      console.warn('API评估失败，回退到本地关键词打分:', e);
    }
  }

  // 本地打分算法：统计玩家文本中命中各个线索关键词的比例
  let matchedClueCount = 0;
  for (const clue of soup.clues) {
    const isHit = clue.matchKeywords.some(kw => attemptText.includes(kw));
    if (isHit || unlockedClueIds.includes(clue.id)) {
      matchedClueCount++;
    }
  }

  const score = Math.min(100, Math.round((matchedClueCount / soup.clues.length) * 100));
  const passed = score >= 75;

  return {
    score,
    passed,
    summary: passed
      ? '精彩绝伦的推理！你已经基本还原了事件的全部真相！'
      : `还差一点点（当前还原度 ${score}%），关键情节可能还有拼图未补全，请继续提问缩小范围！`
  };
}

/**
 * 统一的大模型请求器（优先走同源代理 /api/llm/proxy 规避浏览器 CORS 跨域拦截）
 */
async function postToLLM({ endpoint, apiKey, body, timeoutMs = 25000 }) {
  const isBrowser = typeof window !== 'undefined';

  // 1. 优先尝试本地同源代理（彻底解决浏览器端直接调用第三方的 CORS 拦截问题）
  if (isBrowser) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const proxyRes = await fetch('/api/llm/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, apiKey, body }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await proxyRes.json();
      if (!proxyRes.ok) {
        const errMsg = data.error?.message || `Proxy 转发异常 HTTP ${proxyRes.status}`;
        throw new Error(errMsg);
      }
      return data;
    } catch (proxyErr) {
      // 若代理明确报错（如 API 密钥无效、模型不存在），直接向外抛出
      if (proxyErr.message && !proxyErr.message.includes('404') && !proxyErr.message.includes('Failed to fetch')) {
        throw proxyErr;
      }
      console.warn('本地代理不可达，尝试前端直连模式:', proxyErr.message);
    }
  }

  // 2. 直连兜底
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(apiKey || '').trim()}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || data.message || `API HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 调用远程大模型进行实时法官审判
 */
async function callLLMJudge({ soup, question, unlockedClueIds, apiConfig }) {
  const cluesPrompt = soup.clues.map(c => `- 线索ID ${c.id}: ${c.title} (${c.desc})`).join('\n');
  const unlockedPrompt = unlockedClueIds.length > 0 ? unlockedClueIds.join(', ') : '无';

  const systemPrompt = `你是一名专业、严谨、带有一点冷峻推理气氛的海龟汤游戏裁判。
【谜面】：${soup.question}
【真实完整真相】：${soup.truth}
【本局的关键线索清单】：
${cluesPrompt}
【玩家目前已解锁的线索ID】：${unlockedPrompt}

【规则约束】：
1. 根据玩家的问题和真实真相，给出判定，只能从以下4个词中选一个作为 judgment：
   - "是"
   - "否"
   - "无关"
   - "是也不是"
2. dm_comment 字段必须给出一段简短有氛围感的法官台词（不超过25字），绝对不能剧透！
3. 检查玩家本次提问是否推断出了某个【尚未解锁】的线索核心信息。如果有，在 new_unlocked_clue_id 中填入对应的数字ID（1~${soup.clues.length}），否则填 null。
4. 必须只输出严格合法的 JSON，不要包含 markdown 标记。格式如下：
{"judgment":"是","dm_comment":"法官旁白","new_unlocked_clue_id":null}`;

  const data = await postToLLM({
    endpoint: apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions',
    apiKey: apiConfig.apiKey,
    body: {
      model: apiConfig.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `玩家提问："${question}"` }
      ],
      temperature: 0.2
    },
    timeoutMs: 15000
  });

  const rawText = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '{}';
  const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

  let resObj = {};
  try {
    resObj = JSON.parse(cleaned);
  } catch (parseErr) {
    let looseJudgment = '是';
    if (cleaned.includes('是也不是')) looseJudgment = '是也不是';
    else if (cleaned.includes('否') || cleaned.includes('不是')) looseJudgment = '否';
    else if (cleaned.includes('无关')) looseJudgment = '无关';
    resObj = { judgment: looseJudgment, dm_comment: cleaned.slice(0, 30) };
  }

  let newClue = null;
  const clueId = resObj.new_unlocked_clue_id || resObj.newUnlockedClueId;
  if (clueId && !unlockedClueIds.includes(clueId)) {
    newClue = soup.clues.find(c => c.id === clueId);
  }

  return {
    judgment: resObj.judgment || '是',
    dmComment: resObj.dmComment || resObj.dm_comment || '庄园法官静默注视，在卷宗上划下一笔。',
    newClue: newClue,
    isCustom: true
  };
}

async function callLLMTruthEvaluation({ soup, attemptText, apiConfig }) {
  const systemPrompt = `你是一名海龟汤裁判。
【谜面】：${soup.question}
【真相】：${soup.truth}
玩家提交了他所推断的完整故事真相。请评估玩家还原的故事核心要素与真实真相的吻合度。
请以 JSON 格式输出：
{"score": 85, "passed": true, "summary": "评语"}
要求：如果核心关键情节都说对了，score给出80~100且passed为true；如果有重大偏差，score给对应百分比且passed为false。`;

  const data = await postToLLM({
    endpoint: apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions',
    apiKey: apiConfig.apiKey,
    body: {
      model: apiConfig.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `玩家的真相复盘："${attemptText}"` }
      ],
      temperature: 0.3
    },
    timeoutMs: 15000
  });

  const rawText = data.choices[0].message.content.trim().replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(rawText);
}

/**
 * 大模型现场编织全新海龟汤卷宗 (无限海龟汤生成器)
 */
export async function generateAICase({ theme = '随机未知', category = '细思极恐', apiConfig, existingTitles = [] }) {
  let llmError = null;

  if (apiConfig && apiConfig.enabled && apiConfig.apiKey) {
    try {
      const caseObj = await callLLMCaseGenerator({ theme, category, apiConfig });
      return {
        ...caseObj,
        isLiveLLM: true,
        llmError: null
      };
    } catch (err) {
      console.warn('大模型生成案卷失败，自动使用离线绝密宝库:', err);
      llmError = err.message || '网络连接超时或跨域拦截';
    }
  }

  // 离线备选奇谭生成（从16卷绝密宝库中去重抽取，绝不重复生成同名案件）
  const offlineCase = generateOfflineCase({ theme, category, existingTitles });
  return {
    ...offlineCase,
    isLiveLLM: false,
    llmError: llmError
  };
}

async function callLLMCaseGenerator({ theme, category, apiConfig }) {
  const caseId = 'ai_case_' + Date.now();
  const systemPrompt = `你是一名享誉世界的情境推理（海龟汤）设计大师与哥特悬疑小说家。
请为玩家创作一桩全新的、逻辑极其严密、反转震撼、绝无漏洞的海龟汤案件。

【创作要求】：
1. 风格类别：${category}，主题倾向：${theme}。
2. 谜面（汤面）：2-3句话，简短、离奇、充满悬念与反常行为，让人百思不得其解。
3. 真实真相（汤底）：因果逻辑严密、合乎情理但意料之外的完整故事（80-160字）。绝不能有超自然鬼怪，必须符合现实物理/心理逻辑。
4. 拆解4块关键疑团线索（clues，每个带有3-6个用于语义匹配的关键词matchKeywords）。
5. 提供3阶层层递进的思维灵感手记（hints），要求：
   - Level 1 (初级方向): 仅指出主角的社会身份、物理空间或动机视角，严禁任何直接剧透；
   - Level 2 (深度矛盾): 指出反常行为背后的逻辑矛盾与信息差；
   - Level 3 (破局发问): 提供一个建设性的发问切入方向。
6. 一句充满文学宿命感/讽刺感的结案哲学金句（quote）。

必须严格只输出合法的 JSON 对象，不要包含 markdown 标记代码块，格式如下：
{
  "id": "${caseId}",
  "title": "案卷名称 (4-8字，如《午夜人偶馆》)",
  "category": "${category}",
  "difficulty": "★★★★☆",
  "intro": "一句话暗黑氛围引入",
  "quote": "文学金句",
  "question": "汤面谜面",
  "truth": "完整故事真相",
  "hints": [
    { "level": 1, "title": "初级方向", "text": "隐喻思维方向" },
    { "level": 2, "title": "深度矛盾", "text": "逻辑矛盾核心" },
    { "level": 3, "title": "破局发问", "text": "启发性发问切入点" }
  ],
  "clues": [
    { "id": 1, "title": "线索1名称", "desc": "线索说明", "matchKeywords": ["关键词1", "关键词2"] },
    { "id": 2, "title": "线索2名称", "desc": "线索说明", "matchKeywords": ["关键词1", "关键词2"] },
    { "id": 3, "title": "线索3名称", "desc": "线索说明", "matchKeywords": ["关键词1", "关键词2"] },
    { "id": 4, "title": "线索4名称", "desc": "线索说明", "matchKeywords": ["关键词1", "关键词2"] }
  ],
  "isAICreated": true
}`;

  const data = await postToLLM({
    endpoint: apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions',
    apiKey: apiConfig.apiKey,
    body: {
      model: apiConfig.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请立即开始生成这桩《${theme}》主题的全新海龟汤！` }
      ],
      temperature: 0.8
    },
    timeoutMs: 25000
  });

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('大模型未返回有效文本');
  }

  const rawText = data.choices[0].message.content.trim();
  const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const caseObj = JSON.parse(cleaned);

  if (!caseObj.id) caseObj.id = caseId;
  caseObj.isAICreated = true;
  return caseObj;
}

/**
 * 庄园绝密古卷备选宝库（共16卷精妙海龟汤，涵盖细思极恐、荒诞哥特、反转硬核、温情反转）
 */
const OFFLINE_CASE_VAULT = [
  {
    title: '午夜收音机',
    category: '细思极恐',
    difficulty: '★★★☆☆',
    intro: '电流杂音的尽头，播放着来自明天的讣告。',
    quote: '人们常常恐惧未知，却不知道最恐怖的往往是不可更改的既定事实。',
    question: '老张独居在深山小屋，每天深夜都会准时打开老式收音机。某天深夜，收音机播完后，他微笑着躺在床上静静等待死亡。为什么？',
    truth: '老张是一名身患绝症晚期的护林员，深居与世隔绝的高山观测站。他收音机里收听的是山下大坝泄洪预警广播。当晚暴雨倾盆，收音机播报由于洪水过大下游数万人危在旦夕，唯一的办法是立即炸开上游水闸牺牲高山林区泄洪。老张知道水闸一开自己的小屋就会瞬间被滔天洪水吞没，但他心甘情愿为了拯救山下千千万万的村民而牺牲，平静地拥抱了生命的落幕。',
    suggestedQuestions: ['收音机播报了泄洪消息？', '老张是为了救下游村民？', '他身患绝症没有逃跑？', '小屋很快会被洪水吞噬？'],
    hints: [
      { level: 1, title: '初级方向', text: '探究老张的独居身份与深山地理位置之间的必然关联。' },
      { level: 2, title: '深度矛盾', text: '既然明知是死亡，为何他的神态不是惊恐而是“微笑”？' },
      { level: 3, title: '破局发问', text: '试着询问：“收音机播报的内容是否关乎很多人的生死？”' }
    ],
    clues: [
      { id: 1, title: '绝境中的使命', desc: '老张是高山观测站的护林员', matchKeywords: ['护林员', '独居', '深山', '工作', '大坝'] },
      { id: 2, title: '绝望的广播', desc: '收音机播报了即将炸闸泄洪的最高通报', matchKeywords: ['泄洪', '放水', '大水', '水库', '广播', '淹没'] },
      { id: 3, title: '生命的奉献', desc: '炸闸泄洪是为了保全下游成千上万条人命', matchKeywords: ['救人', '下游', '村庄', '牺牲', '成全'] },
      { id: 4, title: '坦然的离去', desc: '他本就身患绝症，微笑接受了崇高的牺牲', matchKeywords: ['生病', '绝症', '死得其所', '坦然', '微笑'] }
    ]
  },
  {
    title: '不存在的乘客',
    category: '荒诞哥特',
    difficulty: '★★★★☆',
    intro: '夜班末班车上，多出来的那位沉默旅人。',
    quote: '你以为你在审视镜子里的鬼怪，鬼怪却在哀悼已经死去的你。',
    question: '一辆午夜末班公交车上只有司机和一个女乘客。司机看了一眼后视镜突然猛踩刹车跳车狂逃，而女乘客看了一眼车门后也绝望地跳窗摔死。为什么？',
    truth: '司机在起步前突发急性脑溢血当场猝死，但在猝死前身体肌肉痉挛僵死，脚狠狠焊死在油门上导致公交车在盘山公路上失控狂飙。女乘客在后排看到司机在座位上一动不动（甚至头部以诡异角度耷拉着），以为被恶鬼附体，吓得跳窗摔死。司机其实早已断气，所谓的“猛踩刹车跳车狂逃”只是女乘客在惊恐狂乱中的幻觉。',
    suggestedQuestions: ['司机其实在起步前就已经猝死了？', '公交车当时处于失控狂飙状态？', '女乘客以为司机是鬼？', '跳窗是出于极度恐惧？'],
    hints: [
      { level: 1, title: '初级方向', text: '司机与女乘客谁才是正常清醒的活着的人？' },
      { level: 2, title: '深度矛盾', text: '高速运行的公交车，究竟是由谁的意愿在控制？' },
      { level: 3, title: '破局发问', text: '试着询问：“司机在车辆起步之后还是活着的吗？”' }
    ],
    clues: [
      { id: 1, title: '死去的驾驶员', desc: '司机早在车辆失控前就突发急病身亡了', matchKeywords: ['猝死', '死了', '生病', '脑溢血', '心脏病', '早已死'] },
      { id: 2, title: '失控的钢铁巨兽', desc: '公交车脚踏板被死者僵硬的脚卡死在高速状态', matchKeywords: ['卡死', '油门', '失控', '狂飙', '盘山路'] },
      { id: 3, title: '恐惧的误解', desc: '女乘客将死者的僵硬尸相误认作恶鬼', matchKeywords: ['鬼', '误会', '害怕', '以为是鬼', '吓坏'] },
      { id: 4, title: '致命的逃生', desc: '在极度恐慌中跳出高速行驶的车窗身亡', matchKeywords: ['跳窗', '摔死', '逃命', '绝望'] }
    ]
  },
  {
    title: '红雨伞下的男人',
    category: '细思极恐',
    difficulty: '★★★★☆',
    intro: '暴雨夜中那抹猩红，究竟拯救了谁？',
    quote: '视线的盲区带来恐惧，但真正的盲者却成了黑夜的引路人。',
    question: '暴雨如注的夜晚，一个男人打着一把猩红雨伞在泥泞的马路上缓缓独行。一辆疾驰的小车突然急刹在他身前，司机痛哭流涕地下车向他磕头谢恩。为什么？',
    truth: '雨夜中前方山路发生严重山体滑坡导致路面断裂成万丈深渊。打红雨伞的男人其实是个盲人，并不知道前方路塌了，只是由于失明步伐极度迟缓且雨伞鲜艳。疾驰的汽车司机在暴雨能见度极差的情况下，远远看到空中有一朵鲜红的雨伞极其显眼地缓慢移动，以为前方是施工警戒标志而下意识猛踩刹车停下。下车一看才发现车轮距离断崖仅差一步！盲人的红伞救了司机的命。',
    suggestedQuestions: ['撑伞的男人是盲人？', '前方道路发生了塌方或断崖？', '司机刹车是因为红伞太显眼以为是警示标志？', '男人并不知道自己救了人？'],
    hints: [
      { level: 1, title: '初级方向', text: '撑伞男人的身体感官是否存在特殊之处？' },
      { level: 2, title: '深度矛盾', text: '司机为什么会把一把普通的雨伞看作救命稻草？' },
      { level: 3, title: '破局发问', text: '试着询问：“前方道路是否已经无法正常通行？”' }
    ],
    clues: [
      { id: 1, title: '失明的引路人', desc: '撑伞的男人是一名毫无所知的盲人', matchKeywords: ['盲人', '瞎子', '看不见', '失明'] },
      { id: 2, title: '万丈深渊', desc: '前方道路在暴雨中发生断崖式崩塌', matchKeywords: ['断崖', '悬崖', '塌方', '滑坡', '断路'] },
      { id: 3, title: '猩红的警戒', desc: '红雨伞在狂风暴雨中被司机误认为是施工警示标志', matchKeywords: ['警示', '红色', '标志', '误判', '施工'] },
      { id: 4, title: '劫后余生', desc: '急刹车让汽车在深渊边缘停下，挽救了司机的生命', matchKeywords: ['刹车', '停下', '谢恩', '救命', '车轮'] }
    ]
  },
  {
    title: '第七层电梯',
    category: '反转硬核',
    difficulty: '★★★☆☆',
    intro: '他每天回家，总要多走十三层阴冷的楼梯。',
    quote: '物理的高度可以被机械代劳，但身高的界限唯有借助外力。',
    question: '小明住在高档公寓的20楼。每天下雨天或者电梯里有别人同行时，他可以直接乘电梯到20楼；但晴天且独自一人时，他只能乘电梯到7楼，再气喘吁吁爬13层楼梯回家。为什么？',
    truth: '小明是一名身材矮小的侏儒症患者（或者是身高不足一米的小男孩）。电梯按键面板是纵向排列的，以他的手臂长度最高只能触碰到第7层的按钮。下雨天他手里带了长柄雨伞，可以用雨伞尖戳到20楼的按键；有别人同行时他可以礼貌请求同乘者帮忙按20楼。',
    suggestedQuestions: ['小明的身高很矮？', '电梯按键的位置太高他够不着？', '雨天是因为有长柄雨伞可以戳按钮？', '有人同行可以请别人代按？'],
    hints: [
      { level: 1, title: '初级方向', text: '聚焦小明自身的生理体态特征与电梯物理面板设计。' },
      { level: 2, title: '深度矛盾', text: '雨天与有别人同行，这两者带给小明什么共同的物理辅助？' },
      { level: 3, title: '破局发问', text: '试着询问：“小明是否是身体长度限制了触及范围？”' }
    ],
    clues: [
      { id: 1, title: '受限的身高', desc: '小明身材极度矮小，手臂够不到高处的按钮', matchKeywords: ['矮', '小孩', '侏儒', '身高', '够不着'] },
      { id: 2, title: '雨伞的延伸', desc: '下雨天手中的长柄雨伞充当了延长的工具', matchKeywords: ['雨伞', '长柄', '戳', '触碰', '工具'] },
      { id: 3, title: '同伴的援手', desc: '有其他人时可以委托他人按键', matchKeywords: ['代按', '同乘', '帮助', '帮忙'] },
      { id: 4, title: '无奈的跋涉', desc: '无法触及20楼按钮时只能从7楼徒步爬楼', matchKeywords: ['7楼', '爬楼梯', '20楼', '按键'] }
    ]
  },
  {
    title: '雨夜滴水声',
    category: '细思极恐',
    difficulty: '★★★★☆',
    intro: '水龙头拧得再紧，也止不住头顶的滴答声。',
    quote: '当你以为你在凝视阴暗的角落，角落里的眼睛早已凝视了你数月。',
    question: '独居女子每晚入睡后总能隐约听到卫生间传来滴答滴答的水声。某天深夜她起床去关水龙头，出来后却连鞋都没穿，惊恐地夺门而逃并报了警。为什么？',
    truth: '女子走进卫生间发现水龙头完全是拧紧闭合的，洗手池干燥无比。而滴水声来自卫生间天花板通风管道的百叶窗缝隙——抬头望去，天花板隔层里正潜伏着一个潜入偷窥已久的变态连环杀手，那根本不是水声，而是杀手看到她进来时无法自控流下的口水和滴淌的冷汗！',
    suggestedQuestions: ['滴水声根本不是水龙头漏水？', '声音来自天花板顶棚？', '天花板上藏着一个活人？', '滴下来的是口水或汗水？'],
    hints: [
      { level: 1, title: '初级方向', text: '排查产生液体声响的真实源头是否来自于供水系统。' },
      { level: 2, title: '深度矛盾', text: '她看到洗手台是干燥的，视线自然会向上看去。' },
      { level: 3, title: '破局发问', text: '试着询问：“天花板上是否有未被发现的不速之客？”' }
    ],
    clues: [
      { id: 1, title: '干燥的水池', desc: '洗手台水龙头完好无损且没有任何漏水', matchKeywords: ['水龙头', '没开', '干燥', '完好'] },
      { id: 2, title: '头顶的视线', desc: '天花板通风吊顶藏着潜伏偷窥的恶魔', matchKeywords: ['天花板', '通风管', '吊顶', '藏人', '凶手'] },
      { id: 3, title: '活人的分泌物', desc: '声音实际上是偷窥者垂涎欲滴的涎水与冷汗', matchKeywords: ['口水', '唾液', '汗水', '不是水'] },
      { id: 4, title: '逃离魔窟', desc: '撞破恐怖真相后女子吓得仓皇赤足出逃', matchKeywords: ['报警', '逃跑', '吓坏', '夺门而出'] }
    ]
  },
  {
    title: '无声的披萨外卖',
    category: '反转硬核',
    difficulty: '★★★☆☆',
    intro: '一通莫名其妙的订餐电话，拉响了最高警报。',
    quote: '真正的智慧不是正面硬碰硬，而是在刀刃下织就隐秘的求救密网。',
    question: '深夜，警局接警调度中心接到一个女人的来电，对方语气平稳地坚持要点一份大号海鲜披萨送到特定家庭地址。接警员识破意图后，立即下令全副武装的特警封锁该住宅。为什么？',
    truth: '女人的家中潜入了持刀歹徒，歹徒用刀挟持了她并监视着她，威胁她不准报警。女人谎称肚子饿要用手机点外卖，并特意拨通了报警电话假装是在跟外卖员对话。经验丰富的接警员敏锐地察觉异常并询问“你是否处于无法自由说话的危险中？若是请回答披萨大小”，女人默契配合回答“是的大号”，成功在暴徒眼皮底下传递了被劫持的信息。',
    suggestedQuestions: ['女人的家里闯入了歹徒被挟持了？', '点披萨其实是隐蔽报警的伪装？', '接警员通过问答确认了她处于危险中？', '歹徒就在她旁边监视？'],
    hints: [
      { level: 1, title: '初级方向', text: '思考在什么极端环境下，一个人需要用日常琐事掩盖真实目的。' },
      { level: 2, title: '深度矛盾', text: '为什么她不能直接说“救命”，而必须说“点披萨”？' },
      { level: 3, title: '破局发问', text: '试着询问：“女人的身边当时是否有持凶器的人在监听？”' }
    ],
    clues: [
      { id: 1, title: '致命的挟持', desc: '持刀歹徒正在屋内心狠手辣地近距离监视女子', matchKeywords: ['歹徒', '挟持', '抢劫', '持刀', '监控'] },
      { id: 2, title: '机智的伪装', desc: '女子借订外卖为由拨通了紧急求救电话', matchKeywords: ['借口', '外卖', '伪装', '骗过', '演戏'] },
      { id: 3, title: '默契的密码', desc: '接警员通过双向暗号确认了对方的人身危险', matchKeywords: ['暗号', '密码', '识破', '察觉', '机警'] },
      { id: 4, title: '特警破门', desc: '警方迅速出警并将歹徒当场制服解救人质', matchKeywords: ['特警', '解救', '出警', '人质', '逮捕'] }
    ]
  },
  {
    title: '提线木偶的眼泪',
    category: '荒诞哥特',
    difficulty: '★★★★★',
    intro: '木偶在舞台上翩翩起舞，线的那头系着谁的灵魂？',
    quote: '人偶获得了复仇的生命，而创造它的人却永远留在了高悬的阴影里。',
    question: '老剧院的提线木偶戏演完后，观众早已散去。舞台上惟妙惟肖的“大师”突然亲手剪断了自己身上的所有提线，倒在一滩鲜血中。为什么？',
    truth: '在台上表演的根本不是大师本人，而是大师生前打造的高精度发条仿生人偶；真正的大师早在数周前就被剧场老板谋害并用钢丝吊死在剧场高高的穹顶阴暗处。发条人偶被大师临终前注入了复仇程序，在今晚完成对真凶的终极指控与处刑后，人偶自断操纵钢线自毁，穹顶大师悬挂已久的遗体也同时坠落到血泊中。',
    suggestedQuestions: ['台上动的是人偶还是真人？', '真正的大师其实已经死了？', '这是一场精心设计的复仇？', '大师的遗体悬挂在剧院穹顶？'],
    hints: [
      { level: 1, title: '初级方向', text: '重新审视舞台上“表演者”的生物学属性。' },
      { level: 2, title: '深度矛盾', text: '提线连接的上方究竟是控制者还是受害者？' },
      { level: 3, title: '破局发问', text: '试着询问：“真正的大师在戏开演前是否已经是一具尸体？”' }
    ],
    clues: [
      { id: 1, title: '仿生的人偶', desc: '在舞台上表演并剪线的是精密的发条人偶', matchKeywords: ['人偶', '机器', '发条', '假人', '玩偶'] },
      { id: 2, title: '高悬的亡魂', desc: '大师的遗体早在穹顶被凶手残忍吊死', matchKeywords: ['尸体', '上吊', '穹顶', '遇害', '谋杀'] },
      { id: 3, title: '死者的复仇', desc: '这场演出是大师生前设定好的复仇仪式', matchKeywords: ['复仇', '程序', '控告', '指证'] },
      { id: 4, title: '断裂的终局', desc: '剪断提线标志着复仇落幕与同归于尽', matchKeywords: ['自毁', '剪线', '坠落', '血泊'] }
    ]
  },
  {
    title: '盲人调琴师',
    category: '温情反转',
    difficulty: '★★★☆☆',
    intro: '走音的那半度音符，是跨越生死的重逢。',
    quote: '完美的音准属于乐器，不完美的瑕疵属于不可磨灭的思念。',
    question: '一位盲人调音师每次去一位孤独的老妇人家调钢琴，都会故意将其中一个低音键调偏低半个音节。老妇人试弹后每次都会泪流满面，并付给他双倍报酬。为什么？',
    truth: '老妇人唯一的儿子是一名在海战中为国捐躯的烈士。儿子生前酷爱弹琴，曾在那个特定琴键的击弦机里卡了一颗小弹壳，导致那个键弹出来总带有独特的走音共鸣。儿子牺牲后，老妇人只能凭那一声走音去回忆儿子的音容笑貌。调音师深知这一深情秘密，每次都细心将其他键调到标准音，唯独保留并复刻儿子的那枚特殊音符。',
    suggestedQuestions: ['故意调偏是为了保留某个特定的人留下的习惯？', '老妇人的亲人已经去世了？', '那个键有着特殊的纪念意义？', '付双倍报酬是出于感动？'],
    hints: [
      { level: 1, title: '初级方向', text: '思考这台老钢琴上是否承载着某位已故之人的独特痕迹。' },
      { level: 2, title: '深度矛盾', text: '老妇人付高价请调音师，为什么反而追求不准的音色？' },
      { level: 3, title: '破局发问', text: '试着询问：“这个走音的琴键是否和老妇人的儿子有关？”' }
    ],
    clues: [
      { id: 1, title: '阵亡的骨肉', desc: '老妇人的独生子在战争中牺牲离世', matchKeywords: ['儿子', '阵亡', '烈士', '去世', '当兵'] },
      { id: 2, title: '弹壳的共鸣', desc: '儿子生前卡在琴弦里的弹壳形成了特殊的音色', matchKeywords: ['弹壳', '瑕疵', '走音', '特定键', '共鸣'] },
      { id: 3, title: '心领神会的善意', desc: '调音师用高超技艺守护了母亲最后的念想', matchKeywords: ['调音师', '善意', '体谅', '保护', '故意'] },
      { id: 4, title: '音符中的重逢', desc: '老妇人借琴声与思念的儿子完成了跨时空对话', matchKeywords: ['思念', '感动', '眼泪', '回忆', '双倍报酬'] }
    ]
  },
  {
    title: '暴风雪孤舟',
    category: '经典硬核',
    difficulty: '★★★★☆',
    intro: '当严寒封冻了一切，道德与生存的平衡彻底倾覆。',
    quote: '活下来的人带着同伴的血肉走出暴雪，他们的余生只能与沉默的罪恶为伴。',
    question: '五名探险队员被暴雪围困在无人冰原一个多月。救援队赶到时，四名队员神情呆滞地获救，第五名队员却下落不明。四个获救者重返文明社会后却终生互不说话，老死不相往来。为什么？',
    truth: '在绝境中第五名队员最先因严寒重病断气。其余四人在粮食彻底耗尽的濒死状态下，瞒着彼此将死者的遗体做成了口粮勉强活了下来。直到回到文明社会，大家在体检与询问中惊觉每个人都曾吃下了昔日好友的身躯。巨大的道德谴责与自我厌恶让他们根本无法面对彼此的眼睛。',
    suggestedQuestions: ['第五名队员是被吃掉了吗？', '活着的四人为了生存迫不得已？', '互不往来是因为无法面对内疚与罪恶感？', '他们并不是故意谋杀？'],
    hints: [
      { level: 1, title: '初级方向', text: '考察在极寒断粮环境下人类维持生存的唯一极限手段。' },
      { level: 2, title: '深度矛盾', text: '为什么经历过生死考验的患难之交，反而视对方为仇寇？' },
      { level: 3, title: '破局发问', text: '试着询问：“第五名队员的遗体是否被当作食物消耗了？”' }
    ],
    clues: [
      { id: 1, title: '最先的陨落', desc: '第五名队员因疾病与恶劣气候在早期病亡', matchKeywords: ['病死', '冻死', '最先死', '断气'] },
      { id: 2, title: '禁忌的救赎', desc: '为了在断粮绝境中活命，同伴食用了死者遗体', matchKeywords: ['吃人', '人肉', '充饥', '食物', '绝境'] },
      { id: 3, title: '残存的清白', desc: '死者并非被谋害，但生者灵魂已受终身重创', matchKeywords: ['不是谋杀', '自然死亡', '病逝'] },
      { id: 4, title: '终生的枷锁', desc: '不可磨灭的伦理创伤让他们无法再直视对方', matchKeywords: ['内疚', '罪恶感', '不往来', '无法面对'] }
    ]
  },
  {
    title: '第十三根火柴',
    category: '荒诞哥特',
    difficulty: '★★★★☆',
    intro: '黑暗中的算计，被一缕微光彻底粉碎。',
    quote: '想要在黑暗中出卖同伴的人，却不知黑暗本身已染上了荧光的烙印。',
    question: '四个遇险工人被困在完全漆黑的崩塌矿井深处，每个人手里握着一根火柴。片刻的死寂后，其中三人突然默契地合力将第四个人推进了无底矿坑摔死。为什么？',
    truth: '氧气即将耗尽，四人商议抽签牺牲一人，方法是在黑暗中折断一根短火柴，抽中折断短火柴者跳入矿坑自尽以让其余人活到救援赶来。第四个人在黑暗中起贪念想作弊，悄悄把其他人手里的火柴摸了一遍想找到短的调包。但他不知道，抽签用的火柴头涂满了夜光荧光粉——当大家聚拢时，第四个人的满手都发着刺眼的绿光，丑陋行径当场暴露！',
    suggestedQuestions: ['四人在黑暗中进行了抽签？', '第四个人在黑暗中耍诈作弊？', '火柴上有发光的荧光粉？', '他被推下去是因为背叛行为暴露？'],
    hints: [
      { level: 1, title: '初级方向', text: '思考在绝对黑暗中，工人如何发现第四个人的违规动作。' },
      { level: 2, title: '深度矛盾', text: '火柴没有点燃，为什么大家却能“看见”罪证？' },
      { level: 3, title: '破局发问', text: '试着询问：“第四个人的手上是否沾上了发光物质？”' }
    ],
    clues: [
      { id: 1, title: '缺氧的抽签', desc: '为了减少耗氧量，众人被迫进行生死抉择抽签', matchKeywords: ['抽签', '牺牲', '缺氧', '矿井', '短火柴'] },
      { id: 2, title: '自私的摸索', desc: '第四人趁黑偷偷抚摸排查所有火柴企图舞弊', matchKeywords: ['作弊', '调包', '偷摸', '贪生怕死'] },
      { id: 3, title: '幽绿的现形', desc: '火柴上的荧光磷让他的双手在黑夜中暴露无遗', matchKeywords: ['荧光', '发光', '磷', '夜光', '手亮了'] },
      { id: 4, title: '众怒的裁决', desc: '见其卑劣背叛，其余三人合力将其抛弃处决', matchKeywords: ['推下', '摔死', '除掉', '愤怒'] }
    ]
  },
  {
    title: '海边孤岛灯塔',
    category: '经典硬核',
    difficulty: '★★★☆☆',
    intro: '随手熄灭的一盏灯，在汪洋上酿成了灭顶惨剧。',
    quote: '职务的疏漏往往只是一念之间，但海浪吞没生命却只需短短一瞬。',
    question: '一位恪尽职守多年的孤岛灯塔守望者，早晨从报童手里接过当天的早报，看了一眼头版大标题后，面无血色地径直翻过栏杆跃入滚滚海浪中自尽。为什么？',
    truth: '昨晚是老守塔人的六十岁生日，他高兴之下独自喝得酩酊大醉。夜里他嫌灯塔探照灯晃眼刺目，在醉意迷离中迷迷糊糊误把灯塔的主旋转电源总闸给拉断了。早报头条赫然刊登着：《昨夜巨型豪华客轮因海岸灯塔失明在暗礁区触礁沉没，近千名旅客全员遇难》。自责与愧疚彻底摧毁了他。',
    suggestedQuestions: ['守塔人昨晚关掉了灯塔？', '报纸上报道了轮船失事惨案？', '轮船触礁沉没是因为灯塔熄灭？', '守塔人因酗酒误事而畏罪自责？'],
    hints: [
      { level: 1, title: '初级方向', text: '灯塔守望者的核心天职是什么？他昨晚做了什么反常举动？' },
      { level: 2, title: '深度矛盾', text: '一份普通的早报，为何能直接击碎一个老人的生存意志？' },
      { level: 3, title: '破局发问', text: '试着询问：“灯塔昨夜是否曾陷入非正常的黑暗？”' }
    ],
    clues: [
      { id: 1, title: '醉酒的失职', desc: '守塔人在醉酒后随手切断了灯塔光源总闸', matchKeywords: ['关灯', '灭了', '醉酒', '熄灭', '电源'] },
      { id: 2, title: '海难的噩耗', desc: '报纸头版刊登了千人客轮失事触礁沉没的悲剧', matchKeywords: ['报纸', '沉船', '触礁', '客轮', '遇难'] },
      { id: 3, title: '致命的因果', desc: '客轮完全是因为失去灯塔引导才撞上暗礁', matchKeywords: ['失去方向', '暗礁', '导标', '因果'] },
      { id: 4, title: '赎罪的坠落', desc: '无法承受万钧愧疚的老人选择跳海谢罪', matchKeywords: ['跳海', '自尽', '愧疚', '自责'] }
    ]
  },
  {
    title: '镜中倒影',
    category: '荒诞哥特',
    difficulty: '★★★★★',
    intro: '镜子里的面孔，到底属于谁？',
    quote: '你夺走了仇人的眼睛重获光明，却不知道仇人正在镜中日夜冷视着你。',
    question: '一名男子每天清晨刮胡子都必须闭上双眼背对镜子凭手感摸索。某天清晨他忍不住睁眼望了一眼镜中的自己，当场发出凄厉惨叫并狠心戳瞎了自己的双眼。为什么？',
    truth: '多年前他的妻子在火灾中被凶手残害，男子为救妻子也严重烧伤失明。后来他接受了眼角膜捐赠手术重见光明，但他渐渐得知，那对角膜来自死于车祸的真凶（杀妻仇人）。平日里他不敢看镜子，今天偶然看了一眼，镜子里那双熟悉又阴森的眼眸正如案发当夜凶手冷血狞笑的眼神一模一样！他无法容忍自己身上活生生借用着仇人的眼睛，疯魔之下自毁双目。',
    suggestedQuestions: ['男子的角膜来自杀害妻子的仇人？', '他在镜子里看到了仇人的眼睛？', '背对镜子是因为不敢直视这双眼睛？', '自戳双目是出于极度痛苦与绝望？'],
    hints: [
      { level: 1, title: '初级方向', text: '探寻男子眼睛的来源及其背后尘封的惨烈过往。' },
      { level: 2, title: '深度矛盾', text: '他明明能看见，为什么每天刮胡子却宁可当个“瞎子”？' },
      { level: 3, title: '破局发问', text: '试着询问：“移植给他的眼角膜是否属于一个恶魔？”' }
    ],
    clues: [
      { id: 1, title: '移植的光明', desc: '男子的双眼角膜来自死去的凶手移植', matchKeywords: ['角膜', '眼角膜', '移植', '捐赠', '手术'] },
      { id: 2, title: '仇敌的凝视', desc: '那双眼睛属于当年残忍杀害他挚爱的凶手', matchKeywords: ['仇人', '凶手', '杀妻', '凶犯'] },
      { id: 3, title: '镜中的魔障', desc: '在镜子里他仿佛看到了仇人正在借助自己的皮囊复活', matchKeywords: ['眼神', '狞笑', '重现', '镜子'] },
      { id: 4, title: '决绝的剥离', desc: '因极端的恶心与痛苦，他宁可重新回到永恒的黑暗', matchKeywords: ['戳瞎', '自残', '毁灭', '决绝'] }
    ]
  },
  {
    title: '最后一份爱心便当',
    category: '温情反转',
    difficulty: '★★★☆☆',
    intro: '一份馊了二十年的便当，承载着不可遗忘的岁月。',
    quote: '即便岁月擦去了大脑里所有的名字，爱依然会在肌肉记忆中生生不息。',
    question: '一位患有严重阿尔茨海默病的老人，每天中午都会捧着一个保温盒准时出现在某实验小学门外等候。直到某天一位值勤的女交警走上前检查并打开保温盒，看了一眼后当场嚎啕大哭抱住老人。为什么？',
    truth: '老人早已认不出成年人的面孔，记忆永远停留在了二十年前女儿刚上小学第一天的时候。保温盒里是他今早做好的爱心蛋包饭（虽然手抖做得歪歪扭扭）。那位年轻的女交警其实就是他苦苦等待的女儿！女儿为了生计多年奔波很少回家，看到眼前已经白发苍苍、神志不清却依然风雨无阻给自己送饭的父亲，悔恨与感动涌上心头。',
    suggestedQuestions: ['女交警就是老人的亲生女儿？', '老人记忆退化停留在女儿读小学的时候？', '便当是做给女儿的？', '女交警哭是因为认出了深爱自己的父亲？'],
    hints: [
      { level: 1, title: '初级方向', text: '厘清老人与值勤女交警之间的深层血缘关系。' },
      { level: 2, title: '深度矛盾', text: '为什么老人去小学等候，而交警是成年人？' },
      { level: 3, title: '破局发问', text: '试着询问：“女交警小时候是否就是在这所小学上学？”' }
    ],
    clues: [
      { id: 1, title: '退色的记忆', desc: '老人患病失智，认知停留在二十年前幼女上学时', matchKeywords: ['失忆', '老年痴呆', '阿尔茨海默', '二十年前'] },
      { id: 2, title: '跨越时空的便当', desc: '保温盒里装的是父亲特意为小女孩烹制的便当', matchKeywords: ['便当', '蛋包饭', '饭盒', '送饭'] },
      { id: 3, title: '执勤的长女', desc: '在路口执勤的女警正是老人当年呵护的小女孩', matchKeywords: ['女警', '女儿', '长大了', '亲人'] },
      { id: 4, title: '未被抹去的父爱', desc: '虽然忘掉世界，但对女儿的本能爱意永不熄灭', matchKeywords: ['父爱', '相认', '大哭', '感动', '拥抱'] }
    ]
  },
  {
    title: '午夜末班出租车',
    category: '细思极恐',
    difficulty: '★★★★☆',
    intro: '后座上那个沉默的低头女子，真的只是睡着了吗？',
    quote: '后视镜里的死寂，比世界上任何尖叫都更加令人毛骨悚然。',
    question: '深夜，一辆出租车搭载了一名男乘客和一名靠在男乘客肩膀上昏睡的红衣女子。行驶到半路，司机猛然一脚油门拐进路边的公安分局大院，拔下车钥匙拽着男乘客拼命呼救。为什么？',
    truth: '后座的女乘客早在上车前就已被身边的男乘客用毒针杀害并精心固定成醉酒昏睡的假象，男乘客企图将尸体运往郊外抛尸。出租车在经过一个减速带发生剧烈颠簸时，女乘客的假发脱落，脖颈以一个正常活人绝不可能达到的恐怖锐角向后折断耷拉在靠背上，双眼翻白毫无呼吸。司机从后视镜瞥见这一幕，立刻心知肚明后座坐着一具女尸与一个穷凶极恶的凶手！',
    suggestedQuestions: ['后座的女乘客其实在上车前就已经死了？', '男乘客是杀人抛尸的凶手？', '颠簸让女乘客诡异的尸僵暴露了真相？', '司机把车开进公安局是为了制服凶手自救？'],
    hints: [
      { level: 1, title: '初级方向', text: '女乘客在车上的“昏睡”状态究竟是不是生物学上的睡眠？' },
      { level: 2, title: '深度矛盾', text: '行驶途中发生了什么物理震动，让司机看到了骇人细节？' },
      { level: 3, title: '破局发问', text: '试着询问：“后排的女性乘客是否已经没有了生命体征？”' }
    ],
    clues: [
      { id: 1, title: '伪装的醉态', desc: '凶手故意将死者摆成靠着自己肩膀睡觉的假相', matchKeywords: ['装睡', '醉酒', '假象', '掩人耳目'] },
      { id: 2, title: '震荡中的裂痕', desc: '颠簸使得死者异常脱臼的颈部和尸表特征彻底暴露', matchKeywords: ['颠簸', '减速带', '折断', '后颈', '死相'] },
      { id: 3, title: '恶魔的抛尸', desc: '男乘客企图借夜色掩护包车前往荒山野岭抛尸', matchKeywords: ['抛尸', '凶手', '杀人', '运尸'] },
      { id: 4, title: '急中生智的入局', desc: '司机假装不知情，直接以迅雷之势将车辆开入警署', matchKeywords: ['公安局', '报警', '派出所', '捕获', '求救'] }
    ]
  },
  {
    title: '未拆封的遗嘱',
    category: '经典硬核',
    difficulty: '★★★★☆',
    intro: '庞大遗产的归属，取决于谁能在幽闭的房间里坚持到最后。',
    quote: '当财富成为包裹剧毒的诱饵，贪婪者争夺的不过是通往地狱的单程票。',
    question: '富商立下公证遗嘱：死后将其千亿遗产全额赠予“最后一名走出密封灵堂”的家族继承人。葬礼当晚，灵堂沉重的大铁门刚刚锁死，所有的亲属却凄厉尖叫着发疯般砸门逃生，无一人敢停留。为什么？',
    truth: '富商生前深知所有亲属都心怀鬼胎盼着自己暴毙。他在临终前秘密感染了国家最高级警戒的烈性空气传播炭疽病毒，并特意在灵堂中央的水晶棺冷气系统里掺入了催化毒气扩散的试剂。铁门一关，扩音器里开始播放富商生前的嘲弄录音：“我的遗产属于最后走出的人，但只有活人才能继承，祝你们好运。”亲属们立刻明白呆得越久必死无疑，吓得亡命溃逃。',
    suggestedQuestions: ['灵堂里释放了致命毒气或烈性病毒？', '富商生前设局报复贪婪的亲属？', '呆在灵堂里的人会死？', '逃生是因为生命比金钱更重要？'],
    hints: [
      { level: 1, title: '初级方向', text: '密封的灵堂空间内，除了巨额遗产，还潜伏着什么物理威胁？' },
      { level: 2, title: '深度矛盾', text: '为什么没人愿意做那个“最后走出”从而继承千亿财产的人？' },
      { level: 3, title: '破局发问', text: '试着询问：“富商的真正死因是否带有致命传染性？”' }
    ],
    clues: [
      { id: 1, title: '致命的诱饵', desc: '巨额遗产的继承条件诱使所有亲属聚集于此', matchKeywords: ['遗产', '钱', '继承人', '最后走出'] },
      { id: 2, title: '毒化的密室', desc: '灵堂内部被富商预先布置了烈性扩散病毒试剂', matchKeywords: ['病毒', '毒气', '感染', '传染', '空气'] },
      { id: 3, title: '亡者的复仇', desc: '富商用自己的死亡设计了一场针对贪婪者的诛心审判', matchKeywords: ['嘲笑', '报复', '设局', '生前设计'] },
      { id: 4, title: '溃败的贪欲', desc: '在死亡威胁面前，所有人抛弃贪念仓皇破门而逃', matchKeywords: ['逃跑', '砸门', '保命', '尖叫'] }
    ]
  },
  {
    title: '画像上的微笑',
    category: '荒诞哥特',
    difficulty: '★★★★★',
    intro: '油彩未干的画布里，浸透了长达八年的绝望。',
    quote: '艺术家的最高杰作，往往是用至亲至爱之人的骨肉调和而成的罪恶之花。',
    question: '隐居古堡的著名画家耗时八年终于完成了伯爵夫人的等身肖像画。在画作向伯爵揭幕的瞬间，伯爵大惊失色，立刻拔出佩枪将画家当场击毙。为什么？',
    truth: '伯爵夫人早在八年前就已经神秘失踪。画家当年失手将夫人杀害并藏尸在画室地窖，这八年来一直谎称夫人“自愿避世在暗室潜心充当模特”。画作揭幕时，伯爵发现肖像画上红色的裙摆和唇彩所使用的不是普通矿物颜料，而是混合了夫人被防腐保存的真实骨肉与骨灰；更关键的是，画中夫人的指甲深深掐在唇边——那正是夫人当年被残杀时在画家胸口留下的独特抓痕烙印！伯爵当场识破了画家的杀妻凶手身份。',
    suggestedQuestions: ['夫人其实在八年前就已经遇害了？', '画像是用夫人的血肉或骨灰作颜料画成的？', '伯爵发现了画中有当年凶案的关键铁证？', '画家就是杀害夫人的真凶？'],
    hints: [
      { level: 1, title: '初级方向', text: '调查八年间伯爵夫人的生物学存活状态。' },
      { level: 2, title: '深度矛盾', text: '一幅完美的画作，究竟是哪一个细节泄漏了罪恶的秘密？' },
      { level: 3, title: '破局发问', text: '试着询问：“画像上使用的颜料成分是否存在骇人听闻的秘密？”' }
    ],
    clues: [
      { id: 1, title: '失踪的贵妇', desc: '伯爵夫人八年前便已在画室遇害身亡', matchKeywords: ['夫人死了', '失踪', '早死了', '遇害', '八年前'] },
      { id: 2, title: '骨肉的丹青', desc: '画像颜料中掺入了死者的血肉与骨灰', matchKeywords: ['骨灰', '颜料', '血肉', '人骨', '油彩'] },
      { id: 3, title: '无法磨灭的烙印', desc: '画作细节精确还原了当年凶案搏斗留下的致命伤痕', matchKeywords: ['抓痕', '伤疤', '铁证', '凶案痕迹'] },
      { id: 4, title: '血色的处刑', desc: '伯爵瞬间醒悟真相，当场将恶魔画家击毙复仇', matchKeywords: ['击毙', '开枪', '报仇', '凶手暴露'] }
    ]
  }
];

/**
 * 离线海龟汤智能挑选器（严格去重，绝不重复生成同名案件）
 */
function generateOfflineCase({ theme, category, existingTitles = [] }) {
  const existingSet = new Set(existingTitles.map(t => (t || '').trim()));

  // 1. 优先寻找属于当前风格类别且【尚未在列表中】的案件
  let candidates = OFFLINE_CASE_VAULT.filter(c => c.category === category && !existingSet.has(c.title));

  // 2. 如果当前类别都用完了，在所有类别中寻找【尚未在列表中】的案件
  if (candidates.length === 0) {
    candidates = OFFLINE_CASE_VAULT.filter(c => !existingSet.has(c.title));
  }

  // 3. 如果16卷全部被玩家添加了，生成带罗马数字的续幕变体，确保绝不重名
  if (candidates.length === 0) {
    const base = OFFLINE_CASE_VAULT[Math.floor(Math.random() * OFFLINE_CASE_VAULT.length)];
    const actNumber = Math.floor(Math.random() * 8) + 2;
    const romanNumerals = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    const titleVariant = `《${base.title}·第${romanNumerals[actNumber - 2] || actNumber}幕》`;

    return {
      ...base,
      title: titleVariant,
      id: 'ai_case_' + Date.now(),
      isAICreated: true
    };
  }

  // 4. 从可用候选池中随机抽取一桩全新的案卷
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    ...chosen,
    id: 'ai_case_' + Date.now(),
    isAICreated: true
  };
}
