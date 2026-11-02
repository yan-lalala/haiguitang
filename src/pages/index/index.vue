<template>
  <view class="gothic-container" @touchstart="handleUserGesture" @click="handleUserGesture">
    <!-- 迷雾暗角全局滤镜 (理智值危急时触发血色心跳脉冲) -->
    <view class="vignette-overlay" :class="{ 'vignette-danger': sanValue <= 30 }"></view>

    <!-- 顶部庄园档案栏 -->
    <view class="manor-header">
      <view class="case-switcher" @tap="showCaseSelector = true">
        <view class="manor-seal">🗝️</view>
        <view class="case-meta">
          <text class="manor-case-num">MANOR FILE #{{ currentSoup.id.replace('case_', '') }}</text>
          <text class="case-title-text">{{ currentSoup.title }}</text>
        </view>
        <text class="switch-chevron">▼</text>
      </view>

      <view class="header-actions">
        <!-- 核心音效试听按钮 (点击必定发声) -->
        <view class="sound-test-pill" @tap.stop="listenTestSound" title="试听全套庄园音效">
          <text class="sound-pulse-icon">🔔</text>
          <text class="sound-pill-txt">试听音效</text>
        </view>

        <!-- 静音切换按钮 -->
        <view class="sound-mute-btn" @tap.stop="toggleSound" :class="{ muted: isMuted }" :title="isMuted ? '解除静音' : '静音'">
          <text class="mute-icon">{{ isMuted ? '🔇' : '🔊' }}</text>
        </view>

        <!-- 双人组队状态药丸 -->
        <view class="coop-badge" :class="{ inroom: isMultiplayer }" @tap="showCoopModal = true">
          <text class="coop-icon">{{ isMultiplayer ? '👥' : '🕯️' }}</text>
          <text class="coop-text">{{ isMultiplayer ? ('暗号:' + currentRoomId + ' · ' + roomPlayers.length + '人') : '组队探案' }}</text>
        </view>

        <!-- 设置按钮 -->
        <view class="oracle-badge" @tap="showSettings = true">
          <text class="candle-dot" :class="{ lit: apiConfig.enabled && apiConfig.apiKey }"></text>
          <text class="gear-cog">⚙</text>
        </view>
      </view>
    </view>

    <!-- 核心滚动调查区 -->
    <scroll-view class="investigation-scroll" scroll-y :scroll-top="scrollTop" scroll-with-animation>
      <!-- 羊皮纸残卷：案卷谜面 -->
      <view class="parchment-case">
        <view class="clip-pin"></view>
        <view class="case-badge-row">
          <view class="badge-left">
            <text class="gothic-stamp-tag">{{ currentSoup.category }}</text>
            <view class="danger-level">
              <text class="danger-label">诡秘度</text>
              <text class="star-rating">{{ currentSoup.difficulty }}</text>
            </view>
          </view>
          <!-- 实在猜不出时的直接揭晓入口 -->
          <view class="give-up-pill" @tap="revealTruthDirectly">
            <text class="give-up-icon">👁️</text>
            <text class="give-up-txt">揭晓答案</text>
          </view>
        </view>

        <!-- 理智值 (SAN) 条 -->
        <view class="san-bar-container">
          <view class="san-header">
            <text class="san-label">🧠 调查员理智 (SAN)</text>
            <text class="san-value" :class="{ 'san-critical': sanValue <= 30 }">{{ sanValue }} / 100</text>
          </view>
          <view class="san-track">
            <view class="san-fill" :style="{ width: sanValue + '%' }" :class="sanStatusClass"></view>
          </view>
        </view>

        <view class="case-script-box">
          <text class="old-quote">“</text>
          <text class="script-body">{{ currentSoup.question }}</text>
          <text class="old-quote right">”</text>
        </view>

        <view class="manor-decree">
          <text class="decree-icon">🕯️</text>
          <text class="decree-text" v-if="apiConfig.enabled && apiConfig.apiKey">
            【虚空大模型 ({{ apiConfig.model || 'AI' }}) 亲自执槌】向庄园主求证真伪。裁决唯有：【真】、【伪】、【无涉】、【亦真亦幻】
          </text>
          <text class="decree-text" v-else>
            【庄园管家 (内置智能判定)】向庄园主理人求证真伪。裁决唯有：【真】、【伪】、【无涉】、【亦真亦幻】
          </text>
        </view>
      </view>

      <!-- 庄园红线悬疑墙（线索碎片板） -->
      <view class="clue-corkboard">
        <view class="cork-header">
          <view class="cork-title-wrap">
            <text class="cork-main-title">🪡 缝合的真相残页</text>
            <text class="cork-stats">已拼合 {{ unlockedClueIds.length }} / {{ currentSoup.clues.length }}</text>
          </view>
          <view class="blood-track-bg">
            <view class="blood-track-fill" :style="{ width: (unlockedClueIds.length / currentSoup.clues.length * 100) + '%' }"></view>
          </view>
        </view>

        <view class="clues-patchwork">
          <view
            v-for="(clue, idx) in currentSoup.clues"
            :key="clue.id"
            class="patch-card"
            :class="[
              unlockedClueIds.includes(clue.id) ? 'patch-revealed' : 'patch-stitched',
              'tilt-' + (idx % 3)
            ]"
          >
            <view class="patch-tack"></view>
            <view class="patch-inner">
              <view class="patch-badge">
                <text v-if="unlockedClueIds.includes(clue.id)" class="revealed-eye">👁️ 证词</text>
                <text v-else class="stitched-eye">🪡 封缄</text>
              </view>
              <text class="patch-title">
                {{ unlockedClueIds.includes(clue.id) ? clue.title : '未知疑团碎片' }}
              </text>
              <text class="patch-desc" v-if="unlockedClueIds.includes(clue.id)">
                {{ clue.desc }}
              </text>
              <text class="patch-fog" v-else>
                在审讯中问出关键，撕开这块缝合封条...
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 庄园审讯纪要流 -->
      <view class="inquest-log">
        <view class="log-divider">
          <text class="divider-line"></text>
          <text class="log-title-tag">⚖️ 庄园审讯笔录 · 第 {{ history.length }} 轮</text>
          <text class="divider-line"></text>
        </view>

        <view v-if="history.length === 0" class="graveyard-empty">
          <view class="doll-icon">🧵</view>
          <text class="graveyard-text">夜幕笼罩庄园，提线木偶沉默不语。请在下方写下第一句质询...</text>
        </view>

        <view v-for="(item, index) in history" :key="index" class="inquest-entry">
          <!-- 调查员（区分我还是同伴） -->
          <view class="entry-bubble survivor-bubble" :class="{ 'partner-bubble': item.senderId && item.senderId !== myPlayerId }">
            <view class="identity-tag survivor-tag" :class="{ 'partner-tag': item.senderId && item.senderId !== myPlayerId }">
              <text class="tag-mark">{{ (item.senderId && item.senderId !== myPlayerId) ? '🤝' : '🪡' }}</text>
              <text class="tag-name">{{ item.senderName || '调查员' }}</text>
            </view>
            <text class="entry-words">{{ item.question }}</text>
          </view>

          <!-- 庄园裁判（DM）判词 -->
          <view class="entry-bubble manor-bubble">
            <view class="manor-ruling-bar">
              <view class="identity-tag hunter-tag">
                <text class="tag-mark">🗝️</text>
                <text class="tag-name">{{ item.modelName ? ('庄园主 · ' + item.modelName) : '庄园裁决' }}</text>
              </view>
              <!-- 哥特火漆印章判决 -->
              <view class="wax-seal" :class="getWaxSealClass(item.judgment)">
                <text class="wax-seal-text">{{ formatJudgmentText(item.judgment) }}</text>
              </view>
            </view>

            <text class="ruling-echo">{{ item.dmComment }}</text>

            <!-- 揭穿线索的火光特效 -->
            <view v-if="item.newClue" class="blood-clue-ribbon">
              <text class="ribbon-flame">🔥</text>
              <text class="ribbon-text">撕碎迷雾！拼获关键证据【{{ item.newClue.title }}】</text>
            </view>
          </view>
        </view>

        <view v-if="isThinking" class="manor-whisper">
          <text class="whisper-candle">🕯️</text>
          <text class="whisper-text">
            {{ (apiConfig.enabled && apiConfig.apiKey) ? `大模型 (${apiConfig.model || 'AI'}) 正在审视案卷推演真伪...` : '留声机吱呀作响，暗夜里的目光正在凝视案卷...' }}
          </text>
        </view>
      </view>
    </scroll-view>

    <!-- 快捷调查手签（刑侦通用破局思路 + 3阶灵感手记） -->
    <view class="manor-hints">
      <scroll-view scroll-x class="hints-rail">
        <view class="hints-track">
          <!-- 💡 三阶迷雾灵感手记入口胶囊 -->
          <view class="hint-book-pill" @tap="showHintsModal = true">
            <text class="hint-book-icon">💡</text>
            <text class="hint-book-txt">灵感手记 ({{ currentUnlockedHintLevel }}/{{ currentCaseHints.length }})</text>
          </view>

          <!-- 通用刑侦探究手签 (绝无剧透) -->
          <view
            v-for="(q, i) in generalQuestions"
            :key="i"
            class="clue-tag-btn"
            @tap="useQuickHint(q)"
          >
            <text class="tag-pin">📌</text>
            <text class="tag-label">{{ q }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 底部操作台（打字机金属质感） -->
    <view class="typewriter-desk">
      <!-- 火漆印章风格：指证结案 -->
      <button class="blood-verdict-btn" @tap="openSolveModal">
        <text class="verdict-icon">⚖️</text>
        <text class="verdict-label">指证 ({{ unlockedClueIds.length }}/{{ currentSoup.clues.length }})</text>
      </button>

      <!-- 凹槽打字机输入框 -->
      <view class="typewriter-trough">
        <input
          class="desk-input"
          v-model="inputQuestion"
          placeholder="敲击键盘向庄园主提问..."
          placeholder-style="color: #6d6255; font-style: italic;"
          confirm-type="send"
          :adjust-position="true"
          :cursor-spacing="20"
          @confirm="sendQuestion"
        />
        <button
          class="seal-send-btn"
          :disabled="!inputQuestion.trim() || isThinking"
          @tap="sendQuestion"
        >
          发问
        </button>
      </view>
    </view>

    <!-- 模态框 1：绝密庄园档案库 -->
    <view class="gothic-modal-mask" v-if="showCaseSelector" @tap="showCaseSelector = false">
      <view class="parchment-modal-box case-selector-box" @tap.stop>
        <view class="modal-gothic-header">
          <text class="modal-gothic-title">🗝️ 庄园尘封卷宗 ({{ allSoups.length }}卷)</text>
          <text class="modal-dismiss" @tap="showCaseSelector = false">✕</text>
        </view>

        <!-- 召唤大模型现场编织新卷宗入口 -->
        <view class="ai-create-banner" @tap="showCaseCreator = !showCaseCreator">
          <view class="ai-banner-left">
            <text class="ai-banner-icon">✨</text>
            <view class="ai-banner-text">
              <text class="ai-banner-title">召唤虚空：大模型现场编织全新卷宗</text>
              <text class="ai-banner-sub">{{ (apiConfig.enabled && apiConfig.apiKey) ? `由【${apiConfig.model || '大模型'}】现场推演未世之谜` : '未连接大模型时采用离线神秘宝库' }}</text>
            </view>
          </view>
          <text class="ai-banner-toggle">{{ showCaseCreator ? '▲ 收起' : '▼ 展开' }}</text>
        </view>

        <!-- 展开的 AI 织造面板 -->
        <view v-if="showCaseCreator" class="ai-creator-panel">
          <view class="creator-category-row">
            <text class="creator-lbl">风格类别：</text>
            <view class="cat-chips">
              <text
                v-for="cat in ['细思极恐', '经典硬核', '荒诞哥特', '温情反转']"
                :key="cat"
                class="cat-chip"
                :class="{ active: aiGenerateCategory === cat }"
                @tap="aiGenerateCategory = cat"
              >{{ cat }}</text>
            </view>
          </view>

          <view class="creator-input-row">
            <input
              class="creator-theme-input"
              v-model="aiGenerateTheme"
              placeholder="自定义主题关键词 (如: 提线木偶、暴风雪山庄、午夜电梯，留空则随机)"
              maxlength="30"
            />
          </view>

          <button class="ai-summon-btn" :disabled="isGeneratingCase" @tap="createAICase">
            {{ isGeneratingCase ? '⏳ 大模型正在虚空推演谜底...' : '🔮 立即编织全新绝密案件！' }}
          </button>
        </view>

        <!-- 案卷列表 (支持平滑滚动) -->
        <scroll-view scroll-y class="manor-file-scroll">
          <view class="manor-file-list">
            <view
              v-for="soup in allSoups"
              :key="soup.id"
              class="manor-file-item"
              :class="{ current: soup.id === currentSoup.id, 'is-ai': soup.isAICreated }"
              @tap="switchCase(soup)"
            >
              <view class="file-stitch"></view>
              <view class="file-text-meta">
                <view class="file-title-line">
                  <text class="file-item-title">{{ soup.title }}</text>
                  <text v-if="soup.isAICreated" class="ai-tag">✨ AI自创</text>
                </view>
                <text class="file-item-sub">{{ soup.category }} · {{ soup.difficulty }}</text>
              </view>
              <view class="file-item-actions">
                <text class="file-investigating" v-if="soup.id === currentSoup.id">🕯️ 翻阅中</text>
                <text v-if="soup.isAICreated" class="file-del-btn" @tap.stop="deleteAICase(soup, $event)" title="销毁此卷宗">🗑️</text>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 模态框 2：窥秘设置（AI 接口） -->
    <view class="gothic-modal-mask" v-if="showSettings" @tap="showSettings = false">
      <view class="parchment-modal-box" @tap.stop>
        <view class="modal-gothic-header">
          <text class="modal-gothic-title">🔮 窥秘之镜配置</text>
          <text class="modal-dismiss" @tap="showSettings = false">✕</text>
        </view>
        <view class="settings-body">
          <view class="setting-toggle-row">
            <text class="setting-desc-label">连接虚空大模型 (LLM)：</text>
            <switch :checked="apiConfig.enabled" @change="e => apiConfig.enabled = e.detail.value" color="#991b1b" />
          </view>
          <!-- 快捷预设模板 -->
          <view v-if="apiConfig.enabled" class="presets-section">
            <text class="presets-title">⚡ 一键填入主流大模型参数：</text>
            <view class="presets-pills">
              <view class="preset-pill" @tap="applyPreset('deepseek')">DeepSeek</view>
              <view class="preset-pill" @tap="applyPreset('kimi')">Kimi (月之暗面)</view>
              <view class="preset-pill" @tap="applyPreset('glm')">智谱GLM-4</view>
              <view class="preset-pill" @tap="applyPreset('openai')">OpenAI</view>
            </view>
          </view>

          <view v-if="apiConfig.enabled" class="gothic-inputs-group">
            <text class="gothic-field-name">Endpoint 仪式端点:</text>
            <input class="gothic-input-field" v-model="apiConfig.endpoint" placeholder="https://api.deepseek.com/v1/chat/completions" />

            <text class="gothic-field-name">Secret Key 密匙 (API Key):</text>
            <input class="gothic-input-field" v-model="apiConfig.apiKey" placeholder="sk-xxxx" password />

            <text class="gothic-field-name">Entity Model 实体代码 (Model ID):</text>
            <input class="gothic-input-field" v-model="apiConfig.model" placeholder="deepseek-chat" />
          </view>
          <view class="grimoire-note">
            <text class="grimoire-text">📜 开启后，大模型将以【上帝视角】通读谜面与所有隐藏真相，亲自担任庄园主理人（DM），裁决玩家的发问与终局指证！</text>
          </view>
          <view class="settings-action-btns">
            <button v-if="apiConfig.enabled" class="gothic-test-btn" @tap="testApiConnection">🧪 测通大模型</button>
            <button class="gothic-confirm-btn" @tap="saveSettings">刻印并任命为主理人</button>
          </view>
        </view>
      </view>
    </view>

    <!-- 模态框 3：双人组队探案契约（核心联机面板） -->
    <view class="gothic-modal-mask" v-if="showCoopModal" @tap="showCoopModal = false">
      <view class="parchment-modal-box coop-modal-box" @tap.stop>
        <view class="modal-gothic-header">
          <text class="modal-gothic-title">🕯️ 庄园同伴契约</text>
          <text class="modal-dismiss" @tap="showCoopModal = false">✕</text>
        </view>

        <!-- 我的代号 -->
        <view class="coop-name-section">
          <text class="coop-field-label">我的调查员代号：</text>
          <input class="coop-name-input" v-model="myPlayerName" placeholder="例如: 艾玛·伍兹" maxlength="8" />
        </view>

        <!-- 已经处于房间中 -->
        <view v-if="isMultiplayer" class="active-room-box">
          <view class="room-cipher-banner">
            <text class="cipher-lbl">当前庄园暗号</text>
            <text class="cipher-val">{{ currentRoomId }}</text>
            <text class="cipher-copy-tip" @tap="copyRoomCipher">📋 点击复制暗号</text>
          </view>
          <view class="room-fellows">
            <text class="fellows-title">已落座的同伴 ({{ roomPlayers.length }}/2)：</text>
            <view class="fellow-list">
              <view v-for="p in roomPlayers" :key="p.id" class="fellow-chip">
                <text class="fellow-role-icon">{{ p.role === 'host' ? '👑' : '🤝' }}</text>
                <text class="fellow-name">{{ p.name }} {{ p.id === myPlayerId ? '(我)' : '' }}</text>
              </view>
            </view>
          </view>
          <button class="leave-room-btn" @tap="leaveRoom">解除组队契约</button>
        </view>

        <!-- 未联机：可创建或加入 -->
        <view v-else class="unjoined-coop-section">
          <view class="coop-actions-tabs">
            <!-- 选项 A：创建暗号房间 -->
            <view class="coop-create-pane">
              <text class="coop-action-desc">成为首位调查员，开启案卷并等待同伴加入：</text>
              <button class="gothic-btn-main" @tap="createRoom">🕯️ 开启暗号房间</button>
            </view>

            <view class="coop-or-divider">
              <text class="or-line"></text>
              <text class="or-txt">或者踏入已有迷雾</text>
              <text class="or-line"></text>
            </view>

            <!-- 选项 B：输入暗号加入 -->
            <view class="coop-join-pane">
              <input
                class="cipher-input"
                v-model="inputJoinRoomId"
                placeholder="输入同伴给你的 4 位暗号"
                type="number"
                maxlength="6"
              />
              <button
                class="gothic-btn-secondary"
                :disabled="!inputJoinRoomId.trim()"
                @tap="joinRoom"
              >
                踏入同伴案室
              </button>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 模态框 4：还原真相指证席 -->
    <view class="gothic-modal-mask" v-if="showSolveModal" @tap="showSolveModal = false">
      <view class="parchment-modal-box solve-modal" @tap.stop>
        <view class="modal-gothic-header">
          <text class="modal-gothic-title">⚖️ 呈递你的案件复盘</text>
          <text class="modal-dismiss" @tap="showSolveModal = false">✕</text>
        </view>
        <view class="solve-body">
          <!-- 拼合线索状态条 -->
          <view class="solve-clue-bar">
            <view class="solve-clue-meta">
              <text class="solve-clue-icon">🧩</text>
              <text class="solve-clue-status">
                {{ unlockedClueIds.length >= currentSoup.clues.length ? '已集齐全部真相拼图 (4/4)' : `已拼合 ${unlockedClueIds.length}/${currentSoup.clues.length} 块残页 (未全解，已按现有线索自动串联)` }}
              </text>
            </view>
            <view class="re-assemble-pill" @tap="autoAssembleClues(true)">
              <text class="re-assemble-txt">🔄 重新拼凑</text>
            </view>
          </view>
          <text class="solve-lead">已自动将已解开的真相残页串联并填入，可直接落槌或补充润色：</text>
          <textarea
            class="gothic-textarea"
            v-model="truthAttemptInput"
            placeholder="写下完整的因果脉络：死者是谁？为何在此？究竟发生了怎样的惨剧？..."
            maxlength="500"
          ></textarea>
          <button class="blood-strike-btn" :disabled="!truthAttemptInput.trim() || isThinking" @tap="submitTruth">
            落槌指证！
          </button>
          <view class="solve-give-up-link" @tap="revealTruthDirectly">
            <text class="solve-give-up-txt">实在猜不出来？破开封泥直接揭晓真相 ➔</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 模态框 5：通关大捷！庄园钟声结案 -->
    <view class="gothic-modal-mask" v-if="showCaseSolvedModal">
      <view class="parchment-modal-box verdict-completed-box" @tap.stop>
        <view class="gothic-blood-stamp">
          <text class="stamp-char">CASE CLOSED</text>
          <text class="stamp-sub-char">真相大白 · 逃出庄园</text>
        </view>
        <view class="revelation-score">
          <text class="score-title">推演契合度</text>
          <text class="score-percent">{{ finalScore }}%</text>
        </view>
        <view class="true-parchment-wrap">
          <text class="truth-heading">【尘封的真相】</text>
          <text class="truth-paragraph">{{ currentSoup.truth }}</text>
        </view>
        <view class="investigation-tally">
          <view class="tally-box">
            <text class="tally-val">{{ history.length }}</text>
            <text class="tally-tag">发问次数</text>
          </view>
          <view class="tally-box">
            <text class="tally-val">{{ unlockedClueIds.length }}/{{ currentSoup.clues.length }}</text>
            <text class="tally-tag">解开疑团</text>
          </view>
        </view>
        <view class="verdict-buttons">
          <button class="generate-poster-btn" @tap="openPosterModal">
            <text class="btn-icon">📜</text>
            <text class="btn-text">生成绝密结案战报海报 (小红书/朋友圈)</text>
          </button>
          <button class="next-manor-btn" @tap="nextCase">开启下一桩卷宗 ➔</button>
          <button class="reread-log-btn" @tap="showCaseSolvedModal = false">回顾审讯笔录</button>
        </view>
      </view>
    </view>

    <!-- 模态框 6：绝密档案海报完整长图预览与保存 -->
    <view class="gothic-modal-mask" v-if="showPosterModal" @tap="showPosterModal = false">
      <view class="poster-preview-box" @tap.stop>
        <view class="modal-gothic-header">
          <text class="modal-gothic-title">📜 绝密档案封缄战报</text>
          <text class="modal-dismiss" @tap="showPosterModal = false">✕</text>
        </view>

        <!-- 海报完整预览滚动区 (所见即所得，从头到尾绝不截断) -->
        <scroll-view scroll-y class="poster-scroll-wrapper">
          <view class="poster-scroll-content">
            <!-- 庄园眉首 -->
            <view class="p-manor-sign">
              <text class="p-sign-en">🗝️  E U R Y D I C E   M A N O R  🗝️</text>
              <text class="p-sign-sub">—— 绝 密 案 卷 结 案 卷 宗 ——</text>
            </view>

            <!-- 案件标题与诡秘星级 -->
            <view class="p-case-header">
              <text class="p-case-title">《 {{ currentSoup.title }} 》</text>
              <text class="p-case-badge">[ {{ currentSoup.category }} ] · 诡秘度 {{ currentSoup.difficulty }}</text>
            </view>

            <!-- 倾斜鲜红火漆钢印 -->
            <view class="p-stamp-outer">
              <view class="p-stamp-box">
                <text class="p-stamp-en">CASE CLOSED</text>
                <text class="p-stamp-cn">真 相 大 白 · 逃 出 庄 园</text>
              </view>
            </view>

            <!-- 战绩 4 格仪表盘 -->
            <view class="p-stats-grid">
              <view class="p-stat-box">
                <text class="p-stat-val color-amber">{{ finalScore }}%</text>
                <text class="p-stat-lbl">推演契合度</text>
              </view>
              <view class="p-stat-box">
                <text class="p-stat-val color-sky">{{ history.length }}</text>
                <text class="p-stat-lbl">发问质询</text>
              </view>
              <view class="p-stat-box">
                <text class="p-stat-val color-green">{{ sanValue }}</text>
                <text class="p-stat-lbl">幸存理智</text>
              </view>
              <view class="p-stat-box">
                <text class="p-stat-val color-pink">{{ unlockedClueIds.length }}/{{ currentSoup.clues.length }}</text>
                <text class="p-stat-lbl">解开疑团</text>
              </view>
            </view>

            <!-- 哲学金句卡片 (小红书精粹) -->
            <view class="p-quote-card">
              <text class="p-quote-mark">“</text>
              <text class="p-quote-body">{{ currentSoup.quote || '迷雾终将散尽，真相永不沉沦。' }}</text>
              <text class="p-quote-mark-r">”</text>
            </view>

            <!-- 案情始末真相全貌 -->
            <view class="p-truth-card">
              <text class="p-truth-title">【案情始末真相】</text>
              <text class="p-truth-content">{{ currentSoup.truth }}</text>
            </view>

            <!-- 底部调查员签名与日期 -->
            <view class="p-footer-row">
              <view class="p-footer-left">
                <text class="p-investigator-name">首席调查员：{{ myPlayerName }}</text>
                <text class="p-archive-date">卷宗封存日期：{{ getTodayDate() }}</text>
              </view>
              <view class="p-footer-right">
                <text class="p-brand-tag">海 龟 汤 探 案 馆</text>
                <text class="p-qr-hint">微信搜索 · 扫码共破绝密案卷</text>
              </view>
            </view>
          </view>
        </scroll-view>

        <!-- 离屏 Canvas (负责真实生成完整高像素长图并保存到本地) -->
        <view class="offscreen-canvas-holder">
          <canvas
            canvas-id="posterCanvas"
            id="posterCanvas"
            style="width: 640px; height: 1020px;"
          ></canvas>
        </view>

        <!-- 保存按钮 -->
        <view class="poster-actions">
          <button class="save-poster-btn" @tap="savePoster">
            📥 保存高清海报至相册
          </button>
        </view>
      </view>
    </view>

    <!-- 模态框 7：三阶迷雾灵感手记 (防剧透阶梯启发) -->
    <view class="gothic-modal-mask" v-if="showHintsModal" @tap="showHintsModal = false">
      <view class="parchment-modal-box hints-modal-box" @tap.stop>
        <view class="modal-gothic-header">
          <text class="modal-gothic-title">💡 庄园灵感手记 · 阶梯密笺</text>
          <text class="modal-dismiss" @tap="showHintsModal = false">✕</text>
        </view>

        <view class="hints-modal-sub">
          <text class="hints-lore-desc">
            每揭开一层封印需耗费 10 点 SAN（理智值）。层层递进，绝不提前暴露核心真相。
          </text>
        </view>

        <view class="hint-tiers-list">
          <view
            v-for="(hint, idx) in currentCaseHints"
            :key="idx"
            class="hint-tier-card"
            :class="{ 'tier-unlocked': idx < currentUnlockedHintLevel, 'tier-locked': idx >= currentUnlockedHintLevel }"
          >
            <view class="tier-header">
              <view class="tier-badge">
                <text class="tier-level-num">第 {{ hint.level || (idx + 1) }} 阶</text>
                <text class="tier-title">{{ hint.title }}</text>
              </view>
              <text class="tier-status-tag">
                {{ idx < currentUnlockedHintLevel ? '🔓 已拆封' : '🔒 密漆封存' }}
              </text>
            </view>

            <view class="tier-body">
              <text v-if="idx < currentUnlockedHintLevel" class="tier-unlocked-text">
                {{ hint.text }}
              </text>
              <view v-else class="tier-locked-placeholder">
                <text class="tier-blur-lock">🕯️ 此密笺已被庄园红蜡封缄，推演受阻时方可破译</text>
              </view>
            </view>
          </view>
        </view>

        <view class="hints-modal-footer">
          <button
            v-if="currentUnlockedHintLevel < currentCaseHints.length"
            class="unlock-hint-btn"
            :disabled="sanValue < 10"
            @tap="unlockNextHint"
          >
            <text class="unlock-btn-icon">🪡</text>
            <text class="unlock-btn-text">撕开第 {{ currentUnlockedHintLevel + 1 }} 阶封条 (消耗 10 SAN)</text>
          </button>
          <view v-else class="all-hints-unlocked-tip">
            <text>⚜️ 本卷宗的所有灵感密笺已全部解封 ⚜️</text>
          </view>
          <view class="hints-give-up-row" @tap="revealTruthDirectly">
            <text class="hints-give-up-txt">🕯️ 实在推导不出？破拆绝密封条，直接揭晓全案真相 ➔</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { SOUPS } from '../../data/soups.js';
import { judgeQuestion, evaluateTruthAttempt, generateAICase } from '../../utils/judge.js';
import { manorSocket } from '../../utils/socket.js';
import { manorAudio } from '../../utils/audio.js';
import { renderPosterToCanvas } from '../../utils/poster.js';

export default {
  data() {
    return {
      allSoups: SOUPS,
      currentSoupIndex: 0,
      unlockedClueIds: [],
      history: [],
      inputQuestion: '',
      truthAttemptInput: '',
      isThinking: false,
      scrollTop: 99999,

      // 理智值与音效系统
      sanValue: 100,
      isMuted: false,

      showCaseSelector: false,
      showSettings: false,
      showSolveModal: false,
      showCaseSolvedModal: false,
      showPosterModal: false,
      showHintsModal: false,
      unlockedHintLevels: {},
      finalScore: 0,
      isDirectlyRevealed: false,

      // AI 卷宗生成状态
      showCaseCreator: false,
      aiGenerateTheme: '',
      aiGenerateCategory: '细思极恐',
      isGeneratingCase: false,

      // 联机状态数据
      showCoopModal: false,
      isMultiplayer: false,
      currentRoomId: '',
      myPlayerId: '',
      myPlayerName: '调查员·' + Math.floor(100 + Math.random() * 900),
      roomPlayers: [],
      inputJoinRoomId: '',

      apiConfig: {
        enabled: false,
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: '',
        model: 'deepseek-chat'
      }
    };
  },
  computed: {
    currentSoup() {
      return this.allSoups[this.currentSoupIndex] || this.allSoups[0];
    },
    sanStatusClass() {
      if (this.sanValue > 60) return 'san-safe';
      if (this.sanValue > 30) return 'san-warning';
      return 'san-danger';
    },
    currentCaseHints() {
      if (this.currentSoup.hints && Array.isArray(this.currentSoup.hints) && this.currentSoup.hints.length > 0) {
        return this.currentSoup.hints;
      }
      return [
        { level: 1, title: '反常动机', text: '当事人展现出的反常行为并非偶然，是否存在某种不可抗拒的外力或深层诱因？' },
        { level: 2, title: '环境与感官', text: '死者当时所感知的环境，与其物理现实是否存在致命的认知偏差？' },
        { level: 3, title: '隐蔽的第三者', text: '现场除了表面上的人物，是否还有一个未被直接提及但决定了命运走向的存在？' }
      ];
    },
    currentUnlockedHintLevel() {
      return (this.unlockedHintLevels && this.unlockedHintLevels[this.currentSoup.id]) || 0;
    },
    generalQuestions() {
      return [
        '现场是否存在第二个人？',
        '死者（主角）的行为是自愿的吗？',
        '死因是否与异常的感官错觉有关？',
        '事件发生在一个封闭且与世隔绝的密闭空间吗？',
        '主角生前的特殊身份或职业是破局关键吗？',
        '故事中隐藏着某种极端的欺骗或残酷契约吗？'
      ];
    },
    suggestedQuestions() {
      if (this.currentSoup.suggestedQuestions && this.currentSoup.suggestedQuestions.length > 0) {
        return this.currentSoup.suggestedQuestions;
      }
      return this.generalQuestions;
    }
  },
  onLoad() {
    try {
      const savedConfig = uni.getStorageSync('turtle_soup_api_config');
      if (savedConfig) {
        this.apiConfig = Object.assign(this.apiConfig, JSON.parse(savedConfig));
      }
    } catch (e) {}

    // 读取本地保存的 AI 自创卷宗
    try {
      const savedAICases = uni.getStorageSync('manor_custom_ai_cases');
      if (savedAICases) {
        const customCases = JSON.parse(savedAICases);
        if (Array.isArray(customCases) && customCases.length > 0) {
          this.allSoups = [...SOUPS, ...customCases];
        }
      }
    } catch (e) {}

    // 绑定 WebSocket 协同事件
    this.setupSocketListeners();
  },
  mounted() {
    // #ifdef H5
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        manorAudio.unlock();
      };
      ['click', 'touchstart', 'keydown'].forEach(evt => {
        window.addEventListener(evt, unlockAudio, { passive: true });
      });
    }
    // #endif
  },
  methods: {
    setupSocketListeners() {
      // 成功创建房间
      manorSocket.on('ROOM_CREATED', (data) => {
        this.isMultiplayer = true;
        this.currentRoomId = data.roomId;
        this.myPlayerId = data.player.id;
        this.roomPlayers = data.roomState.players;
        uni.showToast({ title: `房间已开启！暗号: ${data.roomId}`, icon: 'none' });
      });

      // 成功加入同伴房间
      manorSocket.on('ROOM_JOINED', (data) => {
        this.isMultiplayer = true;
        this.currentRoomId = data.roomId;
        this.myPlayerId = data.player.id;
        this.roomPlayers = data.roomState.players;

        // 同步案卷状态
        const foundIndex = this.allSoups.findIndex(s => s.id === data.roomState.soupId);
        if (foundIndex !== -1) {
          this.currentSoupIndex = foundIndex;
        }
        this.unlockedClueIds = data.roomState.unlockedClueIds || [];
        this.history = data.roomState.history || [];

        this.showCoopModal = false;
        uni.showToast({ title: '已进入同伴案室！', icon: 'success' });
      });

      // 有新同伴加入
      manorSocket.on('PLAYER_JOINED', (data) => {
        this.roomPlayers = data.roomState.players;
        uni.showToast({ title: `【${data.player.name}】踏入了庄园案室！`, icon: 'none', duration: 2500 });
      });

      // 同伴离开
      manorSocket.on('PLAYER_LEFT', (data) => {
        this.roomPlayers = data.roomState.players;
        uni.showToast({ title: '有同伴离开了庄园...', icon: 'none' });
      });

      // 房间案卷被切换
      manorSocket.on('CASE_SWITCHED', (data) => {
        const idx = this.allSoups.findIndex(s => s.id === data.soupId);
        if (idx !== -1) {
          this.currentSoupIndex = idx;
          this.unlockedClueIds = [];
          this.history = [];
          uni.showToast({ title: '案卷已被同步切换！', icon: 'none' });
        }
      });

      // 实时收到新问答与线索广播
      manorSocket.on('NEW_QUESTION_BROADCAST', (data) => {
        const item = data.qaRecord;
        // 如果是自己发的，之前可能已经推入，或者统一由此推入
        // 避免重复
        const exists = this.history.some(h => 
          h.question === item.question && 
          h.senderId === item.senderId && 
          Math.abs((h.timestamp || 0) - (item.timestamp || 0)) < 2000
        );

        if (!exists) {
          this.history.push(item);
        }

        if (data.unlockedClueIds) {
          const oldLen = this.unlockedClueIds.length;
          this.unlockedClueIds = data.unlockedClueIds;
          if (this.unlockedClueIds.length > oldLen) {
            try { uni.vibrateShort(); } catch (e) {}
          }
        }
        this.scrollToBottom();
      });

      // 终局指证同步
      manorSocket.on('TRUTH_RESULT_BROADCAST', (data) => {
        if (data.passed) {
          this.finalScore = data.score;
          this.showCaseSolvedModal = true;
          uni.showToast({ title: `同伴【${data.senderName}】成功推断出真相！`, icon: 'success' });
        } else {
          uni.showModal({
            title: `同伴【${data.senderName}】发起了指证`,
            content: `吻合度: ${data.score}%\n评语: ${data.summary}`,
            showCancel: false,
            confirmText: '继续探究'
          });
        }
      });

      // 错误提示
      manorSocket.on('ERROR', (data) => {
        uni.showModal({
          title: '庄园契约异常',
          content: data.message,
          showCancel: false
        });
      });
    },
    async createRoom() {
      try {
        await manorSocket.connect();
        manorSocket.send({
          type: 'CREATE_ROOM',
          soupId: this.currentSoup.id,
          playerName: this.myPlayerName.trim() || '调查员'
        });
      } catch (err) {
        uni.showToast({ title: '连接联机服务器失败，请确保 server.js 已启动', icon: 'none', duration: 3000 });
      }
    },
    async joinRoom() {
      const rid = this.inputJoinRoomId.trim();
      if (!rid) return;
      try {
        await manorSocket.connect();
        manorSocket.send({
          type: 'JOIN_ROOM',
          roomId: rid,
          playerName: this.myPlayerName.trim() || '调查员'
        });
      } catch (err) {
        uni.showToast({ title: '连接联机服务器失败', icon: 'none' });
      }
    },
    leaveRoom() {
      if (this.isMultiplayer) {
        manorSocket.send({ type: 'LEAVE_ROOM' });
        this.isMultiplayer = false;
        this.currentRoomId = '';
        this.roomPlayers = [];
        uni.showToast({ title: '已离开房间，恢复单人推演', icon: 'none' });
      }
    },
    copyRoomCipher() {
      try {
        uni.setClipboardData({
          data: this.currentRoomId,
          success: () => uni.showToast({ title: '暗号已复制！快发给朋友', icon: 'none' })
        });
      } catch (e) {}
    },
    getWaxSealClass(j) {
      if (j === '是') return 'seal-true';
      if (j === '否') return 'seal-false';
      if (j === '是也不是') return 'seal-paradox';
      return 'seal-void';
    },
    formatJudgmentText(j) {
      if (j === '是') return '【 真 · 属实 】';
      if (j === '否') return '【 伪 · 虚妄 】';
      if (j === '是也不是') return '【 亦真亦幻 】';
      return '【 无涉此案 】';
    },
    handleUserGesture() {
      manorAudio.unlock();
    },
    listenTestSound() {
      this.isMuted = false;
      manorAudio.playTestSound();
      uni.showToast({
        title: '🔊 正在试听：打字机 ➔ 裁决银铃 ➔ 庄园晚钟',
        icon: 'none',
        duration: 2500
      });
    },
    toggleSound() {
      this.isMuted = manorAudio.toggleMute();
      uni.showToast({
        title: this.isMuted ? '🔇 已开启静音' : '🔊 已恢复庄园音效',
        icon: 'none'
      });
    },
    getTodayDate() {
      const today = new Date();
      return `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    },
    useQuickHint(hint) {
      this.inputQuestion = hint;
      this.sendQuestion();
    },
    unlockNextHint() {
      if (this.currentUnlockedHintLevel >= this.currentCaseHints.length) return;
      if (this.sanValue < 10) {
        uni.showToast({ title: '理智值不足 (需 10 SAN)，请谨慎发问恢复！', icon: 'none' });
        return;
      }
      uni.showModal({
        title: '拆阅灵感封条？',
        content: `即将破译第 ${this.currentUnlockedHintLevel + 1} 阶密笺，需消耗 10 点理智值（当前理智: ${this.sanValue}）。`,
        confirmText: '破译密笺',
        cancelText: '暂自推演',
        confirmColor: '#c59b27',
        success: (res) => {
          if (res.confirm) {
            this.sanValue = Math.max(0, this.sanValue - 10);
            const nextLvl = this.currentUnlockedHintLevel + 1;
            this.$set(this.unlockedHintLevels, this.currentSoup.id, nextLvl);
            manorAudio.playClueUnlock();
            try { uni.vibrateShort(); } catch (e) {}
            uni.showToast({ title: `第 ${nextLvl} 阶封条已撕开！`, icon: 'success' });
          }
        }
      });
    },
    async sendQuestion() {
      const q = this.inputQuestion.trim();
      if (!q || this.isThinking) return;

      // 播放打字机机械敲击声与轻触震动
      manorAudio.playTypewriter();
      try { uni.vibrateShort({ type: 'light' }); } catch (e) {}

      // 发问扣除 5 点基础理智
      this.sanValue = Math.max(0, this.sanValue - 5);

      this.inputQuestion = '';
      this.isThinking = true;
      this.scrollToBottom();

      try {
        const res = await judgeQuestion({
          soup: this.currentSoup,
          question: q,
          unlockedClueIds: this.unlockedClueIds,
          apiConfig: this.apiConfig
        });

        // 判词音效（真：银铃，伪：木槌，无涉：沙沙）
        manorAudio.playVerdict(res.judgment);

        // 若完全无涉案情，额外扣除 3 点理智
        if (res.judgment === '无关') {
          this.sanValue = Math.max(0, this.sanValue - 3);
        }

        let newClue = null;
        if (res.newClue && !this.unlockedClueIds.includes(res.newClue.id)) {
          newClue = res.newClue;
          this.unlockedClueIds.push(newClue.id);

          // 核心爽点：锁链崩断 + 重重心跳轰鸣！连续双震动！
          manorAudio.playClueUnlock();
          try {
            uni.vibrateShort();
            setTimeout(() => { try { uni.vibrateShort(); } catch (e) {} }, 160);
          } catch (e) {}

          // 点亮关键疑点：理智回血 20 点！
          this.sanValue = Math.min(100, this.sanValue + 20);
        }

        const record = {
          senderId: this.myPlayerId || 'local_player',
          senderName: this.isMultiplayer ? this.myPlayerName : '调查员',
          question: q,
          judgment: res.judgment,
          dmComment: res.dmComment,
          newClue: newClue,
          isCustom: res.isCustom,
          modelName: res.isCustom ? (this.apiConfig.model || '大模型') : '',
          timestamp: Date.now()
        };

        // 如果在联机模式下，同步广播给同伴
        if (this.isMultiplayer) {
          manorSocket.send({
            type: 'SYNC_QUESTION',
            question: q,
            judgment: res.judgment,
            dmComment: res.dmComment,
            newClue: newClue,
            senderName: this.myPlayerName
          });
        } else {
          this.history.push(record);
        }

        if (this.unlockedClueIds.length === this.currentSoup.clues.length) {
          uni.showToast({
            title: '所有疑团已撕开！敲响庄园钟声指证吧！',
            icon: 'none',
            duration: 3000
          });
        }
      } catch (err) {
        console.error('发问判决异常:', err);
        const tip = (err && err.message && err.message.includes('401'))
          ? 'API Key 鉴权失败，请检查设置'
          : '迷雾遮蔽了判决（请重试）';
        uni.showToast({ title: tip, icon: 'none' });
      } finally {
        this.isThinking = false;
        this.scrollToBottom();
      }
    },
    openSolveModal() {
      // 少于 2 个残页：线索零落
      if (this.unlockedClueIds.length < 2) {
        uni.showModal({
          title: '📜 线索零落 · 难窥全貌',
          content: `当前仅寻得 ${this.unlockedClueIds.length}/4 块真相残页（少于 2 块）。\n因果脉络支离破碎，此时指证无异于凭空盲猜，庄园主定会冷言驳回！\n请继续向案卷发问探寻。`,
          showCancel: false,
          confirmText: '继续探案',
          confirmColor: '#c59b27'
        });
        return;
      }

      // 刚好 2 个残页：未达到大于 2 块的门槛
      if (this.unlockedClueIds.length === 2) {
        uni.showModal({
          title: '📜 碎片残缺 · 因果未闭',
          content: `当前已拼获 2/4 块真相残页（需解开大于 2 块核心残页方可指证）。\n关键死因与动机仍有一半深埋迷雾，盲目落槌极易判定失败！\n请至少再追问出 1 块关键线索（解开 3 块以上）方可指证！`,
          showCancel: false,
          confirmText: '继续追查',
          confirmColor: '#c59b27'
        });
        return;
      }

      // 大于 2 个残页（3 块或 4 块）：自动拼凑已解开的残页并填入复盘框
      this.autoAssembleClues(false);
      this.showSolveModal = true;
    },
    autoAssembleClues(showToast = true) {
      const unlocked = this.currentSoup.clues.filter(c => this.unlockedClueIds.includes(c.id));
      if (unlocked.length === 0) return;

      const isFull = unlocked.length === this.currentSoup.clues.length;
      const header = isFull
        ? '【全案四重真相 · 终局因果闭环】'
        : `【残卷拼图 · 已获 ${unlocked.length}/${this.currentSoup.clues.length} 块核心因果】`;

      const lines = unlocked.map((c, i) => `${i + 1}. 【${c.title}】：${c.desc}`);
      this.truthAttemptInput = `${header}\n${lines.join('\n')}`;

      if (showToast) {
        uni.showToast({
          title: isFull ? '✨ 已拼合完整全案碎片！' : `🧩 已拼合 ${unlocked.length} 块已解残页！`,
          icon: 'none',
          duration: 2000
        });
      }
    },
    async submitTruth() {
      if (this.unlockedClueIds.length <= 2) {
        uni.showToast({ title: '真相残页需大于 2 块方可落槌指证！', icon: 'none' });
        return;
      }
      const text = this.truthAttemptInput.trim();
      if (!text) return;

      this.isThinking = true;
      try {
        const evalRes = await evaluateTruthAttempt({
          soup: this.currentSoup,
          attemptText: text,
          unlockedClueIds: this.unlockedClueIds,
          apiConfig: this.apiConfig
        });

        this.showSolveModal = false;
        this.truthAttemptInput = '';

        // 如果联机中，广播给对方
        if (this.isMultiplayer) {
          manorSocket.send({
            type: 'SUBMIT_TRUTH',
            passed: evalRes.passed,
            score: evalRes.score,
            summary: evalRes.summary,
            attemptText: text,
            senderName: this.myPlayerName
          });
        }

        if (evalRes.passed) {
          this.finalScore = evalRes.score;
          this.showCaseSolvedModal = true;
          // 敲响庄园终局教堂晚钟！
          manorAudio.playChurchBell();
        } else {
          manorAudio.playVerdict('否');
          uni.showModal({
            title: `推演吻合度: ${evalRes.score}%`,
            content: evalRes.summary,
            showCancel: false,
            confirmText: '继续探究'
          });
        }
      } finally {
        this.isThinking = false;
      }
    },
    revealTruthDirectly() {
      uni.showModal({
        title: '🕯️ 破拆绝密封泥？',
        content: '一旦破拆封泥，本案的完整因果（汤底）将瞬间无所遁形，您将失去自主推理解开谜题的成就感。\n\n是否确认直接揭晓本案完整真相？',
        confirmText: '破拆查看',
        cancelText: '我再想想',
        confirmColor: '#dc2626',
        success: (res) => {
          if (res.confirm) {
            this.showHintsModal = false;
            this.showSolveModal = false;
            this.unlockedClueIds = this.currentSoup.clues.map(c => c.id);
            this.finalScore = 100;
            this.isDirectlyRevealed = true;
            this.showCaseSolvedModal = true;
            manorAudio.playChurchBell();
            try { uni.vibrateShort(); } catch (e) {}
            uni.showToast({ title: '封泥已破拆，全案真相大白！', icon: 'none' });
          }
        }
      });
    },
    switchCase(soup) {
      const idx = this.allSoups.findIndex(s => s.id === soup.id);
      if (idx !== -1) {
        this.currentSoupIndex = idx;
        this.unlockedClueIds = [];
        this.history = [];
        this.sanValue = 100;
        this.truthAttemptInput = '';
        this.isDirectlyRevealed = false;
        this.showCaseSelector = false;

        if (this.isMultiplayer) {
          manorSocket.send({
            type: 'SWITCH_CASE',
            soupId: soup.id
          });
        }
      }
    },
    nextCase() {
      this.showCaseSolvedModal = false;
      const nextIdx = (this.currentSoupIndex + 1) % this.allSoups.length;
      this.switchCase(this.allSoups[nextIdx]);
    },
    async createAICase() {
      if (this.isGeneratingCase) return;
      this.isGeneratingCase = true;
      uni.showLoading({ title: '大模型正在虚空织造案卷...' });
      try {
        const newCase = await generateAICase({
          theme: this.aiGenerateTheme.trim() || '随机未知',
          category: this.aiGenerateCategory,
          apiConfig: this.apiConfig
        });
        uni.hideLoading();

        // 存入列表
        this.allSoups.push(newCase);

        // 存入本地存储以持久化
        try {
          const customAiCases = this.allSoups.filter(s => s.isAICreated);
          uni.setStorageSync('manor_custom_ai_cases', JSON.stringify(customAiCases));
        } catch (e) {}

        // 立即切换到这桩新案卷
        this.switchCase(newCase);
        this.showCaseCreator = false;
        this.showCaseSelector = false;
        this.aiGenerateTheme = '';

        uni.showModal({
          title: '✨ 绝密案卷降临！',
          content: `《${newCase.title}》已织造完成！\n【风格】：${newCase.category} · ${newCase.difficulty}\n大模型已作为第一主理人就绪，请开始向它发问！`,
          showCancel: false,
          confirmText: '踏入迷雾'
        });
      } catch (err) {
        uni.hideLoading();
        uni.showToast({ title: '织造案卷失败，请重试', icon: 'none' });
      } finally {
        this.isGeneratingCase = false;
      }
    },
    deleteAICase(soup, event) {
      if (event && event.stopPropagation) event.stopPropagation();
      uni.showModal({
        title: '销毁卷宗',
        content: `确定要封存销毁 AI 卷宗《${soup.title}》吗？`,
        success: (res) => {
          if (res.confirm) {
            const idx = this.allSoups.findIndex(s => s.id === soup.id);
            if (idx !== -1) {
              this.allSoups.splice(idx, 1);
              try {
                const customAiCases = this.allSoups.filter(s => s.isAICreated);
                uni.setStorageSync('manor_custom_ai_cases', JSON.stringify(customAiCases));
              } catch (e) {}
              if (this.currentSoup.id === soup.id) {
                this.switchCase(this.allSoups[0]);
              }
              uni.showToast({ title: '已销毁卷宗', icon: 'none' });
            }
          }
        }
      });
    },
    applyPreset(type) {
      if (type === 'deepseek') {
        this.apiConfig.endpoint = 'https://api.deepseek.com/v1/chat/completions';
        this.apiConfig.model = 'deepseek-chat';
        uni.showToast({ title: '已填入 DeepSeek 预设，请填入 Key', icon: 'none' });
      } else if (type === 'kimi') {
        this.apiConfig.endpoint = 'https://api.moonshot.cn/v1/chat/completions';
        this.apiConfig.model = 'moonshot-v1-8k';
        uni.showToast({ title: '已填入 Kimi 预设，请填入 Key', icon: 'none' });
      } else if (type === 'glm') {
        this.apiConfig.endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
        this.apiConfig.model = 'glm-4-flash';
        uni.showToast({ title: '已填入 智谱GLM 预设，请填入 Key', icon: 'none' });
      } else if (type === 'openai') {
        this.apiConfig.endpoint = 'https://api.openai.com/v1/chat/completions';
        this.apiConfig.model = 'gpt-4o-mini';
        uni.showToast({ title: '已填入 OpenAI 预设，请填入 Key', icon: 'none' });
      }
    },
    async testApiConnection() {
      if (!this.apiConfig.apiKey || !this.apiConfig.apiKey.trim()) {
        uni.showToast({ title: '请先填入 Secret Key 密匙', icon: 'none' });
        return;
      }
      uni.showLoading({ title: '正在连接大模型...' });
      try {
        const res = await fetch(this.apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiConfig.apiKey.trim()}`
          },
          body: JSON.stringify({
            model: this.apiConfig.model || 'deepseek-chat',
            messages: [{ role: 'user', content: '测试' }],
            max_tokens: 5
          })
        });
        uni.hideLoading();
        if (res.ok) {
          uni.showModal({
            title: '🔮 契约结成！',
            content: `成功连接大模型【${this.apiConfig.model || 'deepseek-chat'}】！\n它已正式成为本庄园的至高主理人（DM），将实时裁决你的每一次发问！`,
            showCancel: false,
            confirmText: '太棒了'
          });
        } else {
          const errData = await res.json().catch(() => ({}));
          uni.showModal({
            title: '❌ 连接异常',
            content: `状态码: ${res.status}\n原因: ${errData.error?.message || '密钥无效或接口不可达'}`,
            showCancel: false
          });
        }
      } catch (err) {
        uni.hideLoading();
        uni.showModal({
          title: '❌ 网络连接错误',
          content: String(err.message || err),
          showCancel: false
        });
      }
    },
    saveSettings() {
      try {
        uni.setStorageSync('turtle_soup_api_config', JSON.stringify(this.apiConfig));
        if (this.apiConfig.enabled && this.apiConfig.apiKey) {
          uni.showToast({ title: `已任命【${this.apiConfig.model || '大模型'}】为主理人`, icon: 'success' });
        } else {
          uni.showToast({ title: '已切换为庄园管家主持', icon: 'none' });
        }
      } catch (e) {}
      this.showSettings = false;
    },
    scrollToBottom() {
      setTimeout(() => {
        this.scrollTop = this.scrollTop + 1000;
      }, 100);
    },
    openPosterModal() {
      this.showPosterModal = true;
      setTimeout(() => {
        const ctx = uni.createCanvasContext('posterCanvas', this);
        renderPosterToCanvas({
          ctx,
          soup: this.currentSoup,
          score: this.finalScore || 90,
          historyCount: this.history.length,
          sanValue: this.sanValue,
          playerName: this.myPlayerName
        });
      }, 250);
    },
    savePoster() {
      uni.showLoading({ title: '正在封缄印鉴...' });

      // #ifdef H5
      try {
        const canvasEl = document.getElementById('posterCanvas') || document.querySelector('canvas[canvas-id="posterCanvas"]') || document.querySelector('canvas');
        if (canvasEl && typeof canvasEl.toDataURL === 'function') {
          const dataUrl = canvasEl.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `欧律狄刻庄园绝密战报_${this.currentSoup.title}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          uni.hideLoading();
          uni.showToast({ title: '已下载绝密战报高清长图！', icon: 'success' });
          return;
        }
      } catch (e) {
        console.warn('H5 canvas direct export fallback:', e);
      }
      // #endif

      uni.canvasToTempFilePath({
        canvasId: 'posterCanvas',
        destWidth: 1280,
        destHeight: 2040,
        success: (res) => {
          uni.hideLoading();
          // #ifdef MP-WEIXIN
          uni.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              uni.showToast({
                title: '已保存至手机相册！快去小红书/朋友圈打卡吧',
                icon: 'none',
                duration: 3000
              });
            },
            fail: () => {
              uni.showModal({
                title: '授权提示',
                content: '需要您的相册权限才能将战报海报保存至相册',
                success: (m) => {
                  if (m.confirm) uni.openSetting();
                }
              });
            }
          });
          // #endif

          // #ifdef H5
          const a = document.createElement('a');
          a.href = res.tempFilePath;
          a.download = `欧律狄刻庄园结案战报_${this.currentSoup.title}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          uni.showToast({ title: '已触发海报下载！', icon: 'success' });
          // #endif
        },
        fail: () => {
          uni.hideLoading();
          uni.showToast({ title: '导出海报失败，请稍后重试', icon: 'none' });
        }
      }, this);
    }
  }
};
</script>

