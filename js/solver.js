/**
 * 关卡生成器与可解性求解验证器 (Level Generator & Solvability Solver)
 */
import { CARD_TYPES, GAME_CONFIG } from './config.js';
import { isCardCovered } from './collision.js';

/**
 * 随机打乱数组
 */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 关卡物理几何槽位布局生成器
 */
export function generateLayoutSlots(levelNumber) {
  const slots = [];

  if (levelNumber === 1) {
    // ================= 第 1 关：新手教程关 (共 18 张牌，结构简洁直观) =================
    // 底层 Layer 0: 3x3 均匀网格 (9张)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        slots.push({ x: 75 + c * 60, y: 65 + r * 68, layer: 0 });
      }
    }
    // 中层 Layer 1: 四角交叠 (4张)
    slots.push({ x: 105, y: 99, layer: 1 });
    slots.push({ x: 165, y: 99, layer: 1 });
    slots.push({ x: 105, y: 167, layer: 1 });
    slots.push({ x: 165, y: 167, layer: 1 });

    // 顶层 Layer 2: 核心十字 (5张)
    slots.push({ x: 135, y: 133, layer: 2 });
    slots.push({ x: 135, y: 80,  layer: 2 });
    slots.push({ x: 135, y: 186, layer: 2 });
    slots.push({ x: 85,  y: 133, layer: 2 });
    slots.push({ x: 185, y: 133, layer: 2 });

  } else if (levelNumber === 2) {
    // ================= 第 2 关：经典地狱关 (共 48 张牌，8类图案，深度5层金字塔+两侧盲堆) =================
    
    // 1. 左侧辅助叠牌盲堆 (8张，层层压叠)
    for (let i = 0; i < 6; i++) {
      slots.push({ x: 18, y: 80 + i * 26, layer: i });
    }

    // 2. 右侧辅助叠牌盲堆 (8张，层层压叠)
    for (let i = 0; i < 6; i++) {
      slots.push({ x: 274, y: 80 + i * 26, layer: i });
    }

    // 3. 中央核心主山脉 Layer 0 (地基大网格 12张)
    const baseGrid = [
      {x: 82, y: 48},  {x: 146, y: 48},  {x: 210, y: 48},
      {x: 82, y: 112}, {x: 146, y: 112}, {x: 210, y: 112},
      {x: 82, y: 176}, {x: 146, y: 176}, {x: 210, y: 176},
      {x: 82, y: 240}, {x: 146, y: 240}, {x: 210, y: 240}
    ];
    baseGrid.forEach(p => slots.push({ x: p.x, y: p.y, layer: 0 }));

    // 4. Layer 1 (中间菱形错位层 10张)
    const layer1 = [
      {x: 114, y: 80},  {x: 178, y: 80},
      {x: 114, y: 144}, {x: 178, y: 144},
      {x: 114, y: 208}, {x: 178, y: 208},
      // 外部环绕
      {x: 146, y: 18},  {x: 146, y: 272},
      {x: 60,  y: 144}, {x: 232, y: 144}
    ];
    layer1.forEach(p => slots.push({ x: p.x, y: p.y, layer: 1 }));

    // 5. Layer 2 (中高层紧密结构 8张)
    const layer2 = [
      {x: 130, y: 95},  {x: 162, y: 95},
      {x: 130, y: 160}, {x: 162, y: 160},
      {x: 98,  y: 128}, {x: 194, y: 128},
      {x: 146, y: 64},  {x: 146, y: 226}
    ];
    layer2.forEach(p => slots.push({ x: p.x, y: p.y, layer: 2 }));

    // 6. Layer 3 (顶尖小十字 4张)
    const layer3 = [
      {x: 146, y: 110},
      {x: 146, y: 145},
      {x: 126, y: 128},
      {x: 166, y: 128}
    ];
    layer3.forEach(p => slots.push({ x: p.x, y: p.y, layer: 3 }));

    // 7. Layer 4 (至尊塔尖 2张)
    slots.push({ x: 138, y: 120, layer: 4 });
    slots.push({ x: 154, y: 136, layer: 4 });

  } else {
    // ================= 第 3 关及无限挑战关 (自动按3的倍数对齐) =================
    const count = 42;
    for (let i = 0; i < count; i++) {
      const l = Math.floor(i / 10);
      const angle = (i * 137.5 * Math.PI) / 180;
      const radius = 25 + (i % 8) * 16;
      slots.push({
        x: Math.round(146 + Math.cos(angle) * radius),
        y: Math.round(150 + Math.sin(angle) * radius),
        layer: l
      });
    }
  }

  // 保证总槽位数严格是 3 的倍数 (若有多余自动修剪)
  const remainder = slots.length % GAME_CONFIG.MATCH_COUNT;
  if (remainder !== 0) {
    slots.splice(slots.length - remainder, remainder);
  }

  return slots;
}

