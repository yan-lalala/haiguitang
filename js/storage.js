/**
 * 本地存储与用户数据持久化管理器 (Storage Manager)
 */
import { DEFAULT_PROVINCE_RANKS } from './config.js';

const STORAGE_KEYS = {
  USER_PROVINCE: 'yang_user_province',
  STATS: 'yang_game_stats',
  RANKS: 'yang_province_ranks',
  SETTINGS: 'yang_settings'
};

class StorageManager {
  constructor() {
    this.init();
  }

  init() {
    if (!localStorage.getItem(STORAGE_KEYS.RANKS)) {
      localStorage.setItem(STORAGE_KEYS.RANKS, JSON.stringify(DEFAULT_PROVINCE_RANKS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.USER_PROVINCE)) {
      localStorage.setItem(STORAGE_KEYS.USER_PROVINCE, 'guangdong');
    }
    if (!localStorage.getItem(STORAGE_KEYS.STATS)) {
      const defaultStats = {
        totalWins: 0,
        totalGames: 0,
        currentStreak: 0,
        todayPassCount: 1420
      };
      localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(defaultStats));
    }
  }

  // 获取用户所在省份
  getUserProvince() {
    return localStorage.getItem(STORAGE_KEYS.USER_PROVINCE) || 'guangdong';
  }

  setUserProvince(provinceId) {
    localStorage.setItem(STORAGE_KEYS.USER_PROVINCE, provinceId);
  }

  // 获取统计数据
  getStats() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.STATS)) || {};
    } catch {
      return { totalWins: 0, totalGames: 0, currentStreak: 0, todayPassCount: 1420 };
    }
  }

  // 记录一次胜利
  recordWin() {
    const stats = this.getStats();
    stats.totalWins = (stats.totalWins || 0) + 1;
    stats.totalGames = (stats.totalGames || 0) + 1;
    stats.currentStreak = (stats.currentStreak || 0) + 1;
    stats.todayPassCount = (stats.todayPassCount || 1420) + 1;
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));

    // 为所在省份贡献 1 只羊
    const userProv = this.getUserProvince();
    const ranks = this.getRanks();
    const target = ranks.find(r => r.id === userProv);
    if (target) {
      target.sheepCount += 1;
      // 重新排序
      ranks.sort((a, b) => b.sheepCount - a.sheepCount);
      localStorage.setItem(STORAGE_KEYS.RANKS, JSON.stringify(ranks));
    }
  }

  // 记录一次失败
  recordLoss() {
    const stats = this.getStats();
    stats.totalGames = (stats.totalGames || 0) + 1;
    stats.currentStreak = 0;
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
  }

  // 获取全国排行榜
  getRanks() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.RANKS));
      if (Array.isArray(data) && data.length > 0) return data;
      return [...DEFAULT_PROVINCE_RANKS];
    } catch {
      return [...DEFAULT_PROVINCE_RANKS];
    }
  }
}

export const storage = new StorageManager();