<style scoped>
/* ========================================================
   第五人格 / 荒诞哥特暗黑庄园 视觉系统
   ======================================================== */

.gothic-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 540px;
  margin: 0 auto;
  border-left: 2rpx solid #362a1c;
  border-right: 2rpx solid #362a1c;
  box-shadow: 0 0 100rpx rgba(0, 0, 0, 0.95), 0 0 30rpx rgba(185, 28, 28, 0.15);
  background-color: #0d0c11;
  background-image: 
    radial-gradient(ellipse at 50% 0%, rgba(56, 38, 64, 0.45) 0%, rgba(13, 12, 17, 0.95) 75%),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.01) 0, rgba(255, 255, 255, 0.01) 2px, transparent 0, transparent 8px);
  color: #d8cebe;
  font-family: -apple-system, BlinkMacSystemFont, "Palatino", "Georgia", "Times New Roman", serif;
  overflow: hidden;
  position: relative;
}

/* 迷雾暗角特效 (Vignette) */
.vignette-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  box-shadow: inset 0 0 100rpx 40rpx rgba(0, 0, 0, 0.85);
  z-index: 1;
  transition: all 0.5s ease;
}

/* 低理智 (SAN <= 30) 危险红光心跳脉冲 */
.vignette-overlay.vignette-danger {
  animation: pulse-danger 1.2s infinite alternate;
}

