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
      activeSubtitleId: null, // --- 功能 2: 目前作用中字幕的 ID ---
      // --- 功能 3: 時間軸編輯 ---
      editingSubtitleId: null,
      timelineRange: { min: 0, max: 0 },
      draggingHandle: null, // 'start' or 'end'
      dragStartX: 0,
      clearTimelineTimeout: null, // For debouncing blur
      videoDuration: 0, // Store video duration
      nextSubtitleIdCounter: 1, // --- 新增: 用於生成字幕 ID 的計數器 ---
      // --- 結束 功能 3 ---
    };
  },
  computed: {
    // Sort subtitles by start time for display
    sortedSubtitles() {
      // Use slice() to create a shallow copy before sorting
      return this.subtitles.slice().sort((a, b) => a.start - b.start);
    },
    // --- 功能 3: 計算屬性 ---
    editingSubtitle() {
      if (this.editingSubtitleId === null) return null;
      return this.subtitles.find((sub) => sub.id === this.editingSubtitleId);
    },
    timelineSegmentStyle() {
      if (
        !this.editingSubtitle ||
        this.timelineRange.max <= this.timelineRange.min
      ) {
        return {
          left: '0%',
          width: '0%',
          startLabelLeft: '0%',
          endLabelLeft: '0%',
        };
      }

      const rangeDuration = this.timelineRange.max - this.timelineRange.min;
      const startOffset = this.editingSubtitle.start - this.timelineRange.min;
      const endOffset =
        this.editingSubtitle.end !== null
          ? this.editingSubtitle.end - this.timelineRange.min
          : rangeDuration; // Handle incomplete subs visually

      const startPercent = (startOffset / rangeDuration) * 100;
      const endPercent = (endOffset / rangeDuration) * 100;
      const widthPercent = endPercent - startPercent;

      // Ensure values are within 0-100%
      const clampedStartPercent = Math.max(0, Math.min(100, startPercent));
      const clampedWidthPercent = Math.max(
        0,
        Math.min(100 - clampedStartPercent, widthPercent)
      );

      // Calculate label positions relative to the timeline bar
      const startLabelLeftPercent = clampedStartPercent;
      const endLabelLeftPercent = clampedStartPercent + clampedWidthPercent;

      return {
        left: `${clampedStartPercent}%`,
        width: `${clampedWidthPercent}%`,
        // Pass label positions via style for absolute positioning in CSS
        '--start-label-left': `${startLabelLeftPercent}%`,
        '--end-label-left': `${endLabelLeftPercent}%`,
      };
    },
    // --- 結束 功能 3 ---
  },
  methods: {
    // --- YouTube Player Setup ---
    initializeYouTubeAPI() {
      // This global function is called by the YouTube IFrame Player API
      window.onYouTubeIframeAPIReady = () => {
        console.log('YouTube API Ready');
        // If a video ID was already extracted before API was ready, load it now
        if (this.videoId) {
          this.createPlayer(this.videoId);
        }
      };
    },
    createPlayer(videoId) {
      console.log('Creating player for video ID:', videoId);
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
          playsinline: 1, // Important for mobile playback
        },
        events: {
          onReady: this.onPlayerReady,
          onStateChange: this.onPlayerStateChange,
        },
      });
    },
    onPlayerReady(event) {
      console.log('Player Ready');
      this.playerReady = true;
      // --- 功能 3: 獲取影片總長度 ---
      if (this.player && typeof this.player.getDuration === 'function') {
        this.videoDuration = this.player.getDuration();
        console.log('Video duration:', this.videoDuration);
      }
      // --- 結束 功能 3 ---
      // Start periodically updating the displayed time and active subtitle
      this.currentTimeInterval = setInterval(() => {
        if (this.player && typeof this.player.getCurrentTime === 'function') {
          const now = this.player.getCurrentTime();
          this.currentTime = now;

          // --- 功能 2: 更新作用中字幕 ID ---
          let currentActiveId = null;
          // Find the first subtitle that matches the current time
          for (const sub of this.sortedSubtitles) {
            // Ensure end time is valid for comparison
            if (sub.end !== null && now >= sub.start && now < sub.end) {
              currentActiveId = sub.id;
              break; // Found the active subtitle
            }
          }
          // Update only if the active subtitle has changed
          if (this.activeSubtitleId !== currentActiveId) {
            this.activeSubtitleId = currentActiveId;
          }
          // --- 結束 功能 2 ---
        }
      }, 200); // Update every 200ms
    },
    onPlayerStateChange(event) {
      // console.log("Player State Change:", event.data);
      // You could add logic here based on player state (playing, paused, ended)
      if (event.data === YT.PlayerState.ENDED) {
        console.log('Video Ended');
      }
      if (
        event.data === YT.PlayerState.PAUSED ||
        event.data === YT.PlayerState.ENDED
      ) {
        // Maybe ensure final time update when paused/ended
        this.currentTime = this.player.getCurrentTime();
      }
    },
    loadVideo() {
      // --- 功能 1: 載入新影片前警告 ---
      if (this.subtitles.length > 0) {
        const confirmLoad = confirm(
          '警告：目前的字幕尚未匯出。\n\n若要載入新影片並清除現有字幕，請按「確定」。\n若要先匯出目前的字幕，請按「取消」。'
        );
        if (!confirmLoad) {
          return; // 使用者取消，停止載入
        }
      }
      // --- 結束 功能 1 ---

      const extractedId = this.extractVideoId(this.youtubeUrl);
      if (extractedId) {
        this.videoId = extractedId;
        this.subtitles = []; // Reset subtitles when loading new video
        this.currentTime = 0;
        this.activeSubtitleId = null; // Reset active subtitle
        // --- 功能 3: 清除時間軸 ---
        this.editingSubtitleId = null;
        this.videoDuration = 0; // Reset duration until player is ready
        // --- 結束 功能 3 ---
        if (window.YT && window.YT.Player) {
          // Check if API is loaded
          if (this.player && this.playerReady) {
            console.log('Loading new video:', this.videoId);
            this.player.loadVideoById(this.videoId);
          } else {
            console.log('API ready, creating player');
            this.createPlayer(this.videoId); // Create player if it doesn't exist yet
          }
        } else {
          console.log(
            'YouTube API not ready yet, will create player when it is.'
          );
          // The onYouTubeIframeAPIReady function will handle creation
        }
      } else {
        alert('無效的 YouTube 網址格式');
      }
    },
    extractVideoId(url) {
      // Regular expression to find YouTube video ID from various URL formats
      const regExp =
        /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
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
      const lastSub =
        this.subtitles.length > 0
          ? this.subtitles[this.subtitles.length - 1]
          : null;
      if (lastSub && lastSub.end === null) {
        if (currentTime > lastSub.start) {
          lastSub.end = currentTime;
          console.log(`Marked end for sub ${lastSub.id} at ${currentTime}`);
          // --- 修正 TypeError: 使用 nextTick 確保更新後再排序 ---
          this.$nextTick(() => {
            this.sortSubtitles(); // Keep sorted after modification
          });
          // --- 結束修正 ---
          return; // Task done
        } else {
          // Trying to mark end before start, ignore or alert
          console.warn('Cannot mark end time before start time.');
          return;
        }
      }

      // 2. Check if the current time overlaps/splits an existing subtitle
      let splitOccurred = false;
      for (let i = 0; i < this.subtitles.length; i++) {
        const sub = this.subtitles[i];
        // Ensure end is not null before checking overlap
        if (
          sub.end !== null &&
          currentTime > sub.start &&
          currentTime < sub.end
        ) {
          console.log(`Splitting sub ${sub.id} at ${currentTime}`);
          const originalEnd = sub.end;
          const originalText = sub.text; // Decide how to handle text

          // Modify the existing subtitle
          sub.end = currentTime;
          // Potentially clear or keep original text? Let's keep it for now.

          // Create the new subtitle block
          const newSub = {
            id: 'sub_' + this.nextSubtitleIdCounter++, // --- 改用計數器生成 ID ---
            start: currentTime,
            end: originalEnd,
            text: '', // New block starts with empty text
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
        const lastCompleteSub = this.sortedSubtitles
          .slice()
          .reverse()
          .find((s) => s.end !== null);
        if (lastCompleteSub && currentTime <= lastCompleteSub.end) {
          alert(
            `無法在 上一個字幕結束時間 (${this.formatTime(
              lastCompleteSub.end
            )}) 之前 標記新的開始時間。`
          );
          return;
        }

        console.log(`Marking new start at ${currentTime}`);
        const newSub = {
          id: 'sub_' + this.nextSubtitleIdCounter++, // --- 改用計數器生成 ID ---
          start: currentTime,
          end: null, // Mark as incomplete
          text: '',
        };
        this.subtitles.push(newSub);
      }

      this.sortSubtitles(); // Ensure list is always sorted
      // --- 功能 3: 標記時間戳後清除時間軸 (簡化處理) ---
      this.clearTimelineEdit(); // Use the method to handle potential debounce
      // --- 結束 功能 3 ---
    },

    sortSubtitles() {
      this.subtitles.sort((a, b) => a.start - b.start);
    },

    deleteSubtitle(id) {
      // --- 功能 3: 如果刪除的是正在編輯的字幕，清除時間軸 ---
      if (this.editingSubtitleId === id) {
        this.clearTimelineEdit(); // Use the method
      }
      // --- 結束 功能 3 ---
      this.subtitles = this.subtitles.filter((sub) => sub.id !== id);
      // No need to re-sort if just deleting
    },

    // --- SRT Export ---
    formatTime(totalSeconds) {
      if (totalSeconds === null || typeof totalSeconds === 'undefined')
        return '...';
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const milliseconds = Math.floor(
        (totalSeconds - Math.floor(totalSeconds)) * 1000
      );

      // Pad with leading zeros
      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');
      const ms = String(milliseconds).padStart(3, '0');

      return `${hh}:${mm}:${ss},${ms}`; // SRT format uses comma
    },

    exportSRT() {
      const completeSubtitles = this.sortedSubtitles.filter(
        (sub) => sub.end !== null
      );

      if (completeSubtitles.length === 0) {
        alert('沒有可匯出的完整字幕。');
        return;
      }

      let srtContent = '';
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
      const link = document.createElement('a');

      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'subtitles.srt');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url); // Clean up
    },

    // --- Keyboard Event Handling ---
    handleKeyDown(event) {
      // Don't capture keys if typing in input/textarea
      if (
        event.target.tagName === 'INPUT' ||
        event.target.tagName === 'TEXTAREA'
      ) {
        // Allow Tab default behavior within textareas
        if (event.key === 'Tab' && event.target.tagName === 'TEXTAREA') {
          return;
        }
        // Allow arrows within input/textarea
        if (
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
            event.key
          )
        ) {
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
          console.log('Player not ready, ignoring keypress:', event.key);
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
    },

    // --- 功能 3: 時間軸編輯方法 ---
    selectSubtitleForEdit(id) {
      // Clear any pending blur timeout
      if (this.clearTimelineTimeout) {
        clearTimeout(this.clearTimelineTimeout);
        this.clearTimelineTimeout = null;
      }

      const sub = this.subtitles.find((s) => s.id === id);
      if (sub) {
        this.editingSubtitleId = id;
        const buffer = 15; // 15 seconds buffer
        const minTime = Math.max(0, sub.start - buffer);
        // Use video duration if available, otherwise estimate based on end time
        const maxEndTime = sub.end !== null ? sub.end : sub.start + 5; // Estimate 5s if no end
        const maxTime =
          this.videoDuration > 0
            ? Math.min(this.videoDuration, maxEndTime + buffer)
            : maxEndTime + buffer;

        this.timelineRange = {
          min: minTime,
          max: maxTime,
        };
        console.log(
          `Editing subtitle ${id}, timeline range: ${minTime.toFixed(
            2
          )} - ${maxTime.toFixed(2)}`
        );
      }
    },
    clearTimelineEdit() {
      // Only clear if not currently dragging
      if (!this.draggingHandle) {
        this.editingSubtitleId = null;
        this.timelineRange = { min: 0, max: 0 };
        console.log('Timeline edit cleared');
      }
    },
    clearTimelineEditDebounced() {
      // Debounce clearing to allow clicks on handles/timeline
      if (this.clearTimelineTimeout) {
        clearTimeout(this.clearTimelineTimeout);
      }
      this.clearTimelineTimeout = setTimeout(() => {
        this.clearTimelineEdit();
        this.clearTimelineTimeout = null;
      }, 300); // 300ms delay
    },
    handleTimelineDragStart(event, handleType) {
      if (!this.editingSubtitle) return;
      // Prevent blur when clicking handle
      if (this.clearTimelineTimeout) {
        clearTimeout(this.clearTimelineTimeout);
        this.clearTimelineTimeout = null;
      }

      this.draggingHandle = handleType;
      this.dragStartX = event.clientX;
      document.addEventListener('mousemove', this.handleTimelineDragMove);
      document.addEventListener('mouseup', this.handleTimelineDragEnd);
      event.preventDefault(); // Prevent text selection
      event.stopPropagation(); // Prevent triggering other events
      console.log(`Drag start: ${handleType}`);
    },
    handleTimelineDragMove(event) {
      if (!this.draggingHandle || !this.editingSubtitle) return;

      const timelineElement = document.querySelector(
        '#timeline-editor .timeline-bar'
      );
      if (!timelineElement) return;

      const timelineRect = timelineElement.getBoundingClientRect();
      const timelineWidth = timelineRect.width;
      const rangeDuration = this.timelineRange.max - this.timelineRange.min;

      // Calculate movement in pixels and corresponding time change
      const deltaX = event.clientX - this.dragStartX;
      const deltaTime = (deltaX / timelineWidth) * rangeDuration;

      // Calculate the potential new time
      let newTime;
      if (this.draggingHandle === 'start') {
        newTime = this.editingSubtitle.start + deltaTime;
        // Clamp time: >= 0, >= range.min, < current end time
        newTime = Math.max(0, this.timelineRange.min, newTime);
        if (this.editingSubtitle.end !== null) {
          newTime = Math.min(newTime, this.editingSubtitle.end - 0.01); // Ensure start < end
        }
      } else {
        // dragging 'end'
        if (this.editingSubtitle.end === null) return; // Cannot drag end if not set
        newTime = this.editingSubtitle.end + deltaTime;
        // Clamp time: > current start time, <= range.max, <= videoDuration
        newTime = Math.max(newTime, this.editingSubtitle.start + 0.01); // Ensure end > start
        newTime = Math.min(newTime, this.timelineRange.max);
        if (this.videoDuration > 0) {
          newTime = Math.min(newTime, this.videoDuration);
        }
      }

      // Update the subtitle time (Vue reactivity handles the UI)
      if (this.draggingHandle === 'start') {
        this.editingSubtitle.start = newTime;
      } else {
        this.editingSubtitle.end = newTime;
      }

      // Update dragStartX for the next move event to calculate relative movement
      this.dragStartX = event.clientX;

      // Optional: Update timeline range dynamically if handle goes near edge? (More complex)
      // For now, keep the initial range.

      // Update the displayed current time to match the handle being dragged
      this.currentTime = newTime;
      // Seek player to the new time for immediate feedback
      if (this.playerReady) {
        this.player.seekTo(newTime, true);
      }
    },
    handleTimelineDragEnd(event) {
      if (!this.draggingHandle) return;
      console.log(`Drag end: ${this.draggingHandle}`);
      this.draggingHandle = null;
      document.removeEventListener('mousemove', this.handleTimelineDragMove);
      document.removeEventListener('mouseup', this.handleTimelineDragEnd);
      this.sortSubtitles(); // Re-sort in case times changed order
      // Re-focus the textarea after dragging? Maybe not necessary.
      // Trigger the debounced clear in case focus was lost during drag
      this.clearTimelineEditDebounced();
    },
    getVideoDuration() {
      if (this.playerReady && typeof this.player.getDuration === 'function') {
        return this.player.getDuration();
      }
      return 0;
    },
    // --- 結束 功能 3 ---
  },
  watch: {
    // --- 功能 2: 監聽 activeSubtitleId 變化並捲動 ---
    activeSubtitleId(newId, oldId) {
      if (newId !== null) {
        this.$nextTick(() => {
          const listElement = document.getElementById('subtitle-list');
          // --- 修正 DOMException: 使用帶前綴的 ID ---
          const activeElement = document.getElementById(newId); // ID 已經包含 'sub_' 前綴
          // --- 結束修正 ---
          if (activeElement && listElement) {
            // Check if element is already fully visible
            const listRect = listElement.getBoundingClientRect();
            const activeRect = activeElement.getBoundingClientRect();

            if (
              activeRect.top < listRect.top ||
              activeRect.bottom > listRect.bottom
            ) {
              activeElement.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest', // 'center', 'start', 'end', 'nearest'
              });
            }
          }
        });
      }
    },
    // --- 結束 功能 2 ---
  },
  mounted() {
    // Initialize YouTube API loading as soon as Vue app is mounted
    this.initializeYouTubeAPI();
    // Add global keyboard listener
    window.addEventListener('keydown', this.handleKeyDown);
    // --- 功能 3: Add global mouseup listener for drag end outside window ---
    // Note: This might conflict if other components use global mouseup
    // A more robust solution might involve a temporary overlay during drag
    // window.addEventListener('mouseup', this.handleTimelineDragEnd);
    // Let's rely on the one added during drag start for now.
  },
  beforeUnmount() {
    // Clean up global keyboard listener
    window.removeEventListener('keydown', this.handleKeyDown);
    // --- 功能 3: Clean up potential global mouse listeners ---
    document.removeEventListener('mousemove', this.handleTimelineDragMove);
    document.removeEventListener('mouseup', this.handleTimelineDragEnd);
    // window.removeEventListener('mouseup', this.handleTimelineDragEnd); // If global listener was added
    if (this.clearTimelineTimeout) {
      clearTimeout(this.clearTimelineTimeout); // Clear any pending blur timeout
    }
    // --- 結束 功能 3 ---
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
  },
});

// Mount the Vue app to the #app element
app.mount('#app');
