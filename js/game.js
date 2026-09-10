/**
 * 游戏主运行状态机与交互控制器 (Game Controller)
 */
import { GAME_CONFIG, CARD_TYPES, THEMES } from './config.js';
import { updateOcclusions, getAvailableCards } from './collision.js';
import { buildLevel, shuffle } from './solver.js';
import { sound } from './audio.js';
import { storage } from './storage.js';

class GameManager {
  constructor() {
    this.currentLevel = 2; // 默认第2关 (地狱模式)
    this.currentTheme = 'pasture';
    this.boardCards = [];
    this.dockCards = [];
    this.holdingCards = [];
    this.moveHistory = [];
    this.isProcessing = false;
    this.boosters = {
      shift: 1,
      undo: 1,
      shuffle: 1
    };

    this.dom = {};
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.applyTheme(this.currentTheme);
    this.startLevel(this.currentLevel);
    this.updateStatsDisplay();
  }

  cacheDom() {
    this.dom.stage = document.getElementById('game-stage');
    this.dom.board = document.getElementById('board-container');
    this.dom.dockContainer = document.getElementById('dock-container');
    this.dom.dockCardsLayer = document.getElementById('dock-cards-layer');
    this.dom.holdingZone = document.getElementById('holding-zone');
    this.dom.holdingSlots = document.getElementById('holding-slots');
    this.dom.fxLayer = document.getElementById('fx-layer');
    this.dom.slotCounter = document.getElementById('slot-counter');
    this.dom.statRemain = document.getElementById('stat-remain');
    this.dom.statPass = document.getElementById('stat-pass');
    this.dom.levelBadge = document.getElementById('level-badge');
    this.dom.difficultyPill = document.getElementById('difficulty-pill');

    // 道具按钮角标
    this.dom.badgeShift = document.getElementById('badge-shift');
    this.dom.badgeUndo = document.getElementById('badge-undo');
    this.dom.badgeShuffle = document.getElementById('badge-shuffle');
  }

  bindEvents() {
    // 监听键盘按键便于快捷调试
    window.addEventListener('keydown', (e) => {
      if (e.key === '1') this.useBooster('shift');
      if (e.key === '2') this.useBooster('undo');
      if (e.key === '3') this.useBooster('shuffle');
      if (e.key === 'r' || e.key === 'R') this.restartCurrentLevel();
    });
  }

  // 启动新关卡
  startLevel(levelNumber) {
    this.currentLevel = levelNumber;
    this.dockCards = [];
    this.holdingCards = [];
    this.moveHistory = [];
    this.isProcessing = false;
    this.boosters = { shift: 1, undo: 1, shuffle: 1 };
    this.updateBoosterBadges();

    // 更新界面关卡标签
    if (this.dom.levelBadge) {
      this.dom.levelBadge.innerText = `第 ${levelNumber} 关`;
    }
    if (this.dom.difficultyPill) {
      if (levelNumber === 1) {
        this.dom.difficultyPill.innerText = '新手教程 100%';
        this.dom.difficultyPill.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-sm border border-white/40';
      } else {
        this.dom.difficultyPill.innerText = '地狱模式 0.01%';
        this.dom.difficultyPill.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white shadow-sm border border-white/40';
      }
    }

    // 生成关卡卡牌
    this.boardCards = buildLevel(levelNumber);

    this.renderBoard();
    this.renderDock();
    this.renderHoldingZone();
  }

  restartCurrentLevel() {
    this.startLevel(this.currentLevel);
  }

  switchLevel() {
    const nextLevel = this.currentLevel === 1 ? 2 : 1;
    this.startLevel(nextLevel);
  }

  // 更新道具剩余使用角标
  updateBoosterBadges() {
    if (this.dom.badgeShift) this.dom.badgeShift.innerText = this.boosters.shift;
    if (this.dom.badgeUndo) this.dom.badgeUndo.innerText = this.boosters.undo;
    if (this.dom.badgeShuffle) this.dom.badgeShuffle.innerText = this.boosters.shuffle;
  }

  // 更新今日通关人数与实时数据展示
  updateStatsDisplay() {
    const stats = storage.getStats();
    if (this.dom.statPass) {
      this.dom.statPass.innerText = (stats.todayPassCount || 1420).toLocaleString();
    }
  }