@keyframes pulse-danger {
  0% {
    box-shadow: inset 0 0 110rpx 50rpx rgba(185, 28, 28, 0.55);
  }
  100% {
    box-shadow: inset 0 0 160rpx 80rpx rgba(220, 38, 38, 0.85);
  }
}

/* ---------------- 庄园顶栏 ---------------- */
.manor-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 28rpx;
  padding-top: calc(env(safe-area-inset-top, 0px) + 20rpx);
  background: #14121a;
  border-bottom: 2rpx solid #3d3226;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.6);
  z-index: 10;
  position: relative;
}

.case-switcher {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.manor-seal {
  font-size: 34rpx;
  filter: drop-shadow(0 0 6rpx rgba(217, 119, 6, 0.5));
}

.case-meta {
  display: flex;
  flex-direction: column;
}

.manor-case-num {
  font-size: 18rpx;
  letter-spacing: 2rpx;
  color: #927e65;
  font-weight: 700;
}

.case-title-text {
  font-size: 30rpx;
  font-weight: 900;
  color: #ecd9bc;
  letter-spacing: 1rpx;
  text-shadow: 0 2rpx 8rpx rgba(0,0,0,0.8);
}

.switch-chevron {
  font-size: 20rpx;
  color: #927e65;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

/* 核心音效试听胶囊 */
.sound-test-pill {
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: linear-gradient(135deg, #b45309, #78350f);
  border: 1px solid #f59e0b;
  padding: 6rpx 16rpx;
  border-radius: 30rpx;
  box-shadow: 0 2rpx 10rpx rgba(245, 158, 11, 0.35);
  cursor: pointer;
  animation: pulse-ring 2.5s infinite ease-in-out;
}

@keyframes pulse-ring {
  0% { transform: scale(0.97); opacity: 0.9; }
  50% { transform: scale(1.03); opacity: 1; box-shadow: 0 0 14rpx rgba(245, 158, 11, 0.6); }
  100% { transform: scale(0.97); opacity: 0.9; }
}

.sound-pulse-icon {
  font-size: 22rpx;
}

.sound-pill-txt {
  font-size: 20rpx;
  font-weight: 900;
  color: #fef08a;
  letter-spacing: 1rpx;
}

/* 静音切换按钮 */
.sound-mute-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #201a14;
  border: 1px solid #5a4631;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.5);
  cursor: pointer;
}

.sound-mute-btn.muted {
  border-color: #8c2323;
  background: #2a1616;
}

.mute-icon {
  font-size: 24rpx;
}

/* 双人组队徽章 */
.coop-badge {
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: #201a14;
  border: 1px solid #735a3d;
  padding: 8rpx 16rpx;
  border-radius: 30rpx;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.5);
}

.coop-badge.inroom {
  background: #331f1f;
  border-color: #dc2626;
  box-shadow: 0 0 12rpx rgba(220, 38, 38, 0.5);
}

.coop-icon {
  font-size: 24rpx;
}

.coop-text {
  font-size: 20rpx;
  color: #eed9b3;
  font-weight: bold;
}

.oracle-badge {
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: #1c1824;
  border: 1px dashed #5c4b37;
  padding: 8rpx 16rpx;
  border-radius: 30rpx;
}

.candle-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #504439;
}

