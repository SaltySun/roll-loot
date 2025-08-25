// json_item_extractor.js
// 从JSON文件中提取物品数据的工具类

/**
 * 从物品对象中获取稀有度
 * 支持多种数据结构：
 * - item.rarity
 * - item.data.rarity
 * - item.system.rarity (字符串或对象)
 * @param {Object} item - 物品对象
 * @returns {string} 稀有度
 */
function getRarity(item) {
  if (item.rarity) return item.rarity;
  if (item.data && item.data.rarity) return item.data.rarity;
  if (item.system && item.system.rarity) {
    if (typeof item.system.rarity === 'string') return item.system.rarity;
    if (item.system.rarity.value) return item.system.rarity.value;
  }
  return '未知稀有度';
}

/**
 * 从物品对象中获取描述信息
 * 支持多种数据结构：
 * - item.description
 * - item.data.description
 * - item.system.description (字符串或对象)
 * @param {Object} item - 物品对象
 * @returns {string} 描述信息
 */
function getDescription(item) {
  if (item.description) return item.description;
  if (item.data && item.data.description) return item.data.description;
  if (item.system && item.system.description) {
    if (typeof item.system.description === 'string') return item.system.description;
    if (item.system.description.value) {
      // 移除HTML标签，只保留纯文本
      return item.system.description.value.replace(/<[^>]*>/g, '') || '无描述';
    }
  }
  return '无描述';
}

/**
 * 分类并显示物品
 * @param {Object} data - 包含物品数组的JSON数据
 * @returns {Object} 分类后的物品数据
 */
function classifyItems(data) {
  const items = data.items || [];
  const byRarity = {};
  const allItems = [];

  items.forEach(item => {
    const rarity = getRarity(item);
    if (!byRarity[rarity]) byRarity[rarity] = [];
    byRarity[rarity].push(item);
    allItems.push(item);
  });

  return {
    byRarity: byRarity,
    rarityList: Object.keys(byRarity),
    allItems: allItems
  };
}

/**
 * 加载JSON文件并提取物品数据
 * @param {File} file - JSON文件
 * @param {Function} callback - 回调函数，接收提取后的物品数据
 */
function loadJsonFile(file, callback) {
  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const data = JSON.parse(event.target.result);

      // 验证JSON结构
      if (!data || typeof data !== 'object') {
        throw new Error('JSON不是有效的对象');
      }

      // 检查是否包含items数组
      if (!Array.isArray(data.items)) {
        throw new Error('JSON中未找到items数组');
      }

      // 分类物品
      const itemData = classifyItems(data);
      callback(null, itemData);
    } catch (err) {
      callback(err, null);
    }
  };
  // 明确指定UTF-8编码
  reader.readAsText(file, 'utf-8');
}

// 导出函数供外部使用
if (typeof module !== 'undefined') {
  module.exports = {
    getRarity,
    getDescription,
    classifyItems,
    loadJsonFile
  };
}
// 浏览器环境下挂到 window 供全局调用
if (typeof window !== 'undefined') {
  window.getRarity = getRarity;
  window.getDescription = getDescription;
  window.classifyItems = classifyItems;
  window.loadJsonFile = loadJsonFile;
}