  // -------------------------------------------------------------
  // 渲染层：牌桌、遮挡、3D阴影与卡牌
  // -------------------------------------------------------------
  renderBoard() {
    const { newlyUnlockedIds } = updateOcclusions(this.boardCards);
    const container = this.dom.board;
    container.innerHTML = '';

    const activeCards = this.boardCards.filter(c => c.status === 'board');
    if (this.dom.statRemain) {
      this.dom.statRemain.innerText = activeCards.length;
    }

    activeCards.forEach(card => {
      const el = document.createElement('div');
      el.id = `card-${card.id}`;

      // 组装卡牌CSS类
      let classes = ['card-tile', 'absolute', 'rounded-xl', 'flex', 'items-center', 'justify-center', 'cursor-pointer', 'border-2', 'select-none'];
      if (card.blocked) {
        classes.push('blocked');
      }
      if (newlyUnlockedIds.includes(card.id)) {
        classes.push('just-unlocked');
      }

      el.className = classes.join(' ');
      el.style.width = `${GAME_CONFIG.CARD_WIDTH}px`;
      el.style.height = `${GAME_CONFIG.CARD_HEIGHT}px`;
      el.style.left = `${card.x}px`;
      el.style.top = `${card.y}px`;
      // Z轴层深与纵向排序自然遮盖
      el.style.zIndex = card.layer * 10 + Math.floor(card.y / 20);

      // 设定卡牌表面颜色
      el.style.backgroundColor = card.type.color;
      el.style.borderColor = card.type.border;

      // 卡面图标与拟物轻微内阴影
      el.innerHTML = `
        <div class="text-2xl pointer-events-none drop-shadow-sm select-none">${card.type.icon}</div>
      `;

      el.onclick = () => this.handleCardClick(card);
      container.appendChild(el);
    });
  }

  // 渲染收集卡槽 (7格)
  renderDock() {
    const layer = this.dom.dockCardsLayer;
    layer.innerHTML = '';

    const currentLen = this.dockCards.length;
    if (this.dom.slotCounter) {
      this.dom.slotCounter.innerText = `${currentLen} / ${GAME_CONFIG.DOCK_CAPACITY}`;
      if (currentLen >= 5) {
        this.dom.slotCounter.className = 'text-rose-600 font-extrabold animate-pulse';
      } else {
        this.dom.slotCounter.className = 'text-amber-950 font-bold';
      }
    }

    this.dockCards.forEach((card) => {
      const el = document.createElement('div');
      el.id = `dock-card-${card.id}`;
      el.className = 'card-tile rounded-xl flex items-center justify-center border-2 shadow-md select-none transition-all duration-200 pointer-events-auto';
      el.style.width = '42px';
      el.style.height = '48px';
      el.style.backgroundColor = card.type.color;
      el.style.borderColor = card.type.border;
      el.innerHTML = `<span class="text-2xl">${card.type.icon}</span>`;
      layer.appendChild(el);
    });
  }

  // 渲染移出暂存区
  renderHoldingZone() {
    const zone = this.dom.holdingZone;
    const slots = this.dom.holdingSlots;
    slots.innerHTML = '';

    if (this.holdingCards.length === 0) {
      zone.classList.add('hidden');
      zone.classList.remove('flex');
      return;
    }

    zone.classList.remove('hidden');
    zone.classList.add('flex');

    this.holdingCards.forEach(card => {
      const el = document.createElement('div');
      el.className = 'w-10 h-11 rounded-lg flex items-center justify-center border-2 border-amber-400 bg-white shadow-md cursor-pointer hover:scale-105 active:scale-95 transition';
      el.innerHTML = `<span class="text-xl">${card.type.icon}</span>`;
      el.title = '点击重新取回卡槽';
      el.onclick = () => this.retrieveHoldingCard(card);
      slots.appendChild(el);
    });
  }

  // -------------------------------------------------------------
  // 点击与消除流转核心
  // -------------------------------------------------------------
  handleCardClick(card) {
    if (this.isProcessing) return;

    if (card.blocked) {
      sound.play('blocked');
      const el = document.getElementById(`card-${card.id}`);
      if (el) {
        el.classList.remove('shake-anim');
        void el.offsetWidth; // 触发回流重启动画
        el.classList.add('shake-anim');
      }
      return;
    }

    if (this.dockCards.length >= GAME_CONFIG.DOCK_CAPACITY) {
      return;
    }

    sound.play('click');

    // 保存上一步历史，供“撤回”道具使用
    this.moveHistory.push({
      card: { ...card },
      boardIndex: this.boardCards.findIndex(c => c.id === card.id)
    });

    // 从桌面转移到卡槽
    card.status = 'dock';

    // 智能插入排序：相同图案卡牌在槽位中紧密相邻，消除反馈极爽！
    let insertIndex = this.dockCards.length;
    for (let i = 0; i < this.dockCards.length; i++) {
      if (this.dockCards[i].type.id === card.type.id) {
        insertIndex = i + 1;
      }
    }
    this.dockCards.splice(insertIndex, 0, card);

    // 刷新渲染
    this.renderBoard();
    this.renderDock();

    // 检测三消
    this.checkMatchAndEliminate();
  }

