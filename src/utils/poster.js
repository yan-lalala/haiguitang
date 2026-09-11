/**
 * 欧律狄刻庄园 · 绝密结案海报生成与保存引擎
 * 纯前端 Canvas 离屏渲染，适配微信小程序与 H5 浏览器
 */

export function renderPosterToCanvas({
  ctx,
  soup,
  score,
  historyCount,
  sanValue,
  playerName
}) {
  const W = 640;
  const H = 1020;

  // 1. 底色：复古暗黑羊皮纸
  ctx.fillStyle = '#14110d';
  ctx.fillRect(0, 0, W, H);

  // 边框内衬渐变
  ctx.fillStyle = '#1c1711';
  ctx.fillRect(16, 16, W - 32, H - 32);

  // 缝线装饰双边框
  ctx.strokeStyle = '#54422e';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.strokeStyle = '#856b49';
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  // 2. 顶部庄园档案馆眉首
  ctx.fillStyle = '#9e8d78';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('🗝️  E U R Y D I C E   M A N O R  🗝️', W / 2, 70);

  ctx.fillStyle = '#6b5843';
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillText('—— 绝 密 案 卷 结 案 卷 宗 ——', W / 2, 94);

  // 3. 案卷名称与分类
  ctx.fillStyle = '#e8d7be';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.fillText(`《 ${soup.title} 》`, W / 2, 146);

  ctx.fillStyle = '#d97706';
  ctx.font = '16px -apple-system, sans-serif';
  ctx.fillText(`[ ${soup.category} ] · 诡秘度 ${soup.difficulty}`, W / 2, 178);

  // 分割线
  ctx.strokeStyle = '#3d3021';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 200);
  ctx.lineTo(W - 60, 200);
  ctx.stroke();

  // 4. 倾斜血色火漆钢印
  ctx.save();
  ctx.translate(W / 2, 275);
  ctx.rotate(-7 * Math.PI / 180);

  ctx.strokeStyle = '#b91c1c';
  ctx.lineWidth = 4;
  ctx.strokeRect(-160, -36, 320, 72);

  ctx.fillStyle = 'rgba(185, 28, 28, 0.15)';
  ctx.fillRect(-160, -36, 320, 72);

  ctx.fillStyle = '#dc2626';
  ctx.font = '900 28px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('CASE CLOSED', 0, 0);

  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillText('真 相 大 白 · 逃 出 庄 园', 0, 22);
  ctx.restore();

  // 5. 战绩数据方阵 (4格)
  const boxY = 345;
  const boxW = 120;
  const boxH = 75;
  const gap = 16;
  const startX = (W - (boxW * 4 + gap * 3)) / 2;

  const stats = [
    { label: '契合度', val: `${score}%`, color: '#f59e0b' },
    { label: '质询次数', val: `${historyCount}`, color: '#38bdf8' },
    { label: '幸存理智', val: `${sanValue}`, color: '#22c55e' },
    { label: '解开疑团', val: `${soup.clues.length}/${soup.clues.length}`, color: '#ec4899' }
  ];

  stats.forEach((st, idx) => {
    const x = startX + idx * (boxW + gap);
    ctx.fillStyle = '#221b14';
    ctx.fillRect(x, boxY, boxW, boxH);
    ctx.strokeStyle = '#473623';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, boxY, boxW, boxH);

    ctx.fillStyle = st.color;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(st.val, x + boxW / 2, boxY + 38);

    ctx.fillStyle = '#9e8d78';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillText(st.label, x + boxW / 2, boxY + 62);
  });

  // 6. 核心哲学金句卡片 (羊皮纸卡)
  const quoteY = 445;
  ctx.fillStyle = '#1c150e';
  ctx.fillRect(50, quoteY, W - 100, 110);
  ctx.strokeStyle = '#5a4632';
  ctx.lineWidth = 1;
  ctx.strokeRect(50, quoteY, W - 100, 110);

  // 引号
  ctx.fillStyle = '#8c2323';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('“', 65, quoteY + 38);

  ctx.fillStyle = '#fde68a';
  ctx.font = 'italic 17px Georgia, serif';
  ctx.textAlign = 'center';
  wrapText(ctx, soup.quote || '迷雾终将散尽，真相永不沉沦。', W / 2, quoteY + 52, W - 140, 26);

  // 7. 真相复盘概要框
  const truthY = 575;
  ctx.fillStyle = '#0f0c09';
  ctx.fillRect(50, truthY, W - 100, 290);
  ctx.strokeStyle = '#382b1c';
  ctx.lineWidth = 1;
  ctx.strokeRect(50, truthY, W - 100, 290);

  ctx.fillStyle = '#b91c1c';
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('【案情始末真相】', 70, truthY + 32);

  ctx.fillStyle = '#d6c6b2';
  ctx.font = '15px -apple-system, sans-serif';
  wrapText(ctx, soup.truth, 70, truthY + 64, W - 140, 24);

  // 8. 底部调查员签名与小程序防伪戳
  const footerY = 910;
  ctx.strokeStyle = '#3d3021';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, footerY);
  ctx.lineTo(W - 50, footerY);
  ctx.stroke();

  ctx.fillStyle = '#eed9b3';
  ctx.font = '15px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`首席调查员：${playerName || '匿名探求者'}`, 60, footerY + 36);

  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  ctx.fillStyle = '#8a7761';
  ctx.font = '13px monospace';
  ctx.fillText(`卷宗封存日期：${dateStr}`, 60, footerY + 62);

  // 右下角印鉴印章
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillText('海 龟 汤 探 案 馆', W - 60, footerY + 36);

  ctx.fillStyle = '#786550';
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillText('微信搜索 · 扫码共破绝密案卷', W - 60, footerY + 60);

  ctx.draw(false);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  let line = '';
  let curY = y;
  for (let n = 0; n < text.length; n++) {
    const testLine = line + text[n];
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line, x, curY);
      line = text[n];
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, curY);
}
