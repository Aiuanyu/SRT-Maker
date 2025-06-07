document.addEventListener('DOMContentLoaded', () => {
    const srtFileInput = document.getElementById('srt-file-input');
    const textFileInput = document.getElementById('text-file-input');
    const srtContentDiv = document.getElementById('srt-content');
    const textContentDiv = document.getElementById('text-content');
    const exportButton = document.getElementById('export-button');
    const srtFilenameSpan = document.getElementById('srt-filename');
    const txtFilenameSpan = document.getElementById('txt-filename');

    let srtData = null; // 儲存解析後的 SRT 結構
    let textLines = null; // 儲存文字檔的行
    let originalSrtFilename = 'merged.srt'; // 預設匯出檔名

    // --- 檔案讀取處理 ---

    srtFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            originalSrtFilename = file.name.replace(/\.srt$/i, '_merged.srt'); // 設定匯出檔名
            srtFilenameSpan.textContent = `已載入: ${file.name}`;
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                srtContentDiv.textContent = content; // 顯示原始 SRT 內容
                try {
                    srtData = parseSRT(content);
                    console.log("SRT parsed:", srtData);
                    checkEnableExport();
                } catch (error) {
                    console.error("Error parsing SRT:", error);
                    srtContentDiv.textContent = `錯誤：無法解析 SRT 檔案。\n${error.message}`;
                    srtData = null;
                    checkEnableExport();
                }
            };
            reader.onerror = () => {
                 srtContentDiv.textContent = '錯誤：讀取 SRT 檔案失敗。';
                 srtData = null;
                 checkEnableExport();
            };
            reader.readAsText(file);
        } else {
             srtFilenameSpan.textContent = '';
             srtContentDiv.textContent = '請先選擇一個 SRT 檔案...';
             srtData = null;
             checkEnableExport();
        }
    });

    textFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            txtFilenameSpan.textContent = `已載入: ${file.name}`;
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                textLines = content.split(/\r?\n/); // 按行分割
                 // 過濾掉可能的空行（如果不需要合併空行）
                // textLines = textLines.filter(line => line.trim() !== '');
                displayTextWithLineNumbers(textLines);
                console.log("Text lines loaded:", textLines);
                checkEnableExport();
            };
             reader.onerror = () => {
                 textContentDiv.textContent = '錯誤：讀取文字檔案失敗。';
                 textLines = null;
                 checkEnableExport();
            };
            reader.readAsText(file);
        } else {
            txtFilenameSpan.textContent = '';
            textContentDiv.textContent = '請先選擇一個文字檔案...';
            textLines = null;
            checkEnableExport();
        }
    });

    // --- 顯示文字檔內容與行號 ---
    function displayTextWithLineNumbers(lines) {
        textContentDiv.innerHTML = ''; // 清空舊內容
        lines.forEach((line, index) => {
            const lineDiv = document.createElement('div');
            const lineNumSpan = document.createElement('span');
            lineNumSpan.className = 'line-number';
            lineNumSpan.textContent = index + 1;

            const lineContentSpan = document.createElement('span');
            lineContentSpan.className = 'line-content';
            lineContentSpan.textContent = line; // 保留原始空白

            lineDiv.appendChild(lineNumSpan);
            lineDiv.appendChild(lineContentSpan);
            textContentDiv.appendChild(lineDiv);
        });
    }

    // --- SRT 解析 ---
    function parseSRT(srtContent) {
        const lines = srtContent.trim().split(/\r?\n/);
        const subtitles = [];
        let currentSubtitle = null;
        let state = 'index'; // 'index', 'time', 'text'

        for (const line of lines) {
            const trimmedLine = line.trim();

            switch (state) {
                case 'index':
                    if (/^\d+$/.test(trimmedLine)) {
                        if (currentSubtitle) { // 完成上一個字幕段落
                             // 如果上個段落沒有文字，補上空字串
                            if (!currentSubtitle.text) currentSubtitle.text = '';
                            subtitles.push(currentSubtitle);
                        }
                        currentSubtitle = { index: parseInt(trimmedLine, 10), time: '', text: '' };
                        state = 'time';
                    } else if (trimmedLine === '' && currentSubtitle) {
                        // 忽略索引和時間之間的空行（如果有的話）
                    } else if (trimmedLine !== '') {
                        // 如果第一個非空行不是數字索引，則格式錯誤
                        if (!currentSubtitle) throw new Error(`預期找到字幕索引數字，但找到: "${trimmedLine}"`);
                        // 可能是多行文字的一部分，但狀態不對
                         throw new Error(`解析錯誤：在尋找索引時遇到非預期行: "${trimmedLine}"`);
                    }
                    break;

                case 'time':
                    if (trimmedLine.includes('-->')) {
                        currentSubtitle.time = trimmedLine;
                        state = 'text';
                    } else if (trimmedLine === '') {
                         // 忽略時間和文字間的空行
                    }
                    else {
                        throw new Error(`預期找到時間碼 (-->)，但找到: "${trimmedLine}"`);
                    }
                    break;

                case 'text':
                    // 修改開始：淨有真正空白个行正代表文字結束
                    if (line === '') { // 檢查原始行係毋係完全空白
                        state = 'index';
                    } else {
                        // 任何非完全空白行（包含淨係空白字符个行）都係文字个一部分
                        currentSubtitle.text += (currentSubtitle.text ? '\n' : '') + line;
                    }
                    // 修改結束
                    break;
            }
        }

        // 加入最後一個字幕段落
        if (currentSubtitle) {
             if (!currentSubtitle.text) currentSubtitle.text = '';
             subtitles.push(currentSubtitle);
        }

        if (subtitles.length === 0 && srtContent.trim() !== '') {
             throw new Error("檔案內容不為空，但未解析到任何有效的字幕段落。請檢查 SRT 格式。");
        }

        return subtitles;
    }

    // --- 檢查是否啟用匯出按鈕 ---
    function checkEnableExport() {
        // 必須同時載入有效的 SRT 資料和文字行才能啟用
        exportButton.disabled = !(srtData && srtData.length > 0 && textLines);
    }

    // --- 匯出處理 ---
    exportButton.addEventListener('click', () => {
        if (!srtData || !textLines) {
            alert('請先載入有效的 SRT 檔案和文字檔案。');
            return;
        }

        if (srtData.length !== textLines.length) {
            // 數量不匹配時提醒用戶，但仍允許匯出（可能只合併部分）
            const confirmMerge = confirm(
                `警告：SRT 段落數量 (${srtData.length}) 與文字行數 (${textLines.length}) 不符。\n` +
                `將只合併前 ${Math.min(srtData.length, textLines.length)} 個段落。\n\n` +
                `是否繼續匯出？`
            );
            if (!confirmMerge) {
                return;
            }
        }

        const mergedSrtContent = generateMergedSRT(srtData, textLines);
        downloadFile(mergedSrtContent, originalSrtFilename, 'application/x-subrip;charset=utf-8');
    });

    // --- 產生合併後的 SRT 內容 ---
    function generateMergedSRT(subtitles, lines) {
        let output = '';
        const mergeCount = Math.min(subtitles.length, lines.length);

        for (let i = 0; i < subtitles.length; i++) {
            output += subtitles[i].index + '\n';
            output += subtitles[i].time + '\n';

            let mergedText = subtitles[i].text; // 先取得 SRT 原本的文字

            if (i < mergeCount) { // 假使文字檔有對應个行
                const textFileLine = lines[i];
                // 只愛在文字檔个該行有實際內容 (毋係淨係空白) 个時節正處理
                if (textFileLine.trim() !== '') {
                    if (mergedText.trim() !== '') { // 假使 SRT 原本就有實際內容 (毋係淨係空白)
                        mergedText += '\n' + textFileLine; // 加到後背
                    } else { // 假使 SRT 原本係空个或者淨係空白
                        mergedText = textFileLine; // 就用文字檔个行取代
                    }
                }
                // 假使 textFileLine.trim() 係空个, mergedText (SRT 原本个文字) 就毋會變
            }
            // 假使 i >= mergeCount (文字檔行數較少), mergedText 也係維持 SRT 原本个文字

            output += mergedText + '\n\n';
        }
        return output.trim() + '\n'; // 確保結尾有換行符並移除多餘空白
    }

    // --- 檔案下載功能 ---
    function downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link); // 需要添加到 DOM 才能在 Firefox 中工作
        link.click();
        document.body.removeChild(link); // 清理
        URL.revokeObjectURL(link.href); // 釋放資源
    }
});