  // 判定三消匹配并触发爆裂粒子
  checkMatchAndEliminate() {
    const counts = {};
    this.dockCards.forEach(c => {
      counts[c.type.id] = (counts[c.type.id] || 0) + 1;
    });

    let matchTypeId = null;
    for (const [typeId, count] of Object.entries(counts)) {
      if (count >= GAME_CONFIG.MATCH_COUNT) {
        matchTypeId = typeId;
        break;
      }
    }

    if (matchTypeId) {
      this.isProcessing = true;

      // 视觉光效延迟，增强打击感
      setTimeout(() => {
        sound.play('match');
        this.spawnSparks();

        // 移除匹配的 3 张
        let removed = 0;
        this.dockCards = this.dockCards.filter(c => {
          if (c.type.id === matchTypeId && removed < GAME_CONFIG.MATCH_COUNT) {
            removed++;
            return false;
          }
          return true;
        });

        this.renderDock();
        this.isProcessing = false;

        // 消除完成后检测是否胜利
        this.checkGameStatus();
      }, 150);
    } else {
      this.checkGameStatus();
    }
  }

  // 检测胜负
  checkGameStatus() {
    const remainingBoard = this.boardCards.filter(c => c.status === 'board').length;
    
    // 胜利条件：桌面无牌、槽位无牌、暂存无牌
    if (remainingBoard === 0 && this.dockCards.length === 0 && this.holdingCards.length === 0) {
      sound.play('win');
      storage.recordWin();
      this.updateStatsDisplay();
      setTimeout(() => this.openModal('victory'), 350);
      return;
    }

    // 失败条件：收集槽满 7 张
    if (this.dockCards.length >= GAME_CONFIG.DOCK_CAPACITY) {
      sound.play('gameover');
      storage.recordLoss();
      setTimeout(() => this.openModal('gameover'), 350);
    }
  }

  // 消除时绽放金星粒子
  spawnSparks() {
    const fx = this.dom.fxLayer;
    if (!fx) return;

    for (let i = 0; i < 15; i++) {
      const star = document.createElement('div');
      star.className = 'absolute text-base pointer-events-none transition-all duration-700 ease-out';
      star.innerText = ['✨', '⭐', '🌟', '🎉', '💫'][Math.floor(Math.random() * 5)];
      star.style.left = `${110 + Math.random() * 130}px`;
      star.style.bottom = `${75 + Math.random() * 45}px`;
      fx.appendChild(star);

      setTimeout(() => {
        star.style.transform = `translate(${Math.random() * 120 - 60}px, ${-Math.random() * 140 - 50}px) scale(${1.4 + Math.random() * 0.8}) rotate(${Math.random() * 360}deg)`;
        star.style.opacity = '0';
      }, 20);

      setTimeout(() => star.remove(), 750);
    }
  }

  // -------------------------------------------------------------
  // 三大核心道具：移出、撤回、洗牌
  // -------------------------------------------------------------
  useBooster(type) {
    if (this.boosters[type] <= 0) {
      return;
    }

    if (type === 'shift') {
      // 道具1：移出底槽前3张卡牌至暂存区
      if (this.dockCards.length === 0) return;
      sound.play('shift');
      this.boosters.shift--;
      this.updateBoosterBadges();

      const toShift = this.dockCards.splice(0, Math.min(3, this.dockCards.length));
      this.holdingCards.push(...toShift);
      this.renderDock();
      this.renderHoldingZone();

    } else if (type === 'undo') {
      // 道具2：撤回上一步落槽的卡牌
      if (this.moveHistory.length === 0) return;
      sound.play('undo');
      this.boosters.undo--;
      this.updateBoosterBadges();

      const last = this.moveHistory.pop();
      const idxInDock = this.dockCards.findIndex(c => c.id === last.card.id);
      if (idxInDock !== -1) {
        this.dockCards.splice(idxInDock, 1);
        const original = this.boardCards.find(c => c.id === last.card.id);
        if (original) {
          original.status = 'board';
        }
        this.renderBoard();
        this.renderDock();
      }

    } else if (type === 'shuffle') {
      // 道具3：洗牌——保持桌面未消除卡牌物理坐标与层叠不变，将其图案随机重排
      const activeCards = this.boardCards.filter(c => c.status === 'board');
      if (activeCards.length === 0) return;
      sound.play('shuffle');
      this.boosters.shuffle--;
      this.updateBoosterBadges();

      const typesPool = activeCards.map(c => c.type);
      shuffle(typesPool);
      activeCards.forEach((c, idx) => {
        c.type = typesPool[idx];
      });

      // 触发界面发光刷新特效
      if (this.dom.board) {
        this.dom.board.style.filter = 'brightness(1.5) blur(1px)';
        setTimeout(() => {
          this.dom.board.style.filter = 'none';
          this.renderBoard();
        }, 180);
      }
    }
  }

