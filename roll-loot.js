// roll-loot.js (v12)
const MODULE_ID = "roll-loot";
const SETTINGS_KEY = "lootData";

// 1. 注册设置项（保存抽奖数据）
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS_KEY, {
    name: "Roll Loot Data",
    scope: "world",
    config: false,
    type: String,
    default: JSON.stringify({ categories: [] })
  });
});

// 2. 注册侧边栏按钮
Hooks.on("getSceneControlButtons", controls => {
  const tokenControls = controls.find(c => c.name === "token");
  if (tokenControls) {
    tokenControls.tools.push({
      name: "openRollLoot",
      title: "打开抽奖面板",
      icon: "fas fa-gifts",
      button: true,
      onClick: () => {
        game.socket.emit(`module.${MODULE_ID}`, { type: "open-ui", by: game.user.id });
        RollLootApp.getInstance().render(true);
      }
    });
  }
});

// 3. 全局socket同步：所有人都能看到抽奖页面和结果
Hooks.once("ready", () => {
  game.socket.on(`module.${MODULE_ID}`, data => {
    if (!data || !data.type) return;
    if (data.type === "open-ui") {
      RollLootApp.getInstance().render(true);
    } else if (data.type === "start-rolling") {
      RollLootApp.getInstance().showRollingAnimation(data);
    } else if (data.type === "announce-result") {
      RollLootApp.getInstance().announceResult(data);
    }
  });
});

