// schedule.js

document.addEventListener("DOMContentLoaded", async () => {
    try {
      // 1. 读取 JSON
      const response = await fetch("../police/schedule.json");
      const scheduleData = await response.json();
  
      // 2. 构造日历 <table>
      buildScheduleTable(scheduleData);
  
      // 3. 初始化右侧折叠面板
      initFoldingPanel(scheduleData);
  
    } catch (err) {
      console.error("无法加载排班JSON:", err);
    }
  });
  
  function buildScheduleTable(scheduleData) {
    const tableContainer = document.getElementById("scheduleTable");
    if (!tableContainer) return;
  
    // 创建 table, thead
    const table = document.createElement("table");
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
  
    let currentRow = document.createElement("tr");
    let currentWeekday = 0; // 0..6
    let filledDays = 0;
  
    scheduleData.forEach((dayObj, idx) => {
      const wday = dayObj.weekday; 
      // 插空
      while (currentWeekday < wday) {
        currentRow.appendChild(document.createElement("td"));
        currentWeekday++;
        filledDays++;
        if (filledDays % 7 === 0) {
          tbody.appendChild(currentRow);
          currentRow = document.createElement("tr");
          currentWeekday = 0;
        }
      }
  
      // 关键：如果 idx===0，说明这是整个日历的第一天 => isFirstDay = true
      const isFirstDay = (idx === 0);
  
      // 构造单元格
      const td = buildDayCell(dayObj, isFirstDay);
      currentRow.appendChild(td);
  
      currentWeekday++;
      filledDays++;
      if (filledDays % 7 === 0) {
        tbody.appendChild(currentRow);
        currentRow = document.createElement("tr");
        currentWeekday = 0;
      }
    });
  
    // 补空
    while (filledDays % 7 !== 0) {
      currentRow.appendChild(document.createElement("td"));
      filledDays++;
    }
    if (currentRow.children.length > 0) {
      tbody.appendChild(currentRow);
    }
  
    tableContainer.appendChild(table);
  }
  
  function buildDayCell(dayObj, isFirstDay) {
    // dayObj: { date, year, month, day, weekday, 排班摘要, work_people, rest_people, ... }
    // isFirstDay: boolean，表示整个排班表的第一天
  
    const td = document.createElement("td");
    
    // 1) 左上角 显示月份 (若 day=1 or isFirstDay)
    if (isFirstDay || dayObj.day === 1) {
      const monthSpan = document.createElement("div");
      monthSpan.className = "day-month";
      monthSpan.textContent = `${dayObj.month}月`;
      td.appendChild(monthSpan);
    }
  
    // 2) 右上角 显示“日号”(仅显示 dayObj.day)
    const dateSpan = document.createElement("div");
    dateSpan.className = "day-date";
    dateSpan.textContent = dayObj.day; 
    td.appendChild(dateSpan);
  
    // 3) 中间 摘要
    const summaryDiv = document.createElement("div");
    summaryDiv.className = "day-summary";
    summaryDiv.textContent = dayObj["排班摘要"];
    td.appendChild(summaryDiv);
  
    // 4) data-names 用于高亮
    let allWorkers = dayObj.work_people.replace(/、/g, ",");
    allWorkers = allWorkers.split(",").map(x=>x.trim()).filter(Boolean);
    td.setAttribute("data-names", allWorkers.join("|"));
  
    return td;
  }
  
  function initFoldingPanel(scheduleData) {
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
    for (let i = 0; i < scheduleData.length; i++) {
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
  