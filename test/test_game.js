/**
 * 核心引擎与算法自动化测试脚本 (Node.js 运行)
 */
import { buildLevel, generateLayoutSlots } from '../js/solver.js';
import { isCardCovered, updateOcclusions } from '../js/collision.js';
import { GAME_CONFIG } from '../js/config.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('>>> 开始执行《羊了个羊》核心算法单元测试...\n');

// -------------------------------------------------------------
// 测试项 1: 关卡槽位与卡牌总数必须是 3 的整数倍
// -------------------------------------------------------------
console.log('[Test 1: 关卡三消完整度与整除性测试]');
[1, 2, 3].forEach(level => {
  const cards = buildLevel(level);
  assert(
    cards.length % GAME_CONFIG.MATCH_COUNT === 0,
    `第 ${level} 关总卡牌数 (${cards.length}) 严格是 3 的整数倍`
  );

  // 验证每种图案类型的数量也必须是 3 的整数倍 (不可出现落单孤儿牌)
  const counts = {};
  cards.forEach(c => {
    counts[c.type.id] = (counts[c.type.id] || 0) + 1;
  });

  let allTriples = true;
  for (const [typeId, count] of Object.entries(counts)) {
    if (count % 3 !== 0) {
      allTriples = false;
      console.error(`    卡牌类型 ${typeId} 数量为 ${count}，不是 3 的倍数！`);
    }
  }
  assert(allTriples, `第 ${level} 关所有图案种类卡牌数量严格成 3 的倍数（无孤牌）`);
});

// -------------------------------------------------------------
// 测试项 2: AABB 物理遮挡碰撞算法精度测试
// -------------------------------------------------------------
console.log('\n[Test 2: AABB 空间多层遮挡逻辑测试]');
// 卡牌 A 在 layer 0, 卡牌 B 在 layer 1 (完全重叠)
const cardA = { id: 1, x: 100, y: 100, layer: 0 };
const cardB = { id: 2, x: 100, y: 100, layer: 1 };
assert(isCardCovered(cardA, cardB) === true, '完全重叠且更高层级的卡牌应判定为遮挡');

// 卡牌 C 在 layer 0, 卡牌 D 在 layer 0 (同层不发生遮挡)
const cardC = { id: 3, x: 100, y: 100, layer: 0 };
const cardD = { id: 4, x: 100, y: 100, layer: 0 };
assert(isCardCovered(cardC, cardD) === false, '相同物理层级的卡牌不会互相压制遮挡');

// 卡牌 E 在 layer 0, 卡牌 F 在 layer 1 (距离超过宽度 48px)
const cardE = { id: 5, x: 100, y: 100, layer: 0 };
const cardF = { id: 6, x: 155, y: 100, layer: 1 };
assert(isCardCovered(cardE, cardF) === false, 'X轴间距超过卡牌宽度的上层卡牌不产生遮挡');

// 微小相交边缘测试 (重叠 10px)
const cardG = { id: 7, x: 100, y: 100, layer: 0 };
const cardH = { id: 8, x: 138, y: 100, layer: 1 };
assert(isCardCovered(cardG, cardH) === true, '部分交叠的上层卡牌能准确识别并产生遮挡压制');

// -------------------------------------------------------------
// 测试项 3: 全局遮蔽扫描与解锁状态测试
// -------------------------------------------------------------
console.log('\n[Test 3: 全局拓扑扫描与动态解锁测试]');
const testCards = [
  { id: 1, x: 100, y: 100, layer: 0, status: 'board', blocked: false },
  { id: 2, x: 100, y: 100, layer: 1, status: 'board', blocked: false }
];
updateOcclusions(testCards);
assert(testCards[0].blocked === true, '底层卡牌初态被准确置灰锁定 (blocked = true)');
assert(testCards[1].blocked === false, '顶层卡牌初态高亮可点击 (blocked = false)');

// 模拟顶层卡牌被玩家收集移入槽位 (status 变为 'dock')
testCards[1].status = 'dock';
const res = updateOcclusions(testCards);
assert(testCards[0].blocked === false, '顶层卡牌移走后，底层卡牌立刻解除锁定 (blocked = false)');
assert(res.newlyUnlockedIds.includes(1), '底层卡牌被成功加入 newlyUnlockedIds 触发弹跳解锁动效');

console.log(`\n========================================`);
console.log(`测试结果: 共 ${passed + failed} 项, 通过: ${passed}, 失败: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
