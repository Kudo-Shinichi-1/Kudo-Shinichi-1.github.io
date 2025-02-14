// schedule.js

/*************************************
 * 全局变量
 *************************************/
let monthGroups = [];           // [{ year, month, days: [dayObj,...] }, ...]
let currentMonthIndex = 0;      // 当前月份索引
let dayMap = new Map();         // key="YYYY-MM-DD", value= dayObj，用于跨月补齐

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1. 读取 JSON
    const response = await fetch("../police/schedule.json");
    const scheduleData = await response.json();

    if (!scheduleData || scheduleData.length === 0) {
      console.warn("schedule.json 内容为空。");
      return;
    }

    // 2. 构建 dayMap，方便查找某日期是否有记录
    scheduleData.forEach(d => {
      dayMap.set(d.date, d); // d.date 形如 '2025-03-01'
    });

    // 3. 按年-月分组
    monthGroups = groupByYearMonth(scheduleData);

    // 4. 找到“当前系统年月”，尝试定位到 monthGroups 中对应索引
    const today = new Date();
    const thisYear = today.getFullYear();
    const thisMonth = today.getMonth() + 1; // 1..12
    let foundIndex = monthGroups.findIndex(m => m.year === thisYear && m.month === thisMonth);
    if (foundIndex < 0) {
      // 若没找到，就默认显示最后一个月
      foundIndex = monthGroups.length - 1;
    }
    currentMonthIndex = foundIndex;

    // 5. 显示当前月份
    showMonth(currentMonthIndex);

    // 6. 初始化右侧折叠面板
    initFoldingPanel(scheduleData);

    // 7. 绑定“上月”“下月”按钮点击事件
    document.getElementById("prevMonth").addEventListener("click", () => {
      if (currentMonthIndex > 0) {
        currentMonthIndex--;
        showMonth(currentMonthIndex);
      }
    });
    document.getElementById("nextMonth").addEventListener("click", () => {
      if (currentMonthIndex < monthGroups.length - 1) {
        currentMonthIndex++;
        showMonth(currentMonthIndex);
      }
    });

    // 初次检查按钮状态
    updateNavButtons();

  } catch (err) {
    console.error("无法加载排班JSON:", err);
  }
});

/*************************************
 * 函数：按年-月分组
 *************************************/
function groupByYearMonth(scheduleData) {
  // 假定 scheduleData 已按日期升序，如csv_to_super_rich_json生成的一样
  if (!scheduleData || scheduleData.length === 0) return [];
  
  // 临时Map: key= '2025-03', val={year:2025, month:3, days:[...]}
  let map = new Map();

  scheduleData.forEach(dayObj => {
    const ymKey = `${dayObj.year}-${String(dayObj.month).padStart(2, '0')}`;
    if (!map.has(ymKey)) {
      map.set(ymKey, {
        year: dayObj.year,
        month: dayObj.month,
        days: []
      });
    }
    map.get(ymKey).days.push(dayObj);
  });

  // 按键值排序
  let sortedKeys = Array.from(map.keys()).sort(); // '2025-01','2025-02',...
  let result = [];
  sortedKeys.forEach(k => {
    let group = map.get(k);
    // 对 group.days 再根据 dayObj.day 排序
    group.days.sort((a,b) => a.day - b.day);
    result.push(group);
  });
  return result;
}

/*************************************
 * 函数：显示指定月份索引
 *************************************/