// 4. 主应用类
class RollLootApp extends Application {
  static _instance = null;
  static getInstance() {
    if (!this._instance) this._instance = new RollLootApp();
    return this._instance;
  }
  constructor(options = {}) {
    super(Object.assign({
      id: "roll-loot-app",
      title: "全局抽奖",
      template: `modules/${MODULE_ID}/templates/loot-app.html`,
      classes: ["roll-loot-app"],
      width: 480,
      height: 400,
      resizable: true,
      minimizable: true,
      maximizable: true
    }, options));
  }
  async getData() {
    // 读取抽奖数据
    let raw = game.settings.get(MODULE_ID, SETTINGS_KEY);
    let parsed = {};
    try { parsed = JSON.parse(raw || "{}") } catch { parsed = { categories: [] } }
    const normalized = normalizeLootData(parsed);
    return { 
      categories: normalized.categories || [],
      isGM: game.user.isGM
    };
  }
  activateListeners(html) {
    super.activateListeners(html);
    console.log("activateListeners called");
    // 抽奖按钮
    html.find("#roll-loot-btn-roll").on("click", async ev => {
      console.log("roll button clicked");
      const sel = html.find("#roll-loot-category").val();
      const idx = parseInt(sel);
      if (isNaN(idx)) return ui.notifications.warn("请选择分类。");
      await this.doRoll(idx);
    });
    // 导入JSON
    html.find("#roll-loot-btn-import").on("click", async ev => {
      if (!game.user.isGM) return ui.notifications.error("只有 GM 可以导入 JSON 数据。");
      
      // 先尝试触发文件选择对话框
      const fileInput = html.find("#roll-loot-file-import");
      fileInput.on("change", async function(ev) {
        const file = ev.target.files[0];
        if (!file) return;
        
        try {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const txt = e.target.result;
              const parsed = JSON.parse(txt);
              const normalized = normalizeLootData(parsed);
              await game.settings.set(MODULE_ID, SETTINGS_KEY, JSON.stringify(normalized));
              ui.notifications.info("抽奖数据已从文件导入。");
              RollLootApp.getInstance().render();
              // 清空文件选择，允许重复上传同一个文件
              ev.target.value = '';
            } catch (err) {
              ui.notifications.error("文件解析失败，请检查JSON格式。");
              console.error("解析JSON文件时出错:", err);
              // 清空文件选择，允许重试
              ev.target.value = '';
              
              // 如果文件上传失败，提供手动输入选项
              showManualImportDialog();
            }
          };
          reader.onerror = () => {
            ui.notifications.error("文件读取失败。");
            // 清空文件选择，允许重试
            ev.target.value = '';
            
            // 如果文件上传失败，提供手动输入选项
            showManualImportDialog();
          };
          reader.readAsText(file);
        } catch (err) {
          ui.notifications.error("处理文件时出错。");
          console.error("文件处理错误:", err);
          // 清空文件选择，允许重试
          ev.target.value = '';
          
          // 如果文件上传失败，提供手动输入选项
          showManualImportDialog();
        }
      });
      
      // 触发文件选择
      fileInput.click();
      
      // 设置一个超时，如果用户取消了文件选择，提供手动输入选项
      setTimeout(() => {
        // 检查文件输入是否仍为空
        if (!fileInput[0].files.length) {
          // 提供手动输入选项
          new Dialog({
            title: "导入抽奖JSON",
            content: `
              <div>
                <p style="margin-bottom: 10px;">选择导入方式：</p>
                <div style="display: flex; gap: 10px;">
                  <button type="button" id="roll-loot-retry-file" class="button">重新选择文件</button>
                  <button type="button" id="roll-loot-use-manual" class="button">手动输入JSON</button>
                </div>
              </div>
            `,
            buttons: {
              close: { label: "关闭" }
            },
            render: html => {
              html.find("#roll-loot-retry-file").on("click", () => {
                // 触发文件选择
                html.closest(".dialog").remove();
                fileInput.click();
              });
              
              html.find("#roll-loot-use-manual").on("click", () => {
                // 显示手动输入对话框
                html.closest(".dialog").remove();
                showManualImportDialog();
              });
            }
          }).render(true);
        }
      }, 500); // 给用户一些时间来选择文件
      
      // 手动输入对话框函数
      function showManualImportDialog() {
        new Dialog({
          title: "手动导入抽奖JSON",
          content: `<div><textarea id="roll-loot-import-text" style="width:100%;height:260px;">${escapeHTML(game.settings.get(MODULE_ID, SETTINGS_KEY) || "")}</textarea></div>`,
          buttons: {
            ok: {
              label: "导入并保存",
              callback: async htmlDialog => {
                const txt = htmlDialog.find("#roll-loot-import-text").val();
                try {
                  const parsed = JSON.parse(txt);
                  const normalized = normalizeLootData(parsed);
                  await game.settings.set(MODULE_ID, SETTINGS_KEY, JSON.stringify(normalized));
                  ui.notifications.info("抽奖数据已保存。");
                  RollLootApp.getInstance().render();
                } catch {
                  ui.notifications.error("JSON 解析失败，请检查格式。");
                }
              }
            },
            cancel: { label: "取消" }
          },
          default: "ok"
        }).render(true);
      }
    });
    // 导出JSON
    html.find("#roll-loot-btn-download").on("click", ev => {
      const raw = game.settings.get(MODULE_ID, SETTINGS_KEY);
      const blob = new Blob([raw], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "roll-loot-data.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  async doRoll(categoryIndex) {
    console.log("doRoll called", categoryIndex);
    // 读取数据
    let raw = game.settings.get(MODULE_ID, SETTINGS_KEY);
    let parsed = {};
    try { parsed = JSON.parse(raw || "{}") } catch { parsed = { categories: [] } }
    const normalized = normalizeLootData(parsed);
    const cat = normalized.categories?.[categoryIndex];
    if (!cat) return ui.notifications.warn("未选择有效分类或分类为空。");
    const items = Array.isArray(cat.items) ? cat.items : [];
    if (items.length === 0) return ui.notifications.warn("当前分类没有抽奖项。");
    // 权重抽奖（预留：cat.weight，可自定义每个分类概率）
    const picked = weightedPick(items);
    
    // 1. 广播开始滚动动画
    console.log("emit start-rolling", items);
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "start-rolling",
      by: game.user.id,
      categoryIndex,
      items: items.map(i => ({ name: i.name, description: i.description || "" }))
    });
    console.log("emit start-rolling done");
    
    // 本地显示简单动画
    this.showSimpleRolling(items);
    
    // 2. 动画后显示结果并输出到聊天框
    setTimeout(async () => {
      // 显示抽奖结果
      this.showRollResult({
        result: { name: picked?.name, description: picked?.description }
      });
      
      // 输出到聊天框
      const resultHtml = `
        <div class="roll-loot-result">
          <strong>🎯 抽奖结果</strong><br/>
          <strong>抽奖分类：</strong> ${escapeHTML(cat.name || "未命名分类")}<br/>
          <strong>抽中：</strong> ${escapeHTML(picked?.name || "空")}
          ${picked?.description ? `<div style="font-size:0.9em;color:#ccc;margin-top:4px;">${escapeHTML(picked.description)}</div>` : ""}
        </div>
      `;
      
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        content: resultHtml
      });
      
      // 广播结果
      game.socket.emit(`module.${MODULE_ID}`, {
        type: "announce-result",
        by: game.user.id,
        categoryIndex,
        result: { name: picked?.name, description: picked?.description }
      });
    }, 2000); // 2秒后显示结果
  }

  // 简单抽奖动画（在面板内）
  showSimpleRolling(items) {
    const area = $(".roll-loot-result-area");
    if (!area.length) return;
    
    let idx = 0;
    const interval = setInterval(() => {
      const item = items[idx % items.length];
      area.html(`
        <div class="roll-rolling">
          <div style="text-align: center; padding: 20px;">
            <div style="font-size: 2rem;">🎲</div>
            <div style="font-size: 1.5rem; margin-top: 10px;"><b>${escapeHTML(item.name)}</b></div>
          </div>
        </div>
      `);
      idx++;
    }, 100);
    
    // 2秒后停止动画
    setTimeout(() => {
      clearInterval(interval);
      area.html('<div class="roll-rolling" style="text-align: center; padding: 20px; color: #ff6b6b;">🎯 抽奖结果即将揭晓...</div>');
    }, 2000);
  }

  // 新增：显示抽奖结果
  showRollResult(data) {
    // 在抽奖面板显示结果
    const area = $(".roll-loot-result-area");
    if (area.length) {
      area.html(`
        <div class="roll-loot-result">
          <strong>🎯 抽奖结果</strong><br/>
          <div style="margin-top: 8px; padding: 8px; background: #36393f; border-radius: 4px;">
            <strong>抽中：</strong> ${escapeHTML(data.result?.name || "未知")}<br/>
            ${data.result?.description ? `<div style="font-size:0.9em;color:#ccc;margin-top:4px;">${escapeHTML(data.result.description)}</div>` : ""}
          </div>
        </div>
      `);
    }
  }

  // 显示最终抽奖结果
  showFinalResult(items) {
    if (!items || items.length === 0) return;
    
    // 随机选择一个物品作为结果
    const picked = items[Math.floor(Math.random() * items.length)];
    
    // 在抽奖面板的结果区域显示
    const area = $(".roll-loot-result-area");
    if (area.length) {
      area.html(`
        <div class="roll-loot-result">
          <strong>🎯 抽奖结果</strong><br/>
          <strong>抽中：</strong> ${escapeHTML(picked.name || "空")}
          ${picked.description ? `<div style="font-size:0.9em;color:#ccc">${escapeHTML(picked.description)}</div>` : ""}
        </div>
      `);
    }
    
    // 显示通知
    ui.notifications.info(`抽奖完成！抽中了：${picked.name}`);
  }

  announceResult(data) {
    console.log("announceResult called", data);
    // 显示最终结果
    const area = $(".roll-loot-result-area");
    if (area.length) {
      area.html(`<div class="roll-loot-result"><strong>抽中：</strong> ${escapeHTML(data.result?.name || "空")}${data.result?.description ? ` <div style=\"font-size:0.9em;color:#ccc\">${escapeHTML(data.result.description)}</div>` : ""}</div>`);
    }
    ui.notifications.info(`玩家${game.users.get(data.by)?.name || "?"} 抽中了：${data.result?.name}`);
  }
}

// 工具函数：权重抽奖（预留分类权重）
function weightedPick(items = []) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const weights = items.map(it => Math.max(0, Number(it.weight) || 1));
  const total = weights.reduce((a,b)=>a+b,0);
  if (total <= 0) return items[Math.floor(Math.random()*items.length)];
  const r = Math.random() * total;
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r <= acc) return items[i];
  }
  return items[items.length-1];
}

// 引入 classifyItems（假设 json_item_extractor.js 已全局可用）
function normalizeLootData(obj) {
  if (!obj) return { categories: [] };
  if (Array.isArray(obj.categories)) return obj;
  if (Array.isArray(obj.items)) {
    const classified = typeof classifyItems === 'function' ? classifyItems(obj) : window.classifyItems(obj);
    return {
      categories: Object.entries(classified.byRarity).map(([rarity, items]) => ({
        name: rarity,
        items
      }))
    };
  }
  return { categories: [] };
}

function escapeHTML(s) {
  if (s === undefined || s === null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
