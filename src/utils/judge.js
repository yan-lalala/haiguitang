/**
 * 海龟汤智能裁判引擎
 * 支持：1. 离线/内置智能规则匹配 (Mock Mode)
 *       2. 真实大模型 API 模式 (OpenAI兼容接口，如 DeepSeek、Kimi、Gemini等)
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
      fallbackResult.dmComment = `(API暂时异常，已转本地裁判) ${fallbackResult.dmComment}`;
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

  // 1. 检查是否命中线索的专属关键词（即使 mockRules 没写完整，只要线索 keywords 命中也触发）
  let newUnlockedClue = null;
  for (const clue of soup.clues) {
    if (!unlockedClueIds.includes(clue.id)) {
      const isMatch = clue.matchKeywords.some(kw => normalizedQ.includes(kw.toLowerCase()));
      if (isMatch) {
        newUnlockedClue = clue;
        break;
      }
    }
  }

  // 2. 检查具体的 mockRules 预设问答
  for (const rule of soup.mockRules) {
    const isHit = rule.keys.some(k => normalizedQ.includes(k.toLowerCase()));
    if (isHit) {
      // 如果规则本身绑定了线索，且该线索未解锁
      let triggerClueObj = null;
      if (rule.triggerClue && !unlockedClueIds.includes(rule.triggerClue)) {
        triggerClueObj = soup.clues.find(c => c.id === rule.triggerClue);
      } else if (newUnlockedClue) {
        triggerClueObj = newUnlockedClue;
      }

      return {
        judgment: rule.answer, // '是' | '否' | '无关' | '是也不是'
        dmComment: rule.comment || '...',
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
 * 调用远程兼容 OpenAI 规范的 LLM 接口
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  let response;
  try {
    response = await fetch(apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: apiConfig.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `玩家提问："${question}"` }
        ],
        temperature: 0.2
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json();
  const rawText = data.choices[0].message.content.trim();
  const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const resObj = JSON.parse(cleaned);

  let newClue = null;
  if (resObj.new_unlocked_clue_id && !unlockedClueIds.includes(resObj.new_unlocked_clue_id)) {
    newClue = soup.clues.find(c => c.id === resObj.new_unlocked_clue_id);
  }

  return {
    judgment: resObj.judgment || '是',
    dmComment: resObj.dmComment || resObj.dm_comment || '...',
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

  const response = await fetch(apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: apiConfig.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `玩家的真相复盘："${attemptText}"` }
      ],
      temperature: 0.3
    })
  });

  const data = await response.json();
  const rawText = data.choices[0].message.content.trim().replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(rawText);
}

/**
 * 大模型现场编织全新海龟汤卷宗 (无限海龟汤生成器)
 */
export async function generateAICase({ theme = '随机未知', category = '细思极恐', apiConfig }) {
  if (apiConfig && apiConfig.enabled && apiConfig.apiKey) {
    try {
      return await callLLMCaseGenerator({ theme, category, apiConfig });
    } catch (err) {
      console.warn('大模型生成案卷失败，自动使用离线神秘古卷:', err);
    }
  }

  // 离线备选奇谭生成
  return generateOfflineCase({ theme, category });
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  let response;
  try {
    response = await fetch(apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey.trim()}`
      },
      body: JSON.stringify({
        model: apiConfig.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请立即开始生成这桩《${theme}》主题的全新海龟汤！` }
        ],
        temperature: 0.8
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json();
  const rawText = data.choices[0].message.content.trim();
  const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const caseObj = JSON.parse(cleaned);

  if (!caseObj.id) caseObj.id = caseId;
  caseObj.isAICreated = true;
  return caseObj;
}

function generateOfflineCase({ theme, category }) {
  const offlinePool = [
    {
      title: '午夜收音机',
      category: '细思极恐',
      difficulty: '★★★☆☆',
      intro: '电流杂音的尽头，播放着来自明天的讣告。',
      quote: '人们常常恐惧未知，却不知道最恐怖的往往是不可更改的既定事实。',
      question: '老张独居在深山小屋，每天深夜都会准时打开老式收音机。某天深夜，收音机播完后，他微笑着躺在床上静静等待死亡。为什么？',
      truth: '老张是一名身患绝症晚期的护林员，深居与世隔绝的高山观测站。他收音机里收听的是山下大坝泄洪预警广播。当晚暴雨倾盆，收音机播报由于洪水过大下游数万人危在旦夕，唯一的办法是立即炸开上游水闸牺牲高山林区泄洪。老张知道水闸一开自己的小屋就会瞬间被滔天洪水吞没，但他心甘情愿为了拯救山下千千万万的村民而牺牲，平静地拥抱了生命的落幕。',
      suggestedQuestions: ['收音机播报了泄洪消息？', '老张是为了救下游村民？', '他身患绝症没有逃跑？', '小屋很快会被洪水吞噬？'],
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
      clues: [
        { id: 1, title: '死去的驾驶员', desc: '司机早在车辆失控前就突发急病身亡了', matchKeywords: ['猝死', '死了', '生病', '脑溢血', '心脏病', '早已死'] },
        { id: 2, title: '失控的钢铁巨兽', desc: '公交车脚踏板被死者僵硬的脚卡死在高速状态', matchKeywords: ['卡死', '油门', '失控', '狂飙', '盘山路'] },
        { id: 3, title: '恐惧的误解', desc: '女乘客将死者的僵硬尸相误认作恶鬼', matchKeywords: ['鬼', '误会', '害怕', '以为是鬼', '吓坏'] },
        { id: 4, title: '致命的逃生', desc: '在极度恐慌中跳出高速行驶的车窗身亡', matchKeywords: ['跳窗', '摔死', '逃命', '绝望'] }
      ]
    }
  ];

  const chosen = offlinePool[Math.floor(Math.random() * offlinePool.length)];
  return {
    ...chosen,
    id: 'ai_case_' + Date.now(),
    isAICreated: true
  };
}