.candle-dot.lit {
  background: #dc2626;
  box-shadow: 0 0 10rpx #ef4444;
}

.gear-cog {
  font-size: 24rpx;
  color: #8c7964;
}

/* ---------------- 主调查滚动区 ---------------- */
.investigation-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  padding: 24rpx 24rpx 40rpx 24rpx;
  box-sizing: border-box;
  z-index: 2;
}

/* 羊皮纸残卷：案卷卡片 */
.parchment-case {
  position: relative;
  background-color: #211c16;
  background-image: 
    linear-gradient(to bottom, rgba(46, 38, 29, 0.95), rgba(28, 23, 17, 0.98)),
    repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(138, 113, 72, 0.08) 25px);
  border: 3rpx solid #544432;
  border-radius: 12rpx;
  padding: 32rpx 28rpx;
  margin-bottom: 30rpx;
  box-shadow: 
    0 16rpx 36rpx rgba(0,0,0,0.8),
    inset 0 0 30rpx rgba(0,0,0,0.6);
  transform: rotate(-0.3deg);
}

.clip-pin {
  position: absolute;
  top: -12rpx;
  left: 36rpx;
  width: 32rpx;
  height: 24rpx;
  background: #857053;
  border-radius: 6rpx;
  border: 1px solid #31281e;
  box-shadow: 0 4rpx 8rpx rgba(0,0,0,0.5);
}

