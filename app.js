let player;
let subtitles = []; // Array to store subtitle objects { start: time, end: time, text: string }
let currentSubtitleIndex = -1; // Index of the subtitle block currently being marked
let timeUpdateInterval = null; // Interval timer for syncing subtitle list
const srtFileInput = document.getElementById('srt-file-input');

// This function creates an <iframe> (and YouTube player)
// after the API code downloads.
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '400',
        width: '100%',
        videoId: '', // Will be set when loading video
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

// The API will call this function when the video player is ready.
function onPlayerReady(event) {
    console.log('YouTube player is ready');
    // You might want to load a default video or wait for user input
}

// The API calls this function when the player's state changes.
function onPlayerStateChange(event) {
    // console.log('Player state changed:', event.data);
    if (event.data == YT.PlayerState.PLAYING) {
        // Start interval when playing
        if (timeUpdateInterval) clearInterval(timeUpdateInterval); // Clear existing interval if any
        timeUpdateInterval = setInterval(syncSubtitleList, 250); // Check every 250ms
    } else {
        // Clear interval when paused, ended, buffering, etc.
        if (timeUpdateInterval) clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
        // Optionally remove active class when paused/stopped
        const activeItem = document.querySelector('#subtitle-list li.active');
        if (activeItem) {
            activeItem.classList.remove('active');
        }
    }
}

// Function to load video from URL
function loadVideo() {
    const urlInput = document.getElementById('youtube-url').value;
    const videoId = getYouTubeVideoId(urlInput);

    if (videoId) {
        if (player) {
            player.loadVideoById(videoId);
            subtitles = []; // Reset subtitles for new video
            renderSubtitleList();
            currentSubtitleIndex = -1;
            // Clear any existing sync interval
            if (timeUpdateInterval) clearInterval(timeUpdateInterval);
            timeUpdateInterval = null;
        } else {
            // If player is not yet initialized (shouldn't happen if API is ready)
            console.error('YouTube player not initialized.');
        }
    } else {
        alert('請輸入有效的 YouTube 影片網址。');
    }
}

// Helper function to extract video ID from YouTube URL
function getYouTubeVideoId(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Function to handle keyboard shortcuts
function handleKeyPress(event) {
    // Check if focus is inside an input/textarea within the subtitle list
    const activeElement = document.activeElement;
    const isEditingSubtitle = activeElement &&
                              (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') &&
                              activeElement.closest('#subtitle-list li');

    // Allow Escape key globally to potentially unfocus elements (default browser behavior)
    if (event.code === 'Escape') {
        if (isEditingSubtitle) {
             activeElement.blur(); // Explicitly blur the element on Escape
        }
        return; // Don't process Escape further here
    }

    if (!player || !player.getCurrentTime) {
        return; // Do nothing if player is not ready for other keys
    }

    const currentTime = player.getCurrentTime();

    // Only handle global shortcuts if not editing subtitles
    if (!isEditingSubtitle) {
        switch (event.code) {
            case 'Space':
                event.preventDefault(); // Prevent default spacebar action (scrolling)
                if (player.getPlayerState() === YT.PlayerState.PLAYING) {
                    player.pauseVideo();
                } else {
                    player.playVideo();
                }
                break;
            case 'ArrowLeft':
                 // Prevent default only if player control is active
                event.preventDefault();
                player.seekTo(currentTime - 5, true);
                break;
            case 'ArrowRight':
                 // Prevent default only if player control is active
                event.preventDefault();
                player.seekTo(currentTime + 5, true);
                break;
            case 'Tab':
                // Prevent default only if marking time
                event.preventDefault();
                markTime(currentTime);
                break;
        }
    }
    // If isEditingSubtitle is true, the default browser behavior for Space, Arrows, Tab
    // within the input/textarea will occur, which is what we want.
}

// Function to mark time points
function markTime(time) {
    // 1. Check if the time falls within a COMPLETED existing block
    let splitIndex = subtitles.findIndex(sub => sub.end !== undefined && time > sub.start && time < sub.end);

    if (splitIndex !== -1) {
        // --- Split the existing block ---
        const originalSub = subtitles[splitIndex];
        // Split text somewhat arbitrarily, user can edit later
        const originalText = originalSub.text || '';
        const splitPoint = Math.floor(originalText.length / 2);
        const newSub = { start: time, end: originalSub.end, text: originalText.substring(splitPoint).trim() }; // New block starts at the marked time

        originalSub.end = time; // Original block now ends at the marked time
        originalSub.text = originalText.substring(0, splitPoint).trim(); // Update original text
        subtitles.splice(splitIndex + 1, 0, newSub); // Insert the new block

        // After splitting, no block is actively being marked
        currentSubtitleIndex = -1;
        subtitles.sort((a, b) => a.start - b.start); // Sort after modification

    } else {
        // --- Mark Start or End ---
        if (currentSubtitleIndex === -1) {
            // No active block, mark a new START time
            // Avoid creating a new block if the time is exactly the end of a previous block
            const isAtEndOfPrevious = subtitles.some(sub => sub.end === time);
            if (!isAtEndOfPrevious) {
                const newSub = { start: time, end: undefined, text: '' }; // Create the new subtitle object with empty text
                subtitles.push(newSub);
                subtitles.sort((a, b) => a.start - b.start); // Sort after adding

                // --- FIX: Find the correct index of the newly added subtitle AFTER sorting ---
                currentSubtitleIndex = subtitles.findIndex(sub => sub === newSub);
                // If findIndex fails for some reason (shouldn't happen), fallback or log error
                if (currentSubtitleIndex === -1) {
                     console.error("Failed to find the newly added subtitle after sorting!");
                     // Potentially reset to avoid incorrect marking:
                     // currentSubtitleIndex = -1;
                }

            } else {
                 console.log("Cannot start a new subtitle exactly at the end of another.");
            }

        } else {
            // Active block exists, mark the END time
            const currentSub = subtitles[currentSubtitleIndex];
            if (time > currentSub.start) {
                currentSub.end = time;
                currentSubtitleIndex = -1; // Deactivate marking
                subtitles.sort((a, b) => a.start - b.start); // Sort after modification
            } else {
                // Attempting to mark end before start - ignore or handle as error
                console.warn("End time cannot be earlier than start time.");
                // Optionally, you could remove the invalid start marker:
                // subtitles.splice(currentSubtitleIndex, 1);
                // currentSubtitleIndex = -1;
            }
        }
    }

    renderSubtitleList();
}

// Function to render the subtitle list in the UI
function renderSubtitleList() {
    const listElement = document.getElementById('subtitle-list');
    listElement.innerHTML = ''; // Clear current list

    subtitles.forEach((sub, index) => {
        const listItem = document.createElement('li');
        listItem.dataset.index = index; // Add data-index attribute

        const timeContainer = document.createElement('div');
        timeContainer.classList.add('time-container');

        // Start Time Input
        const startInput = document.createElement('input');
        startInput.type = 'text';
        startInput.value = formatTime(sub.start);
        startInput.classList.add('time-input');
        startInput.addEventListener('change', (e) => updateSubtitleTime(index, 'start', e.target.value));
        startInput.addEventListener('click', (e) => { // Seek on click
            e.stopPropagation(); // Prevent li click
            if (player && player.seekTo) {
                player.seekTo(sub.start, true);
            }
        });

        // Arrow Span
        const arrowSpan = document.createElement('span');
        arrowSpan.textContent = ' --> ';
        arrowSpan.classList.add('time-arrow');

        // End Time Input
        const endInput = document.createElement('input');
        endInput.type = 'text';
        endInput.value = sub.end !== undefined ? formatTime(sub.end) : '...';
        endInput.classList.add('time-input');
        if (sub.end === undefined) {
            endInput.disabled = true; // Disable if end time not set
        }
        endInput.addEventListener('change', (e) => updateSubtitleTime(index, 'end', e.target.value));
        endInput.addEventListener('click', (e) => { // Seek on click
            e.stopPropagation(); // Prevent li click
            if (player && player.seekTo && sub.end !== undefined) {
                player.seekTo(sub.end, true);
            }
        });

        timeContainer.appendChild(startInput);
        timeContainer.appendChild(arrowSpan);
        timeContainer.appendChild(endInput);

        // Text Area
        const textArea = document.createElement('textarea');
        textArea.value = sub.text || ''; // Handle cases where text might be undefined initially
        textArea.rows = 2; // Adjust as needed
        textArea.classList.add('subtitle-text-input');
        textArea.addEventListener('change', (e) => updateSubtitleText(index, e.target.value));

        // Delete Button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✕';
        deleteBtn.classList.add('delete-btn');
        deleteBtn.title = '刪除此字幕'; // Tooltip
        deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent li click event from firing
            deleteSubtitle(index);
        });

        // Create a container for time and text
        const contentContainer = document.createElement('div');
        contentContainer.style.display = 'flex'; // Use flex for vertical layout
        contentContainer.style.flexDirection = 'column';
        contentContainer.style.flexGrow = '1'; // Allow this container to take space
        contentContainer.style.gap = '5px'; // Add gap between time and text

        contentContainer.appendChild(timeContainer);
        contentContainer.appendChild(textArea);

        // Assemble List Item
        listItem.appendChild(document.createTextNode(`${index + 1}. `)); // Add number
        listItem.appendChild(contentContainer); // Add the container
        listItem.appendChild(deleteBtn);

        listElement.appendChild(listItem);
    });
}

// --- NEW: Function to update subtitle time from input ---
function updateSubtitleTime(index, type, value) {
    try {
        const seconds = timeStringToSeconds(value);
        if (isNaN(seconds)) throw new Error("Invalid time format");

        if (type === 'start') {
            // Basic validation: start time cannot be after end time
            if (subtitles[index].end !== undefined && seconds >= subtitles[index].end) {
                alert('開始時間不能晚於或等於結束時間。');
                renderSubtitleList(); // Re-render to reset input
                return;
            }
            subtitles[index].start = seconds;
        } else if (type === 'end') {
            // Basic validation: end time cannot be before start time
            if (seconds <= subtitles[index].start) {
                alert('結束時間不能早於或等於開始時間。');
                renderSubtitleList(); // Re-render to reset input
                return;
            }
            subtitles[index].end = seconds;
        }
        // Optional: Re-sort if times are changed significantly? For now, assume minor edits.
        // subtitles.sort((a, b) => a.start - b.start);
        // renderSubtitleList(); // Re-render might be needed if sorting happens
    } catch (error) {
        console.error("Error updating time:", error);
        alert(`無效的時間格式: ${value}\n請使用 HH:MM:SS,ms 格式。`);
        renderSubtitleList(); // Re-render to reset input to original value
    }
}

// --- NEW: Function to update subtitle text from textarea ---
function updateSubtitleText(index, text) {
    if (index >= 0 && index < subtitles.length) {
        subtitles[index].text = text;
    }
}

// Function to delete a subtitle entry
function deleteSubtitle(indexToDelete) {
    if (indexToDelete < 0 || indexToDelete >= subtitles.length) {
        console.error("Invalid index for deletion:", indexToDelete);
        return;
    }

    // If deleting the currently active marking block, reset the index
    if (currentSubtitleIndex === indexToDelete) {
        currentSubtitleIndex = -1;
    } else if (currentSubtitleIndex > indexToDelete) {
        // If deleting an item before the active one, adjust the active index
        currentSubtitleIndex--;
    }

    subtitles.splice(indexToDelete, 1); // Remove the subtitle
    renderSubtitleList(); // Re-render the list
}