  // 点击暂存区的牌，放回底槽
  retrieveHoldingCard(card) {
    if (this.dockCards.length >= GAME_CONFIG.DOCK_CAPACITY) return;
    const idx = this.holdingCards.findIndex(c => c.id === card.id);
    if (idx !== -1) {
      sound.play('click');
      this.holdingCards.splice(idx, 1);
      this.dockCards.push(card);
      this.renderHoldingZone();
      this.renderDock();
      this.checkMatchAndEliminate();
    }
  }

  // 失败复活机制
  revive() {
    this.closeModal('gameover');
    sound.play('shift');
    // 移出底槽前3张卡牌到暂存区继续游戏
    const toShift = this.dockCards.splice(0, Math.min(3, this.dockCards.length));
    this.holdingCards.push(...toShift);
    this.renderDock();
    this.renderHoldingZone();
  }

  // -------------------------------------------------------------
  // 主题与弹窗控制
  // -------------------------------------------------------------
  applyTheme(themeKey) {
    if (!THEMES[themeKey]) return;
    this.currentTheme = themeKey;
    document.documentElement.setAttribute('data-theme', themeKey);

    const theme = THEMES[themeKey];
    if (this.dom.stage) this.dom.stage.style.backgroundColor = theme.bgColor;
    if (this.dom.dockContainer) {
      this.dom.dockContainer.style.backgroundColor = theme.dockBg;
      this.dom.dockContainer.style.borderColor = theme.dockBorder;
    }

    // 重新渲染卡牌确保边框/背景色同步
    this.renderBoard();
  }

  openModal(modalId) {
    const el = document.getElementById(`modal-${modalId}`);
    if (el) {
      el.classList.remove('hidden');
      if (modalId === 'rank') {
        this.renderRankList();
      }
    }
  }

  closeModal(modalId) {
    const el = document.getElementById(`modal-${modalId}`);
    if (el) el.classList.add('hidden');
  }

  renderRankList() {
    const container = document.getElementById('rank-list-items');
    if (!container) return;

    const ranks = storage.getRanks();
    const userProv = storage.getUserProvince();

    container.innerHTML = ranks.map((r, index) => {
      const isUser = r.id === userProv;
      const rankNum = index + 1;
      let badgeStyle = 'bg-slate-300 text-slate-800';
      if (rankNum === 1) badgeStyle = 'bg-amber-500 text-white shadow';
      if (rankNum === 2) badgeStyle = 'bg-slate-400 text-white';
      if (rankNum === 3) badgeStyle = 'bg-amber-700/60 text-white';

      return `
        <div class="flex items-center justify-between p-2.5 rounded-xl border transition ${isUser ? 'bg-amber-200/80 border-amber-500 shadow-sm' : 'bg-white/80 border-amber-200'}">
          <div class="flex items-center gap-2.5">
            <span class="w-6 h-6 rounded-full font-extrabold text-xs flex items-center justify-center ${badgeStyle}">${rankNum}</span>
            <div>
              <span class="font-bold text-sm ${isUser ? 'text-amber-950 font-black' : 'text-slate-800'}">${r.name}</span>
              ${isUser ? '<span class="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-white">我的羊队</span>' : ''}
              ${r.tag ? `<span class="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-amber-400/80 text-amber-950">${r.tag}</span>` : ''}
            </div>
          </div>
          <span class="font-mono font-black text-amber-950 text-sm">${r.sheepCount.toLocaleString()} 只</span>
        </div>
      `;
    }).join('');
  }
}

// 导出全局单例
export const game = new GameManager();

// 挂载到 window 方便 HTML 行内 onclick 触发
window.game = game;
window.sound = sound;