/**
 * 组装并生成完整关卡卡牌数据
 * @param {number} levelNumber 
 * @param {number} themeTypeCount 使用的图案种类数
 * @returns {Array} 卡牌对象列表
 */
export function buildLevel(levelNumber = 2, themeTypeCount = null) {
  const slots = generateLayoutSlots(levelNumber);
  const totalCards = slots.length;
  const tripleCount = totalCards / GAME_CONFIG.MATCH_COUNT;

  // 根据关卡决定使用的图案种类数
  let numTypes = 3;
  if (levelNumber === 2) {
    numTypes = 7; // 7种图案让难度极具挑战性
  } else if (levelNumber > 2) {
    numTypes = 8;
  }
  if (themeTypeCount) {
    numTypes = themeTypeCount;
  }

  const selectedTypes = CARD_TYPES.slice(0, Math.min(numTypes, CARD_TYPES.length));

  // 为每个卡牌分配图案，确保每类图案的总数是 3 的整数倍
  const pool = [];
  for (let i = 0; i < tripleCount; i++) {
    const type = selectedTypes[i % selectedTypes.length];
    for (let k = 0; k < GAME_CONFIG.MATCH_COUNT; k++) {
      pool.push(type);
    }
  }
  shuffle(pool);

  // 赋予 ID 与初始状态
  const cards = slots.map((slot, index) => ({
    id: index + 1,
    type: pool[index],
    x: slot.x,
    y: slot.y,
    layer: slot.layer,
    status: 'board',
    blocked: false
  }));

  return cards;
}

/**
 * 轻量级可解性启发式验证器 (Heuristic Solvability Checker)
 * 检查当前卡牌分布是否可以在 7 格槽位限制下完成全消
 * @param {Array} originalCards 
 * @param {number} maxDepth 搜索深度上限
 * @returns {boolean} 是否存在一条可行通关序列
 */
export function quickCheckSolvable(originalCards, maxDepth = 400) {
  // 深拷贝卡牌以供模拟
  const simCards = originalCards.map(c => ({ ...c }));
  const dock = [];
  let steps = 0;

  function simulate() {
    if (steps++ > maxDepth) return false;

    // 获取未消除的卡牌
    const active = simCards.filter(c => c.status === 'board');
    if (active.length === 0 && dock.length === 0) {
      return true; // 成功全清！
    }

    if (dock.length >= GAME_CONFIG.DOCK_CAPACITY) {
      return false; // 槽位溢出
    }

    // 找出所有当前可点的顶层卡牌
    const available = active.filter(cA => {
      return !active.some(cB => cA.id !== cB.id && isCardCovered(cA, cB));
    });

    if (available.length === 0) {
      return false; // 无可用牌
    }

    // 启发式优先：若槽位里已有该类型的牌（特别是已有2张，即将凑成3张），优先拾取
    available.sort((a, b) => {
      const countA = dock.filter(d => d.type.id === a.type.id).length;
      const countB = dock.filter(d => d.type.id === b.type.id).length;
      return countB - countA;
    });

    for (const card of available) {
      // 试探走一步
      card.status = 'dock';
      dock.push(card);

      // 检查是否三消
      const matched = dock.filter(d => d.type.id === card.type.id);
      let didMatch = false;
      if (matched.length >= 3) {
        didMatch = true;
        let removed = 0;
        for (let i = dock.length - 1; i >= 0; i--) {
          if (dock[i].type.id === card.type.id && removed < 3) {
            dock.splice(i, 1);
            removed++;
          }
        }
      }

      const res = simulate();
      if (res) return true;

      // 回溯
      if (didMatch) {
        // 如果曾消除过，较难直接逆向回滚 dock，直接探索下一个候选分支
        break;
      } else {
        dock.pop();
        card.status = 'board';
      }
    }

    return false;
  }

  return simulate();
}
