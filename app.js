let player;
let subtitles = []; // Array to store subtitle objects { start: time, end: time }
let currentSubtitleIndex = -1; // Index of the subtitle block currently being marked
let timeUpdateInterval = null; // Interval timer for syncing subtitle list

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
    if (!player || !player.getCurrentTime) {
        return; // Do nothing if player is not ready
    }

    const currentTime = player.getCurrentTime();

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
            player.seekTo(currentTime - 5, true);
            break;
        case 'ArrowRight':
            player.seekTo(currentTime + 5, true);
            break;
        case 'Tab':
            event.preventDefault(); // Prevent default tab action
            markTime(currentTime);
            break;
    }
}

// Function to mark time points
function markTime(time) {
    // 1. Check if the time falls within a COMPLETED existing block
    let splitIndex = subtitles.findIndex(sub => sub.end !== undefined && time > sub.start && time < sub.end);

    if (splitIndex !== -1) {
        // --- Split the existing block ---
        const originalSub = subtitles[splitIndex];
        const newSub = { start: time, end: originalSub.end }; // New block starts at the marked time

        originalSub.end = time; // Original block now ends at the marked time
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
                const newSub = { start: time, end: undefined }; // Create the new subtitle object
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
        const start = formatTime(sub.start);
        const end = sub.end !== undefined ? formatTime(sub.end) : '...';
        listItem.textContent = `${index + 1}. ${start} --> ${end}`;
        // Add click listener to seek video to subtitle start time
        listItem.addEventListener('click', () => {
             if (player && player.seekTo) {
                 player.seekTo(sub.start, true);
             }
        });
        listElement.appendChild(listItem);
    });
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
            srtContent += `\n`; // Add an empty line for the subtitle text (placeholder)
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