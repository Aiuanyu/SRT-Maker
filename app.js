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
          // Use the computed sortedSubtitles for efficiency if possible, but direct iteration is fine too
          for (const sub of this.subtitles) {
            // Iterate original array, order might matter less here
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
        if (this.player && typeof this.player.getCurrentTime === 'function') {
          this.currentTime = this.player.getCurrentTime();
        }
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
        this.nextSubtitleIdCounter = 1; // Reset ID counter
        // --- 功能 3: 清除時間軸 ---
        this.editingSubtitleId = null;
        this.videoDuration = 0; // Reset duration until player is ready
        // --- 結束 功能 3 ---
        if (window.YT && window.YT.Player) {
          // Check if API is loaded
          if (this.player && this.playerReady) {
            console.log('Loading new video:', this.videoId);
            // Stop playback before loading new video to prevent state issues
            this.player.stopVideo();
            // Reset player ready state temporarily
            this.playerReady = false;
            this.player.loadVideoById(videoId);
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
        /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
      const match = url.match(regExp);
      if (match && match[1].length === 11) {
        return match[1];
      } else {
        // Try another pattern for youtu.be shortlinks if the first failed
        const shortRegExp = /youtu\.be\/([^#\&\?]{11})/;
        const shortMatch = url.match(shortRegExp);
        if (shortMatch && shortMatch[1]) {
          return shortMatch[1];
        }
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
      let newTime = currentTime + seconds;
      // Clamp time between 0 and video duration
      newTime = Math.max(0, newTime);
      if (this.videoDuration > 0) {
        newTime = Math.min(newTime, this.videoDuration);
      }
      this.player.seekTo(newTime, true);
      // Immediately update displayed time after seeking
      this.currentTime = newTime;
    },

    // --- Subtitle Management ---
    markTimestamp() {
      if (!this.playerReady) return;
      const currentTime = this.player.getCurrentTime();
      console.log(`Tab pressed at: ${currentTime}`);

      // 1. Check if we need to complete the last subtitle
      // Find the last subtitle regardless of sorting, as we are potentially modifying it
      const lastSubIndex = this.subtitles.length - 1;
      const lastSub = lastSubIndex >= 0 ? this.subtitles[lastSubIndex] : null;

      if (lastSub && lastSub.end === null) {
        if (currentTime > lastSub.start) {
          lastSub.end = currentTime;
          console.log(`Marked end for sub ${lastSub.id} at ${currentTime}`);
          // --- 修正 TypeError: 直接呼叫排序，移除 $nextTick ---
          this.sortSubtitles(); // Keep sorted after modification
          // --- 結束修正 ---
          // --- 功能 3: 標記結束後清除時間軸 ---
          this.clearTimelineEdit();
          // --- 結束 功能 3 ---
          return; // Task done
        } else {
          // Trying to mark end before start, ignore or alert
          console.warn('Cannot mark end time before start time.');
          return;
        }
      }

      // 2. Check if the current time overlaps/splits an existing subtitle
      let splitOccurred = false;
      // Iterate backwards to simplify splice index if splitting
      for (let i = this.subtitles.length - 1; i >= 0; i--) {
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
          // --- 功能 3: 分割後清除時間軸 ---
          this.clearTimelineEdit();
          // --- 結束 功能 3 ---
          break; // Stop checking after first split
        }
      }

      // 3. If no split occurred and no subtitle was completed, start a new one
      if (!splitOccurred) {
        // Additional check: Don't allow marking start if it's before the end of the previous *complete* subtitle
        // Use the computed property for checking against the *sorted* list
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
        // --- 功能 3: 標記新開始後清除時間軸 ---
        this.clearTimelineEdit();
        // --- 結束 功能 3 ---
      }

      this.sortSubtitles(); // Ensure list is always sorted after any modification
    },

    sortSubtitles() {
      // Check if subtitles array exists before sorting
      if (this.subtitles && Array.isArray(this.subtitles)) {
        this.subtitles.sort((a, b) => {
          // Basic check for valid objects and start property
          if (
            a &&
            typeof a.start === 'number' &&
            b &&
            typeof b.start === 'number'
          ) {
            return a.start - b.start;
          }
          // Handle potential invalid entries gracefully (e.g., put them at the end)
          if (!a || typeof a.start !== 'number') return 1;
          if (!b || typeof b.start !== 'number') return -1;
          return 0;
        });
      } else {
        console.error('Attempted to sort non-array or null subtitles.');
      }
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
      if (
        totalSeconds === null ||
        typeof totalSeconds === 'undefined' ||
        isNaN(totalSeconds)
      )
        return '00:00:00,000'; // Return default format on invalid input
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
        (sub) => sub.end !== null && sub.start < sub.end
      ); // Ensure start < end

      if (completeSubtitles.length === 0) {
        alert('沒有可匯出的有效字幕 (開始時間需小於結束時間)。');
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
      try {
        const blob = new Blob([srtContent], {
          type: 'text/srt;charset=utf-8;',
        });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        // Try to get video title for filename
        let filename = 'subtitles.srt';
        if (this.player && typeof this.player.getVideoData === 'function') {
          const videoTitle = this.player.getVideoData().title;
          if (videoTitle) {
            // Sanitize filename (replace invalid chars)
            filename =
              videoTitle.replace(/[<>:"/\\|?*]+/g, '_').substring(0, 50) +
              '.srt';
          }
        }
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url); // Clean up
      } catch (e) {
        console.error('Error creating or downloading SRT file:', e);
        alert('匯出 SRT 時發生錯誤。請檢查主控台獲取更多資訊。');
      }
    },

    // --- Keyboard Event Handling ---
    handleKeyDown(event) {
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA');

      // Allow default behavior if typing in input/textarea, except for specific overrides
      if (isInputFocused) {
        // Allow Tab default behavior ONLY within textareas
        if (event.key === 'Tab' && activeElement.tagName === 'TEXTAREA') {
          return; // Do not prevent default for Tab in textarea
        }
        // Allow arrows within input/textarea
        if (
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
            event.key
          )
        ) {
          return; // Do not prevent default for arrows in inputs
        }
        // Allow space within input/textarea (but Space might still trigger play/pause if not handled carefully)
        if (event.code === 'Space' && activeElement.tagName === 'TEXTAREA') {
          // Let space work in textarea, but we might still want to prevent page scroll below
          // return; // If we return here, space won't toggle play/pause
        }
        // Allow Enter in URL input to trigger loadVideo
        if (event.key === 'Enter' && activeElement.id === 'youtube-url') {
          event.preventDefault(); // Prevent form submission if any
          this.loadVideo();
          return;
        }
        // If it's not one of the allowed keys above while input is focused,
        // check if it's one of our global hotkeys (Space, Arrows, Tab)
        // If it IS a global hotkey, we *might* want it to act globally even if input is focused
        // (e.g., Space always toggles play/pause). This depends on desired UX.

        // Current logic: If focused, only Tab (outside textarea) and potentially Space/Arrows (outside textareas/inputs) are captured below.
      }

      // Player must be ready for most actions
      if (!this.playerReady) {
        // Allow Enter in URL input even if player not ready
        if (
          !(
            event.key === 'Enter' &&
            activeElement &&
            activeElement.id === 'youtube-url'
          )
        ) {
          console.log('Player not ready, ignoring keypress:', event.key);
          return;
        }
      }

      // Global Hotkeys
      switch (event.code) {
        case 'Space':
          // Prevent page scrolling ONLY if an input is NOT focused
          // Or maybe always prevent scroll, but allow space typing? Needs careful thought.
          // Let's prevent scroll unless it's a textarea.
          if (!isInputFocused || activeElement.tagName !== 'TEXTAREA') {
            event.preventDefault();
          }
          // Toggle play/pause regardless of focus? (Common media player behavior)
          this.togglePlayPause();
          break;
        case 'ArrowLeft':
          // Prevent default browser behavior (like scrolling) ONLY if input not focused
          if (!isInputFocused) {
            event.preventDefault();
            this.seekRelative(-5);
          }
          break;
        case 'ArrowRight':
          // Prevent default browser behavior ONLY if input not focused
          if (!isInputFocused) {
            event.preventDefault();
            this.seekRelative(5);
          }
          break;
        case 'Tab':
          // Prevent default tab behavior (changing focus)
          // UNLESS the focus is inside a textarea (handled by the check at the top)
          if (!isInputFocused || activeElement.tagName !== 'TEXTAREA') {
            event.preventDefault();
            this.markTimestamp();
          } else {
            // If inside textarea, allow default tab (or handle indent if needed)
            // The check at the top already returns, so this else might be redundant
          }
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

        // Ensure min is less than max
        if (minTime >= maxTime) {
          this.timelineRange = { min: minTime, max: minTime + buffer * 2 }; // Adjust if invalid range
        } else {
          this.timelineRange = { min: minTime, max: maxTime };
        }

        console.log(
          `Editing subtitle ${id}, timeline range: ${this.timelineRange.min.toFixed(
            2
          )} - ${this.timelineRange.max.toFixed(2)}`
        );
      }
    },
    clearTimelineEdit() {
      // Only clear if not currently dragging
      if (!this.draggingHandle) {
        this.editingSubtitleId = null;
        // Reset range, maybe not necessary to set to 0,0
        // this.timelineRange = { min: 0, max: 0 };
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
      // Use pageX for consistency across browsers if clientX causes issues
      this.dragStartX = event.pageX || event.clientX;
      document.addEventListener('mousemove', this.handleTimelineDragMove);
      document.addEventListener('mouseup', this.handleTimelineDragEnd);
      // Add touch events for mobile compatibility
      document.addEventListener('touchmove', this.handleTimelineDragMove, {
        passive: false,
      }); // Prevent scroll on touch
      document.addEventListener('touchend', this.handleTimelineDragEnd);

      event.preventDefault(); // Prevent text selection and default drag behavior
      event.stopPropagation(); // Prevent triggering other events
      console.log(`Drag start: ${handleType}`);
    },
    handleTimelineDragMove(event) {
      if (!this.draggingHandle || !this.editingSubtitle) return;

      // Prevent default touch behavior (like scrolling)
      if (event.touches) {
        event.preventDefault();
      }

      const timelineElement = this.$refs.timelineBar; // Use ref if possible
      // const timelineElement = document.querySelector('#timeline-editor .timeline-bar'); // Fallback
      if (!timelineElement) {
        console.error('Timeline bar element not found.');
        return;
      }

      const timelineRect = timelineElement.getBoundingClientRect();
      const timelineWidth = timelineRect.width;
      if (timelineWidth <= 0) return; // Avoid division by zero

      const rangeDuration = this.timelineRange.max - this.timelineRange.min;
      if (rangeDuration <= 0) return; // Avoid division by zero

      // Get current X position from mouse or touch event
      const currentX =
        event.pageX ||
        event.clientX ||
        (event.touches && event.touches[0].pageX);
      if (typeof currentX !== 'number') return; // Exit if no valid coordinate

      // Calculate movement relative to the start of the drag
      const deltaX = currentX - this.dragStartX;
      const deltaTime = (deltaX / timelineWidth) * rangeDuration;

      // --- Refactored time update logic ---
      let originalTime =
        this.draggingHandle === 'start'
          ? this.editingSubtitle._originalStart || this.editingSubtitle.start
          : this.editingSubtitle._originalEnd || this.editingSubtitle.end;

      // Store original time on first move if not already stored
      if (
        this.draggingHandle === 'start' &&
        typeof this.editingSubtitle._originalStart === 'undefined'
      ) {
        this.editingSubtitle._originalStart = this.editingSubtitle.start;
        originalTime = this.editingSubtitle.start;
      } else if (
        this.draggingHandle === 'end' &&
        typeof this.editingSubtitle._originalEnd === 'undefined'
      ) {
        this.editingSubtitle._originalEnd = this.editingSubtitle.end;
        originalTime = this.editingSubtitle.end;
      }

      // Calculate the potential new time based on original time + delta
      let newTime = originalTime + deltaTime;

      // Clamp time based on handle type and boundaries
      if (this.draggingHandle === 'start') {
        // Clamp: >= 0, >= range.min, < current end time (or estimated end if null)
        newTime = Math.max(0, this.timelineRange.min, newTime);
        if (this.editingSubtitle.end !== null) {
          newTime = Math.min(newTime, this.editingSubtitle.end - 0.01); // Ensure start < end
        } else {
          // If end is null, maybe clamp based on video duration? Or just allow going positive?
          if (this.videoDuration > 0) {
            newTime = Math.min(newTime, this.videoDuration);
          }
        }
        this.editingSubtitle.start = newTime;
      } else {
        // dragging 'end'
        if (this.editingSubtitle.end === null) return; // Cannot drag end if not set yet
        // Clamp: > current start time, <= range.max, <= videoDuration
        newTime = Math.max(newTime, this.editingSubtitle.start + 0.01); // Ensure end > start
        newTime = Math.min(newTime, this.timelineRange.max);
        if (this.videoDuration > 0) {
          newTime = Math.min(newTime, this.videoDuration);
        }
        this.editingSubtitle.end = newTime;
      }

      // Optional: Update timeline range dynamically if handle goes near edge? (More complex)

      // Update the displayed current time to match the handle being dragged
      this.currentTime = newTime;
      // Seek player to the new time for immediate feedback (throttle this?)
      if (this.playerReady) {
        // Optional: Throttle seekTo calls if performance is an issue
        this.player.seekTo(newTime, true);
      }
    },
    handleTimelineDragEnd(event) {
      if (!this.draggingHandle) return;
      console.log(`Drag end: ${this.draggingHandle}`);

      // Clean up temporary original time properties
      if (this.editingSubtitle) {
        delete this.editingSubtitle._originalStart;
        delete this.editingSubtitle._originalEnd;
      }

      this.draggingHandle = null;
      document.removeEventListener('mousemove', this.handleTimelineDragMove);
      document.removeEventListener('mouseup', this.handleTimelineDragEnd);
      // Remove touch listeners
      document.removeEventListener('touchmove', this.handleTimelineDragMove);
      document.removeEventListener('touchend', this.handleTimelineDragEnd);

      this.sortSubtitles(); // Re-sort in case times changed order
      // Trigger the debounced clear in case focus was lost during drag
      this.clearTimelineEditDebounced();
    },
    // --- Helper to get video duration ---
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
      // --- 修正 DOMException: 加入日誌和 try-catch ---
      console.log(
        `Watcher triggered: newId=${newId} (type: ${typeof newId}), oldId=${oldId}`
      );
      if (newId !== null && typeof newId === 'string') {
        // Ensure newId is a non-null string
        this.$nextTick(() => {
          const listElement = document.getElementById('subtitle-list');
          if (!listElement) {
            console.warn(
              'Watcher: Subtitle list element (#subtitle-list) not found.'
            );
            return;
          }
          try {
            const activeElement = document.getElementById(newId);
            console.log(
              `Watcher trying to find element: #${newId}, Found: ${!!activeElement}`
            );
            if (activeElement) {
              // Check if element is already fully visible
              const listRect = listElement.getBoundingClientRect();
              const activeRect = activeElement.getBoundingClientRect();

              const isVisible =
                activeRect.top >= listRect.top &&
                activeRect.bottom <= listRect.bottom;

              if (!isVisible) {
                activeElement.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest', // 'center', 'start', 'end', 'nearest'
                });
              }
            } else {
              console.warn(
                `Watcher: Element with ID #${newId} not found in DOM.`
              );
            }
          } catch (e) {
            // Catch potential errors during getElementById or scrollIntoView
            console.error(
              `Error in activeSubtitleId watcher for ID #${newId}:`,
              e
            );
            // Specifically check for the DOMException
            if (
              e instanceof DOMException &&
              e.message.includes('invalid character')
            ) {
              console.error(
                `---> DOMException likely due to invalid character in ID: "${newId}"`
              );
            }
          }
        });
      } else if (newId !== null) {
        console.warn(
          `Watcher: newId is not a string: ${newId} (type: ${typeof newId})`
        );
      }
      // --- 結束修正 ---
    },
    // --- 結束 功能 2 ---
  },
  mounted() {
    // Initialize YouTube API loading as soon as Vue app is mounted
    this.initializeYouTubeAPI();
    // Add global keyboard listener
    window.addEventListener('keydown', this.handleKeyDown);
    // Add ref to timeline bar for easier access in drag move
    // Ensure the element exists in the template with ref="timelineBar"
    // <div class="timeline-bar" ref="timelineBar">...</div>
  },
  beforeUnmount() {
    // Clean up global keyboard listener
    window.removeEventListener('keydown', this.handleKeyDown);
    // --- 功能 3: Clean up potential global mouse/touch listeners ---
    // These are now added/removed specifically during drag, so no global cleanup needed here
    // document.removeEventListener('mousemove', this.handleTimelineDragMove);
    // document.removeEventListener('mouseup', this.handleTimelineDragEnd);
    // document.removeEventListener('touchmove', this.handleTimelineDragMove);
    // document.removeEventListener('touchend', this.handleTimelineDragEnd);
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
    // window.onYouTubeIframeAPIReady = null; // Be careful if other scripts might rely on this
  },
});

// Mount the Vue app to the #app element
app.mount('#app');
