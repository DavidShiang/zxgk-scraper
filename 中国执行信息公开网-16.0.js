// ==UserScript==
// @name         中国执行信息公开网 - 精简无多余列版
// @namespace    http://tampermonkey.net/
// @version      16.0
// @description  完美抓取弹窗内所有核心字段，已去除无意义的原始参数列，导出表格更清爽
// @author       AI Collaborator
// @match        *://zxgk.court.gov.cn/gkw/html/zhixing/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let allDataRows = [];
    let isRunning = false;
    const clean = (text) => `"${(text || '').trim().replace(/\s+/g, ' ').replace(/"/g, '""')}"`;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const randomDelay = () => sleep(2000 + Math.floor(Math.random() * 2000));

    // 已移除“原始查看参数”列
    const headerString = '"序号","姓名/名称","立案时间","案号","性别","身份证/组织机构代码","执行法院","执行标的"';

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '30px';
    container.style.right = '30px';
    container.style.zIndex = '999999';
    container.style.backgroundColor = '#ffffff';
    container.style.padding = '15px';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    container.style.fontFamily = 'sans-serif';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.minWidth = '240px';

    const title = document.createElement('div');
    title.innerText = '📊 弹窗抓取 (精简版)';
    title.style.fontSize = '14px';
    title.style.fontWeight = 'bold';
    title.style.color = '#333';
    container.appendChild(title);

    const checkboxLabel = document.createElement('label');
    checkboxLabel.style.fontSize = '12px';
    checkboxLabel.style.display = 'flex';
    checkboxLabel.style.alignItems = 'center';
    checkboxLabel.style.gap = '6px';
    checkboxLabel.style.cursor = 'pointer';
    checkboxLabel.style.color = '#007bff';
    checkboxLabel.style.fontWeight = 'bold';

    const detailCheckbox = document.createElement('input');
    detailCheckbox.type = 'checkbox';
    detailCheckbox.checked = true;
    checkboxLabel.appendChild(detailCheckbox);
    checkboxLabel.appendChild(document.createTextNode(' 自动打开弹窗并提取详情'));
    container.appendChild(checkboxLabel);

    const statusText = document.createElement('div');
    statusText.innerText = '状态：就绪 | 已收集 0 条';
    statusText.style.fontSize = '12px';
    statusText.style.color = '#666';
    container.appendChild(statusText);

    const startBtn = document.createElement('button');
    startBtn.innerText = '▶️ 开始抓取当前页';
    startBtn.style.padding = '8px 12px';
    startBtn.style.backgroundColor = '#28a745';
    startBtn.style.color = '#fff';
    startBtn.style.border = 'none';
    startBtn.style.borderRadius = '4px';
    startBtn.style.cursor = 'pointer';
    startBtn.style.fontSize = '13px';

    const exportBtn = document.createElement('button');
    exportBtn.innerText = '📥 导出 CSV 表格';
    exportBtn.style.padding = '8px 12px';
    exportBtn.style.backgroundColor = '#17a2b8';
    exportBtn.style.color = '#fff';
    exportBtn.style.border = 'none';
    exportBtn.style.borderRadius = '4px';
    exportBtn.style.cursor = 'pointer';
    exportBtn.style.fontSize = '13px';

    const clearBtn = document.createElement('button');
    clearBtn.innerText = '🔄 清空已收集';
    clearBtn.style.padding = '5px 10px';
    clearBtn.style.backgroundColor = '#ffc107';
    clearBtn.style.color = '#212529';
    clearBtn.style.border = 'none';
    clearBtn.style.borderRadius = '4px';
    clearBtn.style.cursor = 'pointer';
    clearBtn.style.fontSize = '12px';

    function parseRenderedModalText() {
        let detail = { sex: '—', idCard: '—', court: '—', biaodi: '—' };

        const visibleModals = Array.from(document.querySelectorAll('div[style*="block"], .modal')).filter(el => {
            return window.getComputedStyle(el).display !== 'none' && el.innerText.includes('执行法院');
        });

        if (visibleModals.length === 0) return detail;

        const text = visibleModals[visibleModals.length - 1].innerText;

        const sexMatch = text.match(/性别[：:\s]+([男女\—]+)/);
        if (sexMatch) detail.sex = sexMatch[1].trim();

        const idMatch = text.match(/(?:身份证号|组织机构代码|证件号码)[：:\s]+([0-9xX*]+)/);
        if (idMatch) detail.idCard = idMatch[1].trim();

        const courtMatch = text.match(/执行法院[：:\s]+([^\n\r]+)/);
        if (courtMatch) {
            detail.court = courtMatch[1].trim();
        }

        const biaodiMatch = text.match(/执行标的[：:\s]+([0-9.,]+)/);
        if (biaodiMatch) detail.biaodi = biaodiMatch[1].trim();

        return detail;
    }

    async function forceCloseModal() {
        const buttons = Array.from(document.querySelectorAll('button, a, span, div'));
        const closeBtn = buttons.find(el => {
            const txt = el.innerText.trim();
            return (txt === '关闭' || txt === '×' || el.classList.contains('close')) && el.offsetParent !== null;
        });
        if (closeBtn) {
            closeBtn.click();
            await sleep(400);
        }
    }

    startBtn.onclick = async function() {
        if (isRunning) return;

        const mainTable = document.querySelector('#result-table');
        if (!mainTable) {
            alert('未找到查询结果表格！');
            return;
        }

        await forceCloseModal();

        const rows = mainTable.querySelectorAll('tbody tr, tr');
        const listItems = [];

        rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length === 0) return;
            let viewBtn = row.querySelector('.View, [onclick], a');
            listItems.push({
                rowElement: row,
                cols: cols,
                viewBtn: viewBtn
            });
        });

        if (listItems.length === 0) {
            alert('当前页面没有可抓取的行！');
            return;
        }

        isRunning = true;
        startBtn.disabled = true;
        startBtn.style.backgroundColor = '#6c757d';

        const needDetail = detailCheckbox.checked;

        for (let i = 0; i < listItems.length; i++) {
            statusText.innerText = `处理中：第 ${i + 1} / ${listItems.length} 条...`;
            statusText.style.color = '#007bff';

            const item = listItems[i];
            let listXuhao = item.cols[0] ? item.cols[0].innerText : '';
            let listName = item.cols[1] ? item.cols[1].innerText : '';
            let listTime = item.cols[2] ? item.cols[2].innerText : '';
            let listAnhao = item.cols[3] ? item.cols[3].innerText : '';

            let detailData = { sex: '—', idCard: '—', court: '—', biaodi: '—' };

            if (needDetail && item.viewBtn) {
                await forceCloseModal();
                await randomDelay();

                item.viewBtn.click();

                let modalLoaded = false;
                let waitTime = 0;

                while (!modalLoaded && waitTime < 60000) {
                    await sleep(400);
                    waitTime += 400;

                    const bodyText = document.body.innerText;
                    if (bodyText.includes('请完成安全验证')) {
                        statusText.innerText = `⚠️ 第 ${i + 1} 条触发安全验证，请在画面中依次点选文字！`;
                        statusText.style.color = '#d9534f';
                        continue;
                    }

                    const visibleModals = Array.from(document.querySelectorAll('div[style*="block"], .modal')).filter(el => {
                        return window.getComputedStyle(el).display !== 'none' && el.innerText.includes('执行法院');
                    });

                    if (visibleModals.length > 0) {
                        modalLoaded = true;
                        statusText.style.color = '#007bff';
                        break;
                    }
                }

                if (modalLoaded) {
                    await sleep(300);
                    detailData = parseRenderedModalText();
                    await forceCloseModal();
                } else {
                    statusText.innerText = `⚠️ 第 ${i + 1} 条超时或未过验证，已跳过。`;
                    await forceCloseModal();
                }
            }

            // 组装纯净的字段行（不再包含原始查看参数）
            const rowData = [
                clean(listXuhao),
                clean(listName),
                clean(listTime),
                clean(listAnhao),
                clean(detailData.sex),
                clean(detailData.idCard),
                clean(detailData.court),
                clean(detailData.biaodi)
            ];

            const rowStr = rowData.join(',');
            const existingIndex = allDataRows.findIndex(r => r.includes(clean(listAnhao)) && r.includes(clean(listName)));
            if (existingIndex >= 0) {
                allDataRows[existingIndex] = rowStr;
            } else {
                allDataRows.push(rowStr);
            }
            statusText.innerText = `状态：已收集 ${allDataRows.length} 条数据`;
        }

        isRunning = false;
        startBtn.disabled = false;
        startBtn.style.backgroundColor = '#28a745';
        //alert(`抓取完成！当前累积数据：${allDataRows.length} 条。`);
    };

    exportBtn.onclick = function() {
        if (allDataRows.length === 0) {
            alert('尚未收集到任何数据！');
            return;
        }
        let csvContent = [headerString, ...allDataRows].join('\r\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `被执行人精简数据_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    clearBtn.onclick = function() {
        if (confirm('确定要清空已收集的数据吗？')) {
            allDataRows = [];
            statusText.innerText = '状态：已重置 | 已收集 0 条';
        }
    };

    container.appendChild(startBtn);
    container.appendChild(exportBtn);
    container.appendChild(clearBtn);
    document.body.appendChild(container);
})();