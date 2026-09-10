/**
 * 空间 AABB 碰撞与多层深度遮蔽算法引擎 (Collision & Occlusion Engine)
 */
import { GAME_CONFIG } from './config.js';

/**
 * 判定 cardA 是否被处于更高物理层级的 cardB 遮蔽
 * @param {Object} cardA 待测卡牌 (下层)
 * @param {Object} cardB 对照卡牌 (潜在上层阻挡者)
 * @param {number} width 卡牌宽度
 * @param {number} height 卡牌高度
 * @param {number} tolerance 边缘容差
 * @returns {boolean} 是否遮挡
 */
export function isCardCovered(
  cardA,
  cardB,
  width = GAME_CONFIG.CARD_WIDTH,
  height = GAME_CONFIG.CARD_HEIGHT,
  tolerance = GAME_CONFIG.TOLERANCE
) {
  // 只有处于严格上层的卡牌，才会对下层产生遮挡
  if (cardB.layer <= cardA.layer) {
    return false;
  }

  // AABB 轴对称包围盒相交检测
  const xOverlap = Math.abs(cardA.x - cardB.x) < (width - tolerance);
  const yOverlap = Math.abs(cardA.y - cardB.y) < (height - tolerance);

  return xOverlap && yOverlap;
}

/**
 * 全局拓扑扫描：重新计算所有在场卡牌的遮挡锁定状态
 * @param {Array} cards 桌面卡牌集合
 * @returns {Object} { blockedCount, freeCount, newlyUnlockedIds }
 */
export function updateOcclusions(cards) {
  const activeCards = cards.filter(c => c.status === 'board');
  const newlyUnlockedIds = [];

  activeCards.forEach(cardA => {
    let isCovered = false;
    for (const cardB of activeCards) {
      if (cardA.id !== cardB.id && isCardCovered(cardA, cardB)) {
        isCovered = true;
        break;
      }
    }

    // 检测此前被阻挡、当前刚刚被释放的卡牌 (用于触发微弹跳高光)
    if (cardA.blocked && !isCovered) {
      newlyUnlockedIds.push(cardA.id);
    }

    cardA.blocked = isCovered;
  });

  const freeCount = activeCards.filter(c => !c.blocked).length;
  const blockedCount = activeCards.length - freeCount;

  return {
    blockedCount,
    freeCount,
    newlyUnlockedIds
  };
}

/**
 * 获取当前所有无遮挡、可以直接点击落槽的卡牌
 * @param {Array} cards 
 * @returns {Array} 可点击卡牌列表
 */
export function getAvailableCards(cards) {
  return cards.filter(c => c.status === 'board' && !c.blocked);
}