.case-badge-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.badge-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.give-up-pill {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  background: rgba(35, 20, 20, 0.7);
  border: 1px dashed rgba(239, 68, 68, 0.55);
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
  cursor: pointer;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
}

.give-up-pill:active {
  background: rgba(239, 68, 68, 0.2);
  border-color: #f87171;
}

.give-up-icon {
  font-size: 22rpx;
}

.give-up-txt {
  font-size: 20rpx;
  color: #f87171;
  font-weight: 700;
  letter-spacing: 1rpx;
}

.gothic-stamp-tag {
  font-size: 22rpx;
  color: #e5cfac;
  background: #3c1e1e;
  border: 1px solid #7f2323;
  padding: 4rpx 16rpx;
  border-radius: 4rpx;
  letter-spacing: 2rpx;
  font-weight: 700;
}

.danger-level {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.danger-label {
  font-size: 20rpx;
  color: #927e65;
}

.star-rating {
  font-size: 24rpx;
  color: #d97706;
  letter-spacing: 2rpx;
}

/* 理智值 (SAN) 槽位 */
.san-bar-container {
  background: rgba(13, 12, 17, 0.7);
  border: 1px solid #4a3b2b;
  border-radius: 8rpx;
  padding: 10rpx 16rpx;
  margin-bottom: 20rpx;
}

.san-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.san-label {
  font-size: 20rpx;
  color: #bfae98;
  font-weight: bold;
}

.san-value {
  font-size: 22rpx;
  color: #22c55e;
  font-weight: 800;
  font-family: monospace;
}

.san-value.san-critical {
  color: #ef4444;
  animation: flicker-red 0.8s infinite alternate;
}

@keyframes flicker-red {
  0% { opacity: 0.6; text-shadow: 0 0 2rpx #ef4444; }
  100% { opacity: 1; text-shadow: 0 0 10rpx #dc2626; }
}

.san-track {
  height: 8rpx;
  background: #1e1922;
  border-radius: 4rpx;
  overflow: hidden;
  border: 1px solid #33261f;
}

.san-fill {
  height: 100%;
  transition: width 0.4s ease, background 0.4s ease;
}

.san-fill.san-safe {
  background: linear-gradient(90deg, #15803d, #22c55e);
  box-shadow: 0 0 8rpx #22c55e;
}

.san-fill.san-warning {
  background: linear-gradient(90deg, #b45309, #f59e0b);
  box-shadow: 0 0 8rpx #f59e0b;
}

.san-fill.san-danger {
  background: linear-gradient(90deg, #991b1b, #ef4444);
  box-shadow: 0 0 12rpx #ef4444;
}

.case-script-box {
  position: relative;
  margin: 16rpx 0 24rpx 0;
  padding: 0 10rpx;
}

.old-quote {
  font-size: 42rpx;
  color: #8c2323;
  font-weight: bold;
}

.old-quote.right {
  display: inline-block;
  vertical-align: bottom;
  margin-left: 6rpx;
}

.script-body {
  font-size: 30rpx;
  line-height: 1.7;
  color: #f0e6d6;
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}

.manor-decree {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: rgba(13, 12, 17, 0.6);
  border: 1px dashed #4e3f2e;
  padding: 12rpx 18rpx;
  border-radius: 8rpx;
}

.decree-icon {
  font-size: 26rpx;
}

.decree-text {
  font-size: 22rpx;
  color: #9e8e78;
  line-height: 1.4;
}

/* ---------------- 庄园红线线索木板 ---------------- */
.clue-corkboard {
  background: #18151f;
  background-image: radial-gradient(circle, rgba(66, 45, 45, 0.15) 1px, transparent 1px);
  background-size: 20px 20px;
  border: 3rpx solid #362d22;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 32rpx;
  box-shadow: inset 0 0 40rpx rgba(0,0,0,0.7);
}

.cork-header {
  margin-bottom: 22rpx;
}

.cork-title-wrap {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.cork-main-title {
  font-size: 26rpx;
  font-weight: 900;
  color: #cfb288;
  letter-spacing: 1rpx;
}

.cork-stats {
  font-size: 22rpx;
  color: #8c2323;
  font-weight: bold;
}

.blood-track-bg {
  height: 10rpx;
  background: #25202c;
  border-radius: 6rpx;
  overflow: hidden;
  border: 1px solid #3d3447;
}

.blood-track-fill {
  height: 100%;
  background: linear-gradient(90deg, #991b1b, #ef4444, #f59e0b);
  box-shadow: 0 0 10rpx #dc2626;
  transition: width 0.5s ease;
}

.clues-patchwork {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.patch-card {
  position: relative;
  border-radius: 10rpx;
  padding: 18rpx 22rpx;
  transition: all 0.4s ease;
  box-shadow: 0 8rpx 20rpx rgba(0,0,0,0.5);
}

.tilt-0 { transform: rotate(-0.5deg); }
.tilt-1 { transform: rotate(0.4deg); }
.tilt-2 { transform: rotate(-0.3deg); }

.patch-stitched {
  background: #1e1a26;
  border: 2rpx dashed #4b3e54;
}

.patch-tack {
  position: absolute;
  top: 8rpx;
  right: 14rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #5a4b3d;
  box-shadow: 0 2rpx 4rpx rgba(0,0,0,0.8);
}

.patch-revealed {
  background: #292117;
  border: 2rpx solid #a17838;
  box-shadow: 0 0 18rpx rgba(217, 119, 6, 0.25);
}

.patch-revealed .patch-tack {
  background: #dc2626;
  box-shadow: 0 0 10rpx #ef4444;
}

.patch-inner {
  display: flex;
  flex-direction: column;
}

.patch-badge {
  display: flex;
  align-items: center;
  margin-bottom: 6rpx;
}

.stitched-eye {
  font-size: 20rpx;
  color: #7b6d85;
}

.revealed-eye {
  font-size: 20rpx;
  color: #f59e0b;
  font-weight: bold;
}

.patch-title {
  font-size: 28rpx;
  font-weight: 800;
  color: #e5ded2;
  margin-bottom: 4rpx;
}

.patch-revealed .patch-title {
  color: #fed7aa;
}

.patch-desc {
  font-size: 24rpx;
  color: #bfae98;
  line-height: 1.45;
}

.patch-fog {
  font-size: 22rpx;
  color: #5c5264;
  font-style: italic;
}

/* ---------------- 审讯笔录流 ---------------- */
.inquest-log {
  padding-bottom: 30rpx;
}

.log-divider {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: #362e3d;
}

.log-title-tag {
  font-size: 22rpx;
  color: #8c7a65;
  font-weight: bold;
  letter-spacing: 1rpx;
}

.graveyard-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60rpx 20rpx;
  color: #5f5466;
  text-align: center;
}

.doll-icon {
  font-size: 64rpx;
  margin-bottom: 16rpx;
  filter: grayscale(80%);
}

.graveyard-text {
  font-size: 24rpx;
  max-width: 480rpx;
  line-height: 1.5;
}

.inquest-entry {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-bottom: 32rpx;
}

.entry-bubble {
  max-width: 86%;
  border-radius: 14rpx;
  padding: 20rpx 24rpx;
  box-shadow: 0 6rpx 20rpx rgba(0,0,0,0.6);
}

/* 调查员（求生者）气泡 */
.survivor-bubble {
  align-self: flex-end;
  background: #2b2034;
  border: 1px solid #5a426e;
  border-bottom-right-radius: 2rpx;
  color: #f1e9f7;
}

/* 同伴发的气泡 */
.partner-bubble {
  align-self: flex-start;
  background: #1e2834;
  border-color: #3b5a75;
  border-bottom-left-radius: 2rpx;
  border-bottom-right-radius: 14rpx;
  color: #e0f2fe;
}

.identity-tag {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  margin-bottom: 8rpx;
}

.survivor-tag {
  background: rgba(0,0,0,0.35);
  border: 1px solid #483457;
}

.partner-tag {
  background: rgba(0,0,0,0.35);
  border: 1px solid #234563;
}

.survivor-tag .tag-name {
  font-size: 18rpx;
  color: #c4b5fd;
  font-weight: bold;
}

.partner-tag .tag-name {
  font-size: 18rpx;
  color: #7dd3fc;
  font-weight: bold;
}

.entry-words {
  font-size: 28rpx;
  line-height: 1.5;
  display: block;
}

/* 庄园裁判气泡 */
.manor-bubble {
  align-self: flex-start;
  background: #18151d;
  border: 2rpx solid #44372a;
  border-bottom-left-radius: 2rpx;
  color: #e5ded2;
}

.manor-ruling-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14rpx;
}

.hunter-tag {
  background: #2a1f1a;
  border: 1px solid #543f2e;
}

.hunter-tag .tag-name {
  font-size: 18rpx;
  color: #d97706;
  font-weight: bold;
}

/* 哥特火漆印章判词 */
.wax-seal {
  padding: 4rpx 18rpx;
  border-radius: 8rpx;
  font-size: 26rpx;
  font-weight: 900;
  letter-spacing: 2rpx;
}

.seal-true {
  color: #34d399;
  background: rgba(16, 185, 129, 0.15);
  border: 2rpx solid #059669;
  box-shadow: 0 0 14rpx rgba(16, 185, 129, 0.4);
}

.seal-false {
  color: #f87171;
  background: rgba(220, 38, 38, 0.18);
  border: 2rpx solid #b91c1c;
  box-shadow: 0 0 14rpx rgba(239, 68, 68, 0.4);
}

.seal-void {
  color: #9ca3af;
  background: rgba(156, 163, 175, 0.12);
  border: 2rpx dashed #4b5563;
}

.seal-paradox {
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.18);
  border: 2rpx solid #d97706;
  box-shadow: 0 0 14rpx rgba(245, 158, 11, 0.4);
}

.ruling-echo {
  font-size: 26rpx;
  color: #d4c8b6;
  line-height: 1.55;
  display: block;
}

.blood-clue-ribbon {
  margin-top: 16rpx;
  padding: 10rpx 16rpx;
  background: rgba(153, 27, 27, 0.25);
  border: 2rpx dashed #ef4444;
  border-radius: 6rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.ribbon-flame {
  font-size: 24rpx;
}

.ribbon-text {
  font-size: 22rpx;
  color: #fca5a5;
  font-weight: bold;
}

.manor-whisper {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx;
}

.whisper-candle {
  font-size: 28rpx;
  animation: flicker 1.8s infinite alternate;
}

.whisper-text {
  font-size: 24rpx;
  color: #837463;
  font-style: italic;
}

@keyframes flicker {
  0% { opacity: 0.5; filter: drop-shadow(0 0 2rpx #d97706); }
  50% { opacity: 1; filter: drop-shadow(0 0 10rpx #f59e0b); }
  100% { opacity: 0.7; filter: drop-shadow(0 0 4rpx #b45309); }
}

/* ---------------- 快捷调查手签 ---------------- */
.manor-hints {
  flex-shrink: 0;
  background: #14121a;
  border-top: 1px solid #29221b;
  padding: 12rpx 0;
  z-index: 10;
}

.hints-rail {
  white-space: nowrap;
}

.hints-track {
  display: inline-flex;
  gap: 16rpx;
  padding: 0 24rpx;
}

/* 灵感手记胶囊按钮 (常驻左侧突出) */
.hint-book-pill {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  background: linear-gradient(135deg, #382811, #221808);
  border: 1px solid #d97706;
  padding: 8rpx 22rpx;
  border-radius: 24rpx;
  box-shadow: 0 0 14rpx rgba(217, 119, 6, 0.35);
  cursor: pointer;
}

.hint-book-icon {
  font-size: 24rpx;
  filter: drop-shadow(0 0 6rpx #f59e0b);
}

.hint-book-txt {
  font-size: 24rpx;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: 1rpx;
  white-space: nowrap;
}

.clue-tag-btn {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  background: #201a14;
  border: 1px solid #5a4631;
  padding: 8rpx 20rpx;
  border-radius: 8rpx;
  box-shadow: 0 4rpx 10rpx rgba(0,0,0,0.5);
  transform: rotate(-0.5deg);
}

.tag-pin {
  font-size: 20rpx;
}

.tag-label {
  font-size: 24rpx;
  color: #dfceb7;
  white-space: nowrap;
}

/* ---------------- 底部打字机操作台 ---------------- */
.typewriter-desk {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 24rpx;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 18rpx);
  background: #120f17;
  border-top: 2rpx solid #3c3224;
  box-shadow: 0 -8rpx 30rpx rgba(0,0,0,0.7);
  z-index: 10;
}

.blood-verdict-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #8a1d1d, #571111);
  color: #fee2e2;
  border: 2rpx solid #b91c1c;
  border-radius: 12rpx;
  padding: 8rpx 20rpx;
  line-height: 1.2;
  box-shadow: 0 4rpx 14rpx rgba(185, 28, 28, 0.4);
}

.verdict-icon {
  font-size: 30rpx;
}

.verdict-label {
  font-size: 20rpx;
  font-weight: 900;
  letter-spacing: 1rpx;
}

.typewriter-trough {
  flex: 1;
  display: flex;
  align-items: center;
  background: #09080c;
  border: 2rpx solid #423627;
  border-radius: 12rpx;
  padding: 6rpx 12rpx;
  box-shadow: inset 0 4rpx 10rpx rgba(0,0,0,0.9);
}

.desk-input {
  flex: 1;
  height: 64rpx;
  font-size: 26rpx;
  color: #eddac0;
  padding: 0 12rpx;
}

.seal-send-btn {
  background: #3f3223;
  color: #eddac0;
  border: 1px solid #735a3d;
  font-size: 26rpx;
  font-weight: 800;
  height: 60rpx;
  line-height: 60rpx;
  padding: 0 24rpx;
  border-radius: 8rpx;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.6);
}

.seal-send-btn[disabled] {
  background: #1e1924;
  color: #514459;
  border-color: #2e2637;
}

/* ---------------- 哥特羊皮纸弹窗 ---------------- */
.gothic-modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 40rpx;
}

.parchment-modal-box {
  width: 100%;
  max-width: 620rpx;
  background: #1c1711;
  background-image: linear-gradient(to bottom, #231c14, #18130e);
  border: 3rpx solid #6b5336;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 
    0 24rpx 60rpx rgba(0,0,0,0.9),
    inset 0 0 40rpx rgba(0,0,0,0.6);
}

.modal-gothic-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 26rpx;
  border-bottom: 1px solid #443522;
  padding-bottom: 16rpx;
}

.modal-gothic-title {
  font-size: 32rpx;
  font-weight: 900;
  color: #eed9b3;
  letter-spacing: 1rpx;
}

.modal-dismiss {
  font-size: 34rpx;
  color: #8c785f;
  padding: 8rpx;
}

/* 案卷弹窗专有布局 */
.case-selector-box {
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}

/* AI 召唤横幅 */
.ai-create-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #2b1d12, #1b120c);
  border: 2rpx dashed #d97706;
  border-radius: 10rpx;
  padding: 16rpx 20rpx;
  margin-bottom: 20rpx;
  cursor: pointer;
  box-shadow: 0 4rpx 12rpx rgba(217, 119, 6, 0.15);
}

.ai-banner-left {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.ai-banner-icon {
  font-size: 32rpx;
  animation: pulse-ring 2s infinite ease-in-out;
}

.ai-banner-text {
  display: flex;
  flex-direction: column;
}

.ai-banner-title {
  font-size: 24rpx;
  font-weight: 900;
  color: #fef08a;
  letter-spacing: 1rpx;
}

.ai-banner-sub {
  font-size: 18rpx;
  color: #9c8971;
  margin-top: 2rpx;
}

.ai-banner-toggle {
  font-size: 20rpx;
  color: #d97706;
  font-weight: bold;
}

/* AI 织造展开面板 */
.ai-creator-panel {
  background: #120e0a;
  border: 1px solid #4a3824;
  border-radius: 8rpx;
  padding: 16rpx;
  margin-bottom: 20rpx;
}

.creator-category-row {
  margin-bottom: 14rpx;
}

.creator-lbl {
  font-size: 20rpx;
  color: #bfae98;
  display: block;
  margin-bottom: 8rpx;
}

.cat-chips {
  display: flex;
  gap: 10rpx;
}

.cat-chip {
  background: #1c1611;
  border: 1px solid #4a3a27;
  color: #a8967f;
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 20rpx;
  cursor: pointer;
}

.cat-chip.active {
  background: #991b1b;
  border-color: #ef4444;
  color: #ffffff;
  font-weight: bold;
}

.creator-input-row {
  margin-bottom: 14rpx;
}

.creator-theme-input {
  background: #09080c;
  border: 1px solid #544432;
  color: #eed9b3;
  padding: 10rpx 16rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
  height: 52rpx;
}

.ai-summon-btn {
  background: linear-gradient(135deg, #b45309, #78350f);
  border: 1px solid #f59e0b;
  color: #fef08a;
  font-size: 24rpx;
  font-weight: 900;
  border-radius: 8rpx;
  padding: 6rpx 0;
  box-shadow: 0 4rpx 12rpx rgba(245, 158, 11, 0.3);
}

.ai-summon-btn[disabled] {
  opacity: 0.6;
}

/* 案卷平滑滚动区 */
.manor-file-scroll {
  flex: 1;
  max-height: 48vh;
  overflow-y: auto;
}

/* 案卷列表项 */
.manor-file-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.manor-file-item {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22rpx;
  background: #282118;
  border: 1px solid #4a3a27;
  border-radius: 8rpx;
}

.manor-file-item.current {
  border-color: #d97706;
  background: #33281c;
  box-shadow: 0 0 16rpx rgba(217, 119, 6, 0.2);
}

.manor-file-item.is-ai {
  border-left: 6rpx solid #ec4899;
}

.file-title-line {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.file-item-title {
  font-size: 28rpx;
  font-weight: 800;
  color: #edd9ba;
  display: inline-block;
}

.ai-tag {
  font-size: 18rpx;
  background: rgba(236, 72, 153, 0.2);
  border: 1px solid #ec4899;
  color: #f472b6;
  padding: 0 8rpx;
  border-radius: 4rpx;
  font-weight: bold;
}

.file-item-sub {
  font-size: 22rpx;
  color: #9c8971;
  margin-top: 6rpx;
  display: block;
}

.file-item-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.file-investigating {
  font-size: 22rpx;
  color: #f59e0b;
  font-weight: bold;
}

.file-del-btn {
  font-size: 26rpx;
  opacity: 0.6;
  cursor: pointer;
  transition: opacity 0.2s;
}

.file-del-btn:hover {
  opacity: 1;
}

/* ---------------- 双人组队弹窗专有样式 ---------------- */
.coop-name-section {
  margin-bottom: 24rpx;
}

.coop-field-label {
  font-size: 22rpx;
  color: #927e65;
  display: block;
  margin-bottom: 8rpx;
}

.coop-name-input {
  background: #0d0c11;
  border: 1px solid #544432;
  color: #eed9b3;
  padding: 12rpx 18rpx;
  border-radius: 8rpx;
  font-size: 26rpx;
}

.active-room-box {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.room-cipher-banner {
  background: #2a1b1b;
  border: 2rpx dashed #dc2626;
  border-radius: 12rpx;
  padding: 20rpx;
  text-align: center;
}

.cipher-lbl {
  font-size: 20rpx;
  color: #fca5a5;
  display: block;
}

.cipher-val {
  font-size: 54rpx;
  font-weight: 900;
  letter-spacing: 12rpx;
  color: #fef08a;
  display: block;
  margin: 6rpx 0;
  text-shadow: 0 0 16rpx rgba(254, 240, 138, 0.4);
}

.cipher-copy-tip {
  font-size: 22rpx;
  color: #93c5fd;
  text-decoration: underline;
  display: inline-block;
  cursor: pointer;
}

.room-fellows {
  background: #14110d;
  padding: 16rpx;
  border-radius: 8rpx;
  border: 1px solid #362a1b;
}

.fellows-title {
  font-size: 22rpx;
  color: #9e8d78;
  display: block;
  margin-bottom: 12rpx;
}

.fellow-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.fellow-chip {
  display: flex;
  align-items: center;
  gap: 10rpx;
  background: #201811;
  padding: 8rpx 14rpx;
  border-radius: 6rpx;
}

.fellow-role-icon {
  font-size: 24rpx;
}

.fellow-name {
  font-size: 24rpx;
  color: #fed7aa;
  font-weight: bold;
}

.leave-room-btn {
  background: transparent;
  color: #f87171;
  border: 1px solid #991b1b;
  font-size: 24rpx;
  margin-top: 10rpx;
  border-radius: 8rpx;
}

.unjoined-coop-section {
  display: flex;
  flex-direction: column;
}

.coop-action-desc {
  font-size: 22rpx;
  color: #9e8d78;
  display: block;
  margin-bottom: 12rpx;
  line-height: 1.4;
}

.gothic-btn-main {
  background: linear-gradient(135deg, #7c2d12, #451a03);
  border: 1px solid #b45309;
  color: #fef3c7;
  font-size: 28rpx;
  font-weight: 800;
  border-radius: 8rpx;
  box-shadow: 0 4rpx 12rpx rgba(180, 83, 9, 0.3);
}

.coop-or-divider {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin: 24rpx 0;
}

.or-line {
  flex: 1;
  height: 1px;
  background: #443522;
}

.or-txt {
  font-size: 20rpx;
  color: #7b6d58;
}

.cipher-input {
  background: #0d0c11;
  border: 2rpx solid #6b5336;
  color: #fef08a;
  text-align: center;
  font-size: 36rpx;
  font-weight: 900;
  letter-spacing: 6rpx;
  height: 72rpx;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
}

.gothic-btn-secondary {
  background: #3a2e20;
  border: 1px solid #735b3e;
  color: #ecd9ba;
  font-size: 28rpx;
  font-weight: 800;
  border-radius: 8rpx;
}

.gothic-btn-secondary[disabled] {
  background: #191410;
  color: #4a3e30;
  border-color: #2b2116;
}

/* 设置项 */
.setting-toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22rpx;
}

.setting-desc-label {
  font-size: 26rpx;
  color: #e5d5be;
}

.gothic-inputs-group {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.gothic-field-name {
  font-size: 22rpx;
  color: #927e65;
}

.gothic-input-field {
  background: #0d0c11;
  border: 1px solid #4e3e2c;
  color: #edd9ba;
  padding: 12rpx 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
}

.grimoire-note {
  background: #110e0a;
  border: 1px dashed #4e3e2c;
  padding: 16rpx;
  border-radius: 8rpx;
  margin-bottom: 24rpx;
}

.grimoire-text {
  font-size: 22rpx;
  color: #8c785f;
  line-height: 1.5;
}

.presets-section {
  margin-bottom: 20rpx;
}

.presets-title {
  font-size: 22rpx;
  color: #d97706;
  font-weight: bold;
  display: block;
  margin-bottom: 12rpx;
}

.presets-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.preset-pill {
  background: #241a12;
  border: 1px solid #785a38;
  color: #fef08a;
  font-size: 22rpx;
  font-weight: 700;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-pill:active {
  background: #991b1b;
  border-color: #ef4444;
}

.settings-action-btns {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.gothic-test-btn {
  background: #1e293b;
  border: 1px solid #38bdf8;
  color: #38bdf8;
  font-size: 26rpx;
  font-weight: 800;
  border-radius: 8rpx;
}

.gothic-confirm-btn {
  background: linear-gradient(135deg, #7c2d12, #451a03);
  border: 1px solid #b45309;
  color: #fef3c7;
  font-size: 28rpx;
  font-weight: 800;
  border-radius: 8rpx;
}

/* 还原真相指证 */
.solve-clue-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  background: rgba(30, 24, 18, 0.7);
  border: 1px dashed rgba(217, 119, 6, 0.4);
  border-radius: 8rpx;
  padding: 10rpx 14rpx;
  gap: 10rpx;
}

.solve-clue-meta {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;
}

.solve-clue-icon {
  font-size: 24rpx;
}

.solve-clue-status {
  font-size: 22rpx;
  color: #fbbf24;
  font-weight: 600;
  line-height: 1.3;
}

.re-assemble-pill {
  background: rgba(217, 119, 6, 0.2);
  border: 1px solid #d97706;
  border-radius: 20rpx;
  padding: 4rpx 14rpx;
  cursor: pointer;
  flex-shrink: 0;
}

.re-assemble-txt {
  font-size: 20rpx;
  color: #fde68a;
  font-weight: bold;
}

.solve-lead {
  font-size: 24rpx;
  color: #9e8d78;
  display: block;
  margin-bottom: 16rpx;
}

.gothic-textarea {
  width: 100%;
  height: 290rpx;
  background: #0d0c11;
  border: 2rpx solid #4a3a27;
  color: #eddac0;
  padding: 18rpx;
  border-radius: 10rpx;
  font-size: 25rpx;
  box-sizing: border-box;
  margin-bottom: 22rpx;
  line-height: 1.55;
}

.blood-strike-btn {
  background: linear-gradient(135deg, #991b1b, #6b1111);
  border: 2rpx solid #ef4444;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 900;
  letter-spacing: 2rpx;
  border-radius: 10rpx;
  box-shadow: 0 4rpx 16rpx rgba(185, 28, 28, 0.5);
}

.solve-give-up-link {
  text-align: center;
  margin-top: 18rpx;
  padding: 6rpx 0;
  cursor: pointer;
}

.solve-give-up-txt {
  font-size: 22rpx;
  color: #a8947b;
  text-decoration: underline;
  transition: color 0.2s;
}

.solve-give-up-txt:active {
  color: #ef4444;
}

/* 结案大捷 */
.verdict-completed-box {
  text-align: center;
  position: relative;
  background: #1e1812;
  border: 4rpx solid #991b1b;
}

.gothic-blood-stamp {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20rpx;
}

.stamp-char {
  border: 6rpx solid #dc2626;
  color: #dc2626;
  font-size: 40rpx;
  font-weight: 900;
  padding: 8rpx 36rpx;
  transform: rotate(-8deg);
  border-radius: 10rpx;
  letter-spacing: 6rpx;
  box-shadow: 0 0 20rpx rgba(220, 38, 38, 0.4);
}

.stamp-sub-char {
  font-size: 22rpx;
  color: #ef4444;
  margin-top: 8rpx;
  letter-spacing: 3rpx;
}

.revelation-score {
  margin: 18rpx 0;
}

.score-title {
  font-size: 22rpx;
  color: #9e8d78;
  display: block;
}

.score-percent {
  font-size: 48rpx;
  font-weight: 900;
  color: #f59e0b;
}

.true-parchment-wrap {
  background: #100d09;
  border: 1px dashed #544432;
  border-radius: 10rpx;
  padding: 22rpx;
  text-align: left;
  margin-bottom: 24rpx;
  max-height: 320rpx;
  overflow-y: auto;
}

.truth-heading {
  font-size: 22rpx;
  color: #dc2626;
  font-weight: 900;
  display: block;
  margin-bottom: 10rpx;
}

.truth-paragraph {
  font-size: 26rpx;
  color: #ded1be;
  line-height: 1.65;
}

.investigation-tally {
  display: flex;
  justify-content: space-around;
  margin-bottom: 26rpx;
  background: #292117;
  padding: 16rpx 0;
  border-radius: 8rpx;
  border: 1px solid #443625;
}

.tally-box {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tally-val {
  font-size: 34rpx;
  font-weight: 900;
  color: #fbbf24;
}

.tally-tag {
  font-size: 20rpx;
  color: #927e65;
  margin-top: 4rpx;
}

.verdict-buttons {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.next-manor-btn {
  background: linear-gradient(135deg, #15803d, #166534);
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 900;
  border-radius: 8rpx;
  border: 1px solid #22c55e;
}

.generate-poster-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  background: linear-gradient(135deg, #b45309, #78350f);
  color: #fef08a;
  border: 2rpx solid #f59e0b;
  font-size: 26rpx;
  font-weight: 900;
  border-radius: 8rpx;
  padding: 12rpx 0;
  box-shadow: 0 4rpx 14rpx rgba(245, 158, 11, 0.35);
  animation: breathe-gold 2s infinite alternate;
}

@keyframes breathe-gold {
  0% { box-shadow: 0 0 10rpx rgba(245, 158, 11, 0.2); }
  100% { box-shadow: 0 0 20rpx rgba(245, 158, 11, 0.6); }
}

.generate-poster-btn .btn-icon {
  font-size: 32rpx;
}

.generate-poster-btn .btn-text {
  letter-spacing: 1rpx;
}

.reread-log-btn {
  background: transparent;
  color: #927e65;
  font-size: 24rpx;
}

/* ---------------- 绝密档案海报模态框 ---------------- */
.poster-preview-box {
  width: 92vw;
  max-width: 600rpx;
  max-height: 88vh;
  background: #18130e;
  background-image: linear-gradient(180deg, #221a12 0%, #140f0a 100%);
  border: 3rpx solid #7a5c3a;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 24rpx 70rpx rgba(0,0,0,0.95), inset 0 0 30rpx rgba(0,0,0,0.8);
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
}

.poster-scroll-wrapper {
  flex: 1;
  height: 0;
  min-height: 0;
  max-height: 66vh;
  overflow-y: auto;
  margin-bottom: 20rpx;
  border-radius: 12rpx;
  border: 2rpx solid #4a3825;
  background: #120e0a;
  box-shadow: inset 0 0 24rpx rgba(0,0,0,0.8);
}

.poster-scroll-content {
  padding: 28rpx 24rpx;
  background: #17120c;
  background-image: 
    linear-gradient(to bottom, rgba(32, 24, 16, 0.95), rgba(18, 14, 9, 0.98)),
    repeating-linear-gradient(45deg, rgba(255,255,255,0.01) 0, rgba(255,255,255,0.01) 2px, transparent 0, transparent 8px);
  border: 2rpx dashed #59442e;
  border-radius: 10rpx;
}

.p-manor-sign {
  text-align: center;
  margin-bottom: 16rpx;
  border-bottom: 1px solid #3d2f20;
  padding-bottom: 12rpx;
}

.p-sign-en {
  font-size: 20rpx;
  font-weight: 900;
  color: #c9a777;
  letter-spacing: 4rpx;
  display: block;
}

.p-sign-sub {
  font-size: 18rpx;
  color: #7d654c;
  letter-spacing: 6rpx;
  margin-top: 4rpx;
  display: block;
}

.p-case-header {
  text-align: center;
  margin-bottom: 18rpx;
}

.p-case-title {
  font-size: 34rpx;
  font-weight: 900;
  color: #f3e5d0;
  letter-spacing: 2rpx;
  display: block;
  text-shadow: 0 2rpx 10rpx rgba(0,0,0,0.9);
}

.p-case-badge {
  font-size: 20rpx;
  color: #d97706;
  margin-top: 6rpx;
  display: block;
}

.p-stamp-outer {
  display: flex;
  justify-content: center;
  margin: 16rpx 0 24rpx 0;
}

.p-stamp-box {
  border: 4rpx solid #dc2626;
  background: rgba(220, 38, 38, 0.12);
  padding: 8rpx 28rpx;
  border-radius: 8rpx;
  transform: rotate(-5deg);
  box-shadow: 0 0 16rpx rgba(220, 38, 38, 0.35);
  text-align: center;
}

.p-stamp-en {
  font-size: 32rpx;
  font-weight: 900;
  color: #ef4444;
  letter-spacing: 4rpx;
  display: block;
  font-family: Georgia, serif;
}

.p-stamp-cn {
  font-size: 18rpx;
  color: #f87171;
  letter-spacing: 4rpx;
  display: block;
  margin-top: 2rpx;
}

.p-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12rpx;
  margin-bottom: 24rpx;
}

.p-stat-box {
  background: #1f1811;
  border: 1px solid #4a3824;
  border-radius: 8rpx;
  padding: 12rpx 4rpx;
  text-align: center;
}

.p-stat-val {
  font-size: 28rpx;
  font-weight: 900;
  display: block;
  font-family: monospace;
}

.p-stat-val.color-amber { color: #f59e0b; }
.p-stat-val.color-sky { color: #38bdf8; }
.p-stat-val.color-green { color: #22c55e; }
.p-stat-val.color-pink { color: #ec4899; }

.p-stat-lbl {
  font-size: 18rpx;
  color: #9c8871;
  margin-top: 4rpx;
  display: block;
}

.p-quote-card {
  background: #1c150e;
  border: 1px solid #5a442e;
  border-radius: 8rpx;
  padding: 18rpx 20rpx;
  margin-bottom: 20rpx;
  position: relative;
  text-align: center;
}

.p-quote-mark {
  font-size: 36rpx;
  color: #8c2323;
  font-weight: bold;
  float: left;
  line-height: 1;
}

.p-quote-mark-r {
  font-size: 36rpx;
  color: #8c2323;
  font-weight: bold;
  float: right;
  line-height: 1;
}

.p-quote-body {
  font-size: 22rpx;
  color: #fde68a;
  font-style: italic;
  line-height: 1.5;
  display: inline-block;
  padding: 0 10rpx;
}

.p-truth-card {
  background: #100d09;
  border: 1px solid #3d2f20;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
  text-align: left;
}

.p-truth-title {
  font-size: 20rpx;
  color: #dc2626;
  font-weight: 900;
  display: block;
  margin-bottom: 10rpx;
}

.p-truth-content {
  font-size: 22rpx;
  color: #d6c6b2;
  line-height: 1.6;
  display: block;
}

.p-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #3d2f20;
  padding-top: 16rpx;
  margin-top: 10rpx;
}

.p-footer-left {
  display: flex;
  flex-direction: column;
}

.p-investigator-name {
  font-size: 20rpx;
  color: #eed9b3;
  font-weight: bold;
}

.p-archive-date {
  font-size: 18rpx;
  color: #8a7761;
  margin-top: 4rpx;
}

.p-footer-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.p-brand-tag {
  font-size: 20rpx;
  color: #f59e0b;
  font-weight: 900;
  letter-spacing: 2rpx;
}

.p-qr-hint {
  font-size: 16rpx;
  color: #786550;
  margin-top: 4rpx;
}

/* 离屏 Canvas (完全脱离文档流，不干扰弹窗) */
.offscreen-canvas-holder {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 640px;
  height: 1020px;
  opacity: 0;
  pointer-events: none;
  z-index: -999;
}

.poster-actions {
  width: 100%;
}

.save-poster-btn {
  background: linear-gradient(135deg, #dc2626, #991b1b);
  border: 2rpx solid #f87171;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 900;
  letter-spacing: 2rpx;
  border-radius: 10rpx;
  padding: 10rpx 0;
  box-shadow: 0 6rpx 20rpx rgba(220, 38, 38, 0.5);
}

/* ---------------- 模态框 7：三阶迷雾灵感手记 ---------------- */
.hints-modal-box {
  width: 90%;
  max-width: 650rpx;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
}

.hints-modal-sub {
  padding: 10rpx 0 16rpx 0;
  border-bottom: 1px dashed rgba(200, 160, 100, 0.25);
  margin-bottom: 20rpx;
}

.hints-lore-desc {
  font-size: 22rpx;
  color: #a8947b;
  line-height: 1.5;
  display: block;
}

.hint-tiers-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  overflow-y: auto;
  max-height: 52vh;
  padding-right: 6rpx;
}

.hint-tier-card {
  border-radius: 12rpx;
  padding: 20rpx 22rpx;
  transition: all 0.3s ease;
}

.hint-tier-card.tier-unlocked {
  background: rgba(38, 28, 16, 0.85);
  border: 1px solid #c59b27;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.4), inset 0 0 16rpx rgba(217, 119, 6, 0.15);
}

.hint-tier-card.tier-locked {
  background: rgba(18, 15, 20, 0.7);
  border: 1px dashed #4a3e31;
  opacity: 0.78;
}

.tier-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.tier-badge {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.tier-level-num {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 6rpx;
  background: #3b2a1a;
  color: #f59e0b;
  font-weight: 800;
  border: 1px solid #785223;
}

.tier-title {
  font-size: 26rpx;
  font-weight: bold;
  color: #eed9b3;
  letter-spacing: 1rpx;
}

.tier-status-tag {
  font-size: 20rpx;
  color: #8c7760;
}

.tier-unlocked .tier-status-tag {
  color: #34d399;
}

.tier-body {
  margin-top: 6rpx;
}

.tier-unlocked-text {
  font-size: 25rpx;
  color: #e4d8c5;
  line-height: 1.6;
  text-align: justify;
}

.tier-locked-placeholder {
  padding: 14rpx 10rpx;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8rpx;
  text-align: center;
}

.tier-blur-lock {
  font-size: 22rpx;
  color: #736453;
  font-style: italic;
}

.hints-modal-footer {
  margin-top: 24rpx;
  padding-top: 16rpx;
  border-top: 1px solid rgba(180, 140, 80, 0.2);
}

.unlock-hint-btn {
  background: linear-gradient(135deg, #9a3412, #7c2d12);
  border: 2rpx solid #ea580c;
  color: #ffedd5;
  font-size: 26rpx;
  font-weight: bold;
  border-radius: 12rpx;
  padding: 12rpx 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  box-shadow: 0 4rpx 16rpx rgba(154, 52, 18, 0.4);
}

.unlock-hint-btn[disabled] {
  background: #2a201c !important;
  border-color: #4b392e !important;
  color: #6d5b4f !important;
  box-shadow: none !important;
  opacity: 0.6;
}

.unlock-btn-icon {
  font-size: 28rpx;
}

.unlock-btn-text {
  letter-spacing: 1rpx;
}

.all-hints-unlocked-tip {
  text-align: center;
  font-size: 24rpx;
  color: #c59b27;
  padding: 10rpx 0;
  letter-spacing: 2rpx;
}

.hints-give-up-row {
  text-align: center;
  margin-top: 18rpx;
  padding: 8rpx 0;
  cursor: pointer;
}

.hints-give-up-txt {
  font-size: 22rpx;
  color: #ef4444;
  text-decoration: underline;
  letter-spacing: 1rpx;
  transition: opacity 0.2s;
}

.hints-give-up-txt:active {
  opacity: 0.7;
}
</style>
