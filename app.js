let player;
let subtitles = []; // Array to store subtitle objects { start: time, end: time }
let currentSubtitleIndex = -1; // Index of the subtitle block currently being marked

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
    // Find if the current time falls within any existing subtitle block
    let foundIndex = subtitles.findIndex(sub => time >= sub.start && (sub.end === undefined || time <= sub.end));

    if (foundIndex !== -1) {
        // If marking within an existing block, split it
        const existingSub = subtitles[foundIndex];
        const newSub = { start: time, end: existingSub.end };
        existingSub.end = time; // The existing block now ends at the marked time
        subtitles.splice(foundIndex + 1, 0, newSub); // Insert the new block after the existing one
        currentSubtitleIndex = foundIndex + 1; // Start marking the end of the new block
    } else {
        // If not within an existing block, create a new one or mark end of the last one
        if (currentSubtitleIndex === -1 || subtitles[currentSubtitleIndex].end !== undefined) {
            // Create a new block (marking the start time)
            subtitles.push({ start: time, end: undefined });
            currentSubtitleIndex = subtitles.length - 1;
        } else {
            // Mark the end time of the current block
            subtitles[currentSubtitleIndex].end = time;
            // Sort subtitles by start time
            subtitles.sort((a, b) => a.start - b.start);
            currentSubtitleIndex = -1; // Reset index after completing a block
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
        const start = formatTime(sub.start);
        const end = sub.end !== undefined ? formatTime(sub.end) : '...';
        listItem.textContent = `${index + 1}. ${start} --> ${end}`;
        listElement.appendChild(listItem);
    });
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