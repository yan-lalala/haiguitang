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
