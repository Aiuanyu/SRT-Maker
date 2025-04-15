const app = Vue.createApp({
    data() {
        return {
            youtubeUrl: '',
            videoId: null,
            player: null, // YouTube Player object
            playerReady: false,
            subtitles: [], // Array of { id: number, start: float, end: float | null, text: string }
            currentTime: 0,
            currentTimeInterval: null, // To update time display
        };
    },
    computed: {
        // Sort subtitles by start time for display
        sortedSubtitles() {
            // Use slice() to create a shallow copy before sorting
            return this.subtitles.slice().sort((a, b) => a.start - b.start);
        }
    },
    methods: {
        // --- YouTube Player Setup ---
        initializeYouTubeAPI() {
            // This global function is called by the YouTube IFrame Player API
            window.onYouTubeIframeAPIReady = () => {
                console.log("YouTube API Ready");
                // If a video ID was already extracted before API was ready, load it now
                if (this.videoId) {
                    this.createPlayer(this.videoId);
                }
            };
        },
        createPlayer(videoId) {
            console.log("Creating player for video ID:", videoId);
            // Ensure container is clean if re-loading
            if (this.player) {
                this.player.destroy();
            }
             // Clear previous interval if exists
            if (this.currentTimeInterval) {
                clearInterval(this.currentTimeInterval);
                this.currentTimeInterval = null;
            }
            this.player = new YT.Player('youtube-player', {
                height: '360', // These might be overridden by CSS aspect ratio
                width: '640',
                videoId: videoId,
                playerVars: {
                    'playsinline': 1 // Important for mobile playback
                },
                events: {
                    'onReady': this.onPlayerReady,
                    'onStateChange': this.onPlayerStateChange
                }
            });
        },
        onPlayerReady(event) {
            console.log("Player Ready");
            this.playerReady = true;
            // Start periodically updating the displayed time
            this.currentTimeInterval = setInterval(() => {
                if (this.player && typeof this.player.getCurrentTime === 'function') {
                    this.currentTime = this.player.getCurrentTime();
                }
            }, 200); // Update every 200ms
        },
        onPlayerStateChange(event) {
            // console.log("Player State Change:", event.data);
            // You could add logic here based on player state (playing, paused, ended)
            if (event.data === YT.PlayerState.ENDED) {
                 console.log("Video Ended");
            }
             if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                // Maybe ensure final time update when paused/ended
                this.currentTime = this.player.getCurrentTime();
            }
        },
        loadVideo() {
            const extractedId = this.extractVideoId(this.youtubeUrl);
            if (extractedId) {
                this.videoId = extractedId;
                this.subtitles = []; // Reset subtitles when loading new video
                this.currentTime = 0;
                if (window.YT && window.YT.Player) { // Check if API is loaded
                    if (this.player && this.playerReady) {
                        console.log("Loading new video:", this.videoId);
                        this.player.loadVideoById(this.videoId);
                    } else {
                         console.log("API ready, creating player");
                        this.createPlayer(this.videoId); // Create player if it doesn't exist yet
                    }
                } else {
                    console.log("YouTube API not ready yet, will create player when it is.");
                     // The onYouTubeIframeAPIReady function will handle creation
                }
            } else {
                alert('無效的 YouTube 網址格式');
            }
        },
        extractVideoId(url) {
             // Regular expression to find YouTube video ID from various URL formats
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(regExp);
            if (match && match[2].length === 11) {
                return match[2];
            } else {
                return null; // Invalid URL or no video ID found
            }
        },

        // --- Playback Control ---
        togglePlayPause() {
            if (!this.playerReady) return;
            const state = this.player.getPlayerState();
            if (state === YT.PlayerState.PLAYING) {
                this.player.pauseVideo();
            } else {
                this.player.playVideo();
            }
        },
        seekRelative(seconds) {
            if (!this.playerReady) return;
            const currentTime = this.player.getCurrentTime();
            this.player.seekTo(currentTime + seconds, true);
             // Immediately update displayed time after seeking
             this.currentTime = this.player.getCurrentTime() + seconds;
             if (this.currentTime < 0) this.currentTime = 0;
        },

        // --- Subtitle Management ---
        markTimestamp() {
            if (!this.playerReady) return;
            const currentTime = this.player.getCurrentTime();
            console.log(`Tab pressed at: ${currentTime}`);

            // 1. Check if we need to complete the last subtitle
            const lastSub = this.subtitles.length > 0 ? this.subtitles[this.subtitles.length - 1] : null;
            if (lastSub && lastSub.end === null) {
                if (currentTime > lastSub.start) {
                    lastSub.end = currentTime;
                    console.log(`Marked end for sub ${lastSub.id} at ${currentTime}`);
                    this.sortSubtitles(); // Keep sorted after modification
                    return; // Task done
                } else {
                    // Trying to mark end before start, ignore or alert
                    console.warn("Cannot mark end time before start time.");
                    return;
                }
            }

            // 2. Check if the current time overlaps/splits an existing subtitle
            let splitOccurred = false;
            for (let i = 0; i < this.subtitles.length; i++) {
                const sub = this.subtitles[i];
                // Ensure end is not null before checking overlap
                if (sub.end !== null && currentTime > sub.start && currentTime < sub.end) {
                    console.log(`Splitting sub ${sub.id} at ${currentTime}`);
                    const originalEnd = sub.end;
                    const originalText = sub.text; // Decide how to handle text

                    // Modify the existing subtitle
                    sub.end = currentTime;
                    // Potentially clear or keep original text? Let's keep it for now.

                    // Create the new subtitle block
                    const newSub = {
                        id: Date.now(), // Simple unique ID
                        start: currentTime,
                        end: originalEnd,
                        text: "" // New block starts with empty text
                    };
                    // Insert the new subtitle right after the split one
                    this.subtitles.splice(i + 1, 0, newSub);
                    splitOccurred = true;
                    break; // Stop checking after first split
                }
            }

            // 3. If no split occurred and no subtitle was completed, start a new one
            if (!splitOccurred && !(lastSub && lastSub.end === null)) {
                 // Additional check: Don't allow marking start if it's before the end of the previous *complete* subtitle
                 const lastCompleteSub = this.sortedSubtitles.slice().reverse().find(s => s.end !== null);
                 if(lastCompleteSub && currentTime <= lastCompleteSub.end) {
                     alert(`無法在 上一個字幕結束時間 (${this.formatTime(lastCompleteSub.end)}) 之前 標記新的開始時間。`);
                     return;
                 }

                console.log(`Marking new start at ${currentTime}`);
                const newSub = {
                    id: Date.now(),
                    start: currentTime,
                    end: null, // Mark as incomplete
                    text: ""
                };
                this.subtitles.push(newSub);
            }

            this.sortSubtitles(); // Ensure list is always sorted
        },

        sortSubtitles() {
             this.subtitles.sort((a, b) => a.start - b.start);
        },

        deleteSubtitle(id) {
            this.subtitles = this.subtitles.filter(sub => sub.id !== id);
            // No need to re-sort if just deleting
        },

        // --- SRT Export ---
        formatTime(totalSeconds) {
            if (totalSeconds === null || typeof totalSeconds === 'undefined') return '...';
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = Math.floor(totalSeconds % 60);
            const milliseconds = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);

            // Pad with leading zeros
            const hh = String(hours).padStart(2, '0');
            const mm = String(minutes).padStart(2, '0');
            const ss = String(seconds).padStart(2, '0');
            const ms = String(milliseconds).padStart(3, '0');

            return `${hh}:${mm}:${ss},${ms}`; // SRT format uses comma
        },

        exportSRT() {
            const completeSubtitles = this.sortedSubtitles.filter(sub => sub.end !== null);

            if (completeSubtitles.length === 0) {
                alert("沒有可匯出的完整字幕。");
                return;
            }

            let srtContent = "";
            completeSubtitles.forEach((sub, index) => {
                const startTime = this.formatTime(sub.start);
                const endTime = this.formatTime(sub.end);
                // SRT index starts from 1
                srtContent += `${index + 1}\n`;
                srtContent += `${startTime} --> ${endTime}\n`;
                srtContent += `${sub.text || ''}\n\n`; // Add empty line even if text is empty
            });

            // Create a Blob and download link
            const blob = new Blob([srtContent], { type: 'text/srt;charset=utf-8;' });
            const link = document.createElement("a");

            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "subtitles.srt");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url); // Clean up
        },

        // --- Keyboard Event Handling ---
        handleKeyDown(event) {
            // Don't capture keys if typing in input/textarea
             if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                 // Allow Tab default behavior within textareas
                 if(event.key === 'Tab' && event.target.tagName === 'TEXTAREA') {
                     return;
                 }
                 // Allow arrows within input/textarea
                 if(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                     return;
                 }
                 // Allow space within input/textarea
                 if (event.code === 'Space' && event.target.tagName === 'TEXTAREA') {
                     return;
                 }
             }

            // If player isn't ready, only allow loading video? Maybe better to just ignore other keys.
            if (!this.playerReady && event.key !== 'Enter' /* Allow Enter maybe? */) {
                // Only handle keys if player is usable
                 // Let's block keys if player not ready, except maybe within URL input
                 if (event.target.id !== 'youtube-url') {
                      console.log("Player not ready, ignoring keypress:", event.key);
                      // event.preventDefault(); // Careful with preventing default everywhere
                      return;
                 }
            }


            switch (event.code) {
                case 'Space':
                    event.preventDefault(); // Prevent page scrolling
                    this.togglePlayPause();
                    break;
                case 'ArrowLeft':
                     event.preventDefault(); // Prevent default browser behavior
                    this.seekRelative(-5);
                    break;
                case 'ArrowRight':
                     event.preventDefault(); // Prevent default browser behavior
                    this.seekRelative(5);
                    break;
                case 'Tab':
                    // Prevent default tab behavior (changing focus)
                    // UNLESS the focus is inside a textarea (handled above)
                    if (event.target.tagName !== 'TEXTAREA') {
                       event.preventDefault();
                    }
                    this.markTimestamp();
                    break;
            }
        }
    },
    mounted() {
        // Initialize YouTube API loading as soon as Vue app is mounted
        this.initializeYouTubeAPI();
        // Add global keyboard listener
        window.addEventListener('keydown', this.handleKeyDown);
    },
    beforeUnmount() {
        // Clean up global keyboard listener
        window.removeEventListener('keydown', this.handleKeyDown);
        // Clean up player and interval
        if (this.player) {
            this.player.destroy();
        }
        if (this.currentTimeInterval) {
            clearInterval(this.currentTimeInterval);
        }
        // It's good practice to nullify references
        this.player = null;
        this.currentTimeInterval = null;
        // Remove the global function reference if safe (might affect other scripts if any)
        // window.onYouTubeIframeAPIReady = null;
    }
});

// Mount the Vue app to the #app element
app.mount('#app');