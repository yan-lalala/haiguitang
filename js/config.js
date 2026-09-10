/**
 * 游戏核心配置表 (Game Configuration)
 */

// 卡牌基础物理尺寸
export const GAME_CONFIG = {
  CARD_WIDTH: 48,
  CARD_HEIGHT: 56,
  TOLERANCE: 4,         // 碰撞检测边缘容差 (px)
  DOCK_CAPACITY: 7,     // 收集槽最大容量
  MATCH_COUNT: 3,       // 消除所需张数
  HOLDING_CAPACITY: 3   // 移出暂存槽容量
};

// 卡牌类型定义 (图标、中英文名称、主题底色与边框色)
export const CARD_TYPES = [
  { id: 'sheep',   name: '小绵羊', icon: '🐑', color: '#fef7e5', border: '#b38b59', textColor: '#854d0e' },
  { id: 'carrot',  name: '胡萝卜', icon: '🥕', color: '#fff1eb', border: '#e87948', textColor: '#9a3412' },
  { id: 'cabbage', name: '大白菜', icon: '🥬', color: '#eefcf1', border: '#48bb78', textColor: '#166534' },
  { id: 'milk',    name: '鲜牛奶', icon: '🍼', color: '#f0f9ff', border: '#38bdf8', textColor: '#0369a1' },
  { id: 'bell',    name: '铜铃铛', icon: '🔔', color: '#fffbeb', border: '#f59e0b', textColor: '#854d0e' },
  { id: 'wool',    name: '毛线球', icon: '🧶', color: '#fdf2f8', border: '#f472b6', textColor: '#9d174d' },
  { id: 'fire',    name: '篝火堆', icon: '🔥', color: '#fff7ed', border: '#ea580c', textColor: '#c2410c' },
  { id: 'corn',    name: '甜玉米', icon: '🌽', color: '#fefce8', border: '#eab308', textColor: '#a16207' },
  { id: 'clover',  name: '四叶草', icon: '🍀', color: '#f0fdf4', border: '#22c55e', textColor: '#15803d' },
  { id: 'wood',    name: '木柴块', icon: '🪵', color: '#fbf5ee', border: '#a16207', textColor: '#78350f' },
  { id: 'straw',   name: '红草莓', icon: '🍓', color: '#fff1f2', border: '#f43f5e', textColor: '#9f1239' },
  { id: 'apple',   name: '脆苹果', icon: '🍎', color: '#fef2f2', border: '#ef4444', textColor: '#991b1b' }
];

// 全国羊群省份榜单初始模拟数据
export const DEFAULT_PROVINCE_RANKS = [
  { id: 'guangdong', name: '广东省羊队', sheepCount: 52140, tag: '领跑中' },
  { id: 'shandong',  name: '山东省羊队', sheepCount: 46820, tag: '紧追' },
  { id: 'sichuan',   name: '四川省羊队', sheepCount: 43290, tag: '火热' },
  { id: 'henan',     name: '河南省羊队', sheepCount: 38710, tag: '' },
  { id: 'zhejiang',  name: '浙江省羊队', sheepCount: 35400, tag: '' },
  { id: 'jiangsu',   name: '江苏省羊队', sheepCount: 34180, tag: '' },
  { id: 'hunan',     name: '湖南省羊队', sheepCount: 29850, tag: '' },
  { id: 'hebei',     name: '河北省羊队', sheepCount: 26310, tag: '' },
  { id: 'beijing',   name: '北京市羊队', sheepCount: 23400, tag: '' },
  { id: 'shanghai',  name: '上海市羊队', sheepCount: 21900, tag: '' }
];

// 皮肤主题配置
export const THEMES = {
  pasture: {
    id: 'pasture',
    name: '🌿 经典牧场',
    bgColor: '#7bc342',
    dockBg: '#deb887',
    dockBorder: '#8b5a2b'
  },
  sweet: {
    id: 'sweet',
    name: '🍰 甜品森林',
    bgColor: '#fbcfe8',
    dockBg: '#f472b6',
    dockBorder: '#be185d'
  },
  cyber: {
    id: 'cyber',
    name: '🌌 赛博羊圈',
    bgColor: '#0369a1',
    dockBg: '#0f172a',
    dockBorder: '#38bdf8'
  }
};