function showMonth(index) {
  // 1. 清空旧表格
  const tableContainer = document.getElementById("scheduleTable");
  if (!tableContainer) return;
  tableContainer.innerHTML = "";

  // 2. 获取月份数据
  const group = monthGroups[index];
  const days = group.days; // 已经是当月全部日期 sorted
  if (!days || days.length === 0) {
    console.warn("本月无排班记录？");
    return;
  }

  // 3. 更新顶部标题，如 "2025年3月"
  const monthTitle = document.getElementById("monthTitle");
  if (monthTitle) {
    monthTitle.textContent = `${group.year}年${group.month}月`;
  }

  // 4. 生成 "leadingDays" + "days" + "trailingDays"
  const firstDayObj = days[0];
  const lastDayObj = days[days.length - 1];
  const leadingDays = getLeadingDays(firstDayObj, dayMap);
  const trailingDays = getTrailingDays(lastDayObj, dayMap);
  const allMonthDays = [...leadingDays, ...days, ...trailingDays];

  // 5. 构建表格: <table><thead><tbody>...
  const table = document.createElement("table");

  // thead
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["周一","周二","周三","周四","周五","周六","周日"].forEach(dayName => {
    const th = document.createElement("th");
    th.textContent = dayName;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  // 6. 按顺序填充到格子
  let currentRow = document.createElement("tr");
  let filledDays = 0;

  for (let i=0; i<allMonthDays.length; i++) {
    const dayObj = allMonthDays[i];
    // 构造单元格
    // isFirstDay指合并数组后的第0项 => 不一定真正是该月首日
    // 如果需要严格判断 => dayObj是否与days[0]相同？
    const isFirstDay = (i===0);

    const td = buildDayCell(dayObj, isFirstDay);
    currentRow.appendChild(td);

    filledDays++;
    if (filledDays % 7 === 0) {
      tbody.appendChild(currentRow);
      currentRow = document.createElement("tr");
    }
  }

  // 补齐最后一行
  while (filledDays % 7 !== 0) {
    currentRow.appendChild(document.createElement("td"));
    filledDays++;
  }
  if (currentRow.children.length > 0) {
    tbody.appendChild(currentRow);
  }

  // 7. 加入 DOM
  tableContainer.appendChild(table);

  // 8. 更新翻页按钮
  updateNavButtons();
}

/*************************************
 * 函数：获取上月末记录
 *************************************/
function getLeadingDays(firstDayObj, dayMap) {
  const leading = [];
  const needCount = firstDayObj.weekday; // weekday=0..6, 0=周一 =>不需要补
  if (needCount <= 0) return leading;

  // 往前 i 天
  let baseDate = new Date(firstDayObj.date); // e.g. 2025-03-01
  for (let i = 1; i <= needCount; i++) {
    let prevDate = new Date(baseDate);
    prevDate.setDate(prevDate.getDate() - i);
    let ymd = prevDate.toISOString().slice(0,10);
    if (dayMap.has(ymd)) {
      leading.push(dayMap.get(ymd));
    } else {
      // 数据中无此日 => 看你需求，可 break
      // break; // or continue;
    }
  }
  // leading是逆序 => 翻转
  leading.reverse();
  return leading;
}

/*************************************
 * 函数：获取下月初记录
 *************************************/
function getTrailingDays(lastDayObj, dayMap) {
  const trailing = [];
  const needCount = 6 - lastDayObj.weekday; // weekday=6=周日=>0
  if (needCount <= 0) return trailing;

  let baseDate = new Date(lastDayObj.date);
  for (let i = 1; i <= needCount; i++) {
    let nxtDate = new Date(baseDate);
    nxtDate.setDate(nxtDate.getDate() + i);
    let ymd = nxtDate.toISOString().slice(0,10);
    if (dayMap.has(ymd)) {
      trailing.push(dayMap.get(ymd));
    } else {
      // break; or continue;
    }
  }
  return trailing;
}

/*************************************
 * 函数：构造单元格
 *************************************/
function buildDayCell(dayObj, isFirstDay) {
  const td = document.createElement("td");

  // 如果是今日 => 加class
  const todayStr = new Date().toISOString().slice(0,10);
  if (dayObj.date === todayStr) {
    td.classList.add("today-cell");
  }

  // 若 day=1 or isFirstDay => 显示 "X月"
  //   if (isFirstDay || dayObj.day === 1) {
  if (dayObj.day === 1) { // 只在每月第1天显示月份了
    const monthSpan = document.createElement("div");
    monthSpan.className = "day-month";
    monthSpan.textContent = `${dayObj.month}月`;
    td.appendChild(monthSpan);
  }

  // 右上角：日号
  const dateSpan = document.createElement("div");
  dateSpan.className = "day-date";
  dateSpan.textContent = dayObj.day;
  td.appendChild(dateSpan);

  // 中间：排班摘要
  const summaryDiv = document.createElement("div");
  summaryDiv.className = "day-summary";
  summaryDiv.textContent = dayObj["排班摘要"] || "";
  td.appendChild(summaryDiv);

  // data-names 用于后续高亮
  let allWorkers = dayObj.work_people.replace(/、/g, ",");
  allWorkers = allWorkers.split(",").map(x=>x.trim()).filter(Boolean);
  td.setAttribute("data-names", allWorkers.join("|"));

  return td;
}

/*************************************
 * 函数：更新翻页按钮
 *************************************/
function updateNavButtons() {
  const prevBtn = document.getElementById("prevMonth");
  const nextBtn = document.getElementById("nextMonth");
  if (!prevBtn || !nextBtn) return;

  if (currentMonthIndex <= 0) {
    prevBtn.disabled = true;
  } else {
    prevBtn.disabled = false;
  }
  if (currentMonthIndex >= monthGroups.length - 1) {
    nextBtn.disabled = true;
  } else {
    nextBtn.disabled = false;
  }
}

/*************************************
 * 函数：右侧折叠页 + 勾选高亮 + 计数君
 *************************************/
function initFoldingPanel(scheduleData) {
  // 折叠
  const foldingPanel = document.getElementById("foldingPanel");
  const foldingTab = document.getElementById("foldingTab");
  foldingTab.addEventListener("click", () => {
    foldingPanel.classList.toggle("folded");
  });

  // 收集员工姓名
  const allNames = new Set();
  scheduleData.forEach(d => {
    d.work_people.replace(/、/g, ",").split(",").forEach(n => {
      if(n.trim()) allNames.add(n.trim());
    });
    d.rest_people.replace(/、/g, ",").split(",").forEach(n => {
      if(n.trim()) allNames.add(n.trim());
    });
  });
  const nameList = Array.from(allNames);

  // 勾选表
  const employeeChecklist = document.getElementById("employeeChecklist");
  nameList.forEach(name => {
    const label = document.createElement("label");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = name;
    chk.addEventListener("change", e => {
      highlightPerson(name, e.target.checked);
    });
    label.appendChild(chk);
    label.appendChild(document.createTextNode(" " + name));
    employeeChecklist.appendChild(label);
    employeeChecklist.appendChild(document.createElement("br"));
  });

  // 计数君
  const countInfo = document.getElementById("countInfo");
  const todayStr = new Date().toISOString().slice(0,10);
  let bestRecord = null;
  for (let i=0; i<scheduleData.length; i++) {
    if (scheduleData[i].date <= todayStr) {
      bestRecord = scheduleData[i];
    } else {
      break;
    }
  }
  if (!bestRecord) {
    countInfo.textContent = "暂无可用统计。";
  } else {
    const pdc = bestRecord.person_day_count || {};
    const lines = [];
    for (let [pName, c] of Object.entries(pdc)) {
      lines.push(`${pName}: ${c} 天`);
    }
    countInfo.innerHTML = lines.join("<br>");
  }
}

/*************************************
 * 函数：高亮某员工
 *************************************/
function highlightPerson(name, turnOn) {
  const cells = document.querySelectorAll("#scheduleTable td[data-names]");
  cells.forEach(td => {
    const names = td.getAttribute("data-names").split("|");
    if (names.includes(name)) {
      if (turnOn) {
        td.classList.add("highlight");
      } else {
        td.classList.remove("highlight");
      }
    }
  });
}