// Function to sync subtitle list with video time
function syncSubtitleList() {
    if (!player || typeof player.getCurrentTime !== 'function' || subtitles.length === 0) {
        return;
    }

    const currentTime = player.getCurrentTime();
    let activeIndex = -1;

    // Find the index of the subtitle that matches the current time
    for (let i = 0; i < subtitles.length; i++) {
        // Check if the subtitle block is complete and current time falls within it
        if (subtitles[i].end !== undefined && currentTime >= subtitles[i].start && currentTime < subtitles[i].end) {
            activeIndex = i;
            break;
        }
        // Also consider the case where the user is marking the end time
        if (i === currentSubtitleIndex && subtitles[i].end === undefined && currentTime >= subtitles[i].start) {
             activeIndex = i;
             break;
        }
    }

    // Remove active class from previously active item
    const currentlyActive = document.querySelector('#subtitle-list li.active');
    if (currentlyActive) {
        currentlyActive.classList.remove('active');
    }

    // Add active class to the current item and scroll into view
    if (activeIndex !== -1) {
        const activeItem = document.querySelector(`#subtitle-list li[data-index="${activeIndex}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            // Scroll the item into view if it's not already visible
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// Helper function to format time in SRT format (HH:MM:SS,ms)
function formatTime(seconds) {
    const date = new Date(null);
    date.setSeconds(seconds);
    const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
    const timeString = date.toISOString().substr(11, 8); // HH:MM:SS
    return `${timeString},${ms.toString().padStart(3, '0')}`;
}

// Function to export subtitles as SRT file
function exportSRT() {
    if (subtitles.length === 0) {
        alert('沒有字幕時間點可以匯出。');
        return;
    }

    let srtContent = '';
    subtitles.forEach((sub, index) => {
        if (sub.start !== undefined && sub.end !== undefined) {
            srtContent += `${index + 1}\n`;
            srtContent += `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n`;
            // Ensure text is defined and handle potential multi-line text from textarea
            const textContent = sub.text ? sub.text.replace(/\r\n/g, '\n') : ''; // Normalize newlines
            srtContent += `${textContent}\n\n`; // Add text and an extra newline
        }
    });

    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subtitles.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Add event listeners
document.getElementById('load-video').addEventListener('click', loadVideo);
document.getElementById('export-srt').addEventListener('click', exportSRT);
document.addEventListener('keydown', handleKeyPress);
srtFileInput.addEventListener('change', handleFileSelect); // Add listener for file input

// --- NEW: Function to handle file selection ---
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        try {
            subtitles = parseSRT(content);
            subtitles.sort((a, b) => a.start - b.start); // Sort parsed subtitles
            currentSubtitleIndex = -1; // Reset marking index
            renderSubtitleList();
            // Optionally load the video if a URL is present?
            // Or clear the video? For now, just load subtitles.
            if (player) {
                 // Reset player state if needed
                 // player.stopVideo();
            }
            alert(`${file.name} 已成功載入 ${subtitles.length} 條字幕。`);
        } catch (error) {
            console.error("Error parsing SRT file:", error);
            alert(`讀取 SRT 檔案時發生錯誤: ${error.message}`);
            subtitles = []; // Clear subtitles on error
            renderSubtitleList();
        } finally {
             // Reset file input so the same file can be loaded again after modification
             event.target.value = null;
        }
    };
    reader.onerror = function(e) {
         console.error("Error reading file:", e);
         alert("讀取檔案時發生錯誤。");
    };
    reader.readAsText(file);
}


// --- NEW: Function to parse SRT content ---
function parseSRT(content) {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const subs = [];
    let i = 0;
    while (i < lines.length) {
        // 1. Index line (optional, we'll re-index anyway)
        const indexLine = lines[i].trim();
        if (!indexLine) { // Skip empty lines between blocks
            i++;
            continue;
        }
        // Basic check if it looks like a number
        if (!/^\d+$/.test(indexLine)) {
             // Tolerate missing index lines if the next line looks like a timecode
             if (!lines[i+1] || !lines[i+1].includes('-->')) {
                console.warn(`Skipping invalid SRT block starting near line ${i + 1}. Expected index or timecode.`);
                // Skip forward until a potential new block start (empty line or number)
                while (i < lines.length && lines[i].trim() && !/^\d+$/.test(lines[i].trim())) {
                    i++;
                }
                continue;
             }
             // If next line is timecode, assume index was missing
        } else {
            i++; // Move to next line if index was present
        }


        // 2. Timecode line
        const timeLine = lines[i]?.trim();
        if (!timeLine || !timeLine.includes('-->')) {
            console.warn(`Skipping invalid SRT block near line ${i + 1}. Expected timecode.`);
             // Skip forward until a potential new block start
             while (i < lines.length && lines[i].trim()) {
                 i++;
             }
            continue;
        }
        const timeParts = timeLine.split(' --> ');
        if (timeParts.length !== 2) {
             console.warn(`Skipping invalid SRT block near line ${i + 1}. Malformed timecode.`);
              // Skip forward until a potential new block start
             while (i < lines.length && lines[i].trim()) {
                 i++;
             }
             continue;
        }

        let startSeconds, endSeconds;
        try {
            startSeconds = timeStringToSeconds(timeParts[0].trim());
            endSeconds = timeStringToSeconds(timeParts[1].trim());
            if (isNaN(startSeconds) || isNaN(endSeconds) || startSeconds >= endSeconds) {
                 throw new Error("Invalid time values or order");
            }
        } catch (e) {
            console.warn(`Skipping invalid SRT block near line ${i + 1}. ${e.message}`);
             // Skip forward until a potential new block start
             while (i < lines.length && lines[i].trim()) {
                 i++;
             }
            continue;
        }
        i++;

        // 3. Text lines
        let textLines = [];
        while (i < lines.length && lines[i]?.trim()) {
            textLines.push(lines[i].trim());
            i++;
        }

        subs.push({
            start: startSeconds,
            end: endSeconds,
            text: textLines.join('\n')
        });

        // Skip empty line separating blocks (if any)
        if (i < lines.length && !lines[i]?.trim()) {
            i++;
        }
    }
    return subs;
}

// --- NEW: Function to convert SRT time string to seconds ---
function timeStringToSeconds(timeString) {
    const parts = timeString.split(/[:,]/);
    if (parts.length !== 4) {
        throw new Error(`Invalid time format: "${timeString}"`);
    }
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    const milliseconds = parseInt(parts[3], 10);

    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
        throw new Error(`Invalid time component in "${timeString}"`);
    }

    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

