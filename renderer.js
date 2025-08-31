const { ipcRenderer } = require('electron');

class DemoModerator {
    constructor() {
        this.currentPhase = 'ready'; 
        this.phases = ['demo', 'qa'];
        this.phaseIndex = -1;
        this.timeRemaining = 0;
        this.totalTime = 0;
        this.timer = null;
        this.isPaused = false;
        this.startTimestamp = null;
        this.pausedDuration = 0;
        this.lastPauseTime = null;
        this.isOvertime = false;
        this.settings = {
            demoTime: 2 * 60,
            qaTime: 2 * 60
        };
        
        // Recording properties
        this.mediaRecorder = null;
        this.mediaStream = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.currentRecordingPhase = null;
        
        // Question generation properties
        this.earlyQuestionGenerated = false;
        this.earlyQuestionResult = null;
        this.questionGenerationStarted = false;
        this.pregeneratedQuestionAudio = null;
        
        // Warning properties
        this.twentySecondWarningGiven = false;
        
        // Auto-transition properties
        this.autoTransitionTimeout = null;
        this.autoTransitionTriggered = false;
        
        // Completion announcement tracking
        this.sessionCompleteAnnouncementMade = false;
        
        // Transcription properties
        this.transcriptionStream = null;
        this.transcriptionRecorder = null;
        this.isTranscribing = false;
        this.transcriptionPaused = false;
        this.transcriptionChunks = [];
        this.whisperReady = false;
        this.availableMicrophones = [];
        this.selectedMicrophoneId = null;
        this.availableCameras = [];
        this.selectedCameraId = null;
        this.demoTranscriptMessages = []; // Store demo-only transcript messages
        this.allTranscriptMessages = []; // Store all transcript messages with timestamps
        // TTS properties
        this.ttsEnabled = true;
        this.ttsVoice = 'Samantha';
        this.isTTSSpeaking = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.loadSettings();
        this.initializeMedia();
        this.checkWhisperStatus();
        this.enumerateMicrophones();
        this.enumerateCameras();
        this.loadTTSConfig();
        
        // Set initial display and button states
        this.updateDisplay();
    }

    initializeElements() {
        this.elements = {
            timerDisplay: document.getElementById('timerDisplay'),
            currentPhase: document.getElementById('currentPhase'),
            timeRemaining: document.getElementById('timeRemaining'),
            progressFill: document.getElementById('progressFill'),
            pauseBtn: document.getElementById('pauseBtn'),
            resetBtn: document.getElementById('resetBtn'),
            nextPhaseBtn: document.getElementById('nextPhaseBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            timerView: document.getElementById('timerView'),
            settingsView: document.getElementById('settingsView'),
            demoTimeDisplay: document.getElementById('demoTimeDisplay'),
            qaTimeDisplay: document.getElementById('qaTimeDisplay'),
            demoTimeInput: document.getElementById('demoTimeInput'),
            qaTimeInput: document.getElementById('qaTimeInput'),
            demoMinutes: document.getElementById('demoMinutes'),
            qaMinutes: document.getElementById('qaMinutes'),
            saveSettingsBtn: document.getElementById('saveSettingsBtn'),
            cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
            backToTimerBtn: document.getElementById('backToTimerBtn'),
            ttsEnabled: document.getElementById('ttsEnabled'),
            ttsVoice: document.getElementById('ttsVoice'),
            // Recording elements
            videoPreview: document.getElementById('videoPreview'),
            recordingIndicator: document.getElementById('recordingIndicator'),
            recordingStatus: document.getElementById('recordingStatus'),
            masterRecordBtn: document.getElementById('masterRecordBtn'),
            recordIcon: document.getElementById('recordIcon'),
            recordText: document.getElementById('recordText'),
            cameraSelect: document.getElementById('cameraSelect'),
            // Transcription elements
            transcriptMessages: document.getElementById('transcriptMessages'),
            clearTranscriptBtn: document.getElementById('clearTranscriptBtn'),
            micSelect: document.getElementById('micSelect'),
            whisperStatus: document.getElementById('whisperStatus'),
            whisperStatusText: document.getElementById('whisperStatusText'),
            // Question display elements
            questionDisplay: document.getElementById('questionDisplay'),
            generatedQuestion: document.getElementById('generatedQuestion'),
            readQuestionBtn: document.getElementById('readQuestionBtn'),
            dismissQuestionBtn: document.getElementById('dismissQuestionBtn'),
            questionSource: document.getElementById('questionSource')
        };
    }

    setupEventListeners() {
        this.elements.pauseBtn.addEventListener('click', () => this.togglePause());
        this.elements.resetBtn.addEventListener('click', () => this.resetTimer());
        this.elements.nextPhaseBtn.addEventListener('click', () => this.nextPhase());
        this.elements.settingsBtn.addEventListener('click', () => this.showSettings());
        this.elements.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.elements.cancelSettingsBtn.addEventListener('click', () => this.hideSettings());
        this.elements.backToTimerBtn.addEventListener('click', () => this.hideSettings());
        // Master record button
        this.elements.masterRecordBtn.addEventListener('click', () => this.toggleMasterRecording());
        // Transcription event listeners
        this.elements.clearTranscriptBtn.addEventListener('click', () => this.clearTranscript());
        this.elements.micSelect.addEventListener('change', (e) => this.changeMicrophone(e.target.value));
        // Camera selection event listener
        this.elements.cameraSelect.addEventListener('change', (e) => this.changeCamera(e.target.value));
        // Question display event listeners
        this.elements.readQuestionBtn.addEventListener('click', () => this.readQuestion());
        this.elements.dismissQuestionBtn.addEventListener('click', () => this.dismissQuestion());
        // TTS voice selection event listener
        this.elements.ttsVoice.addEventListener('change', (e) => this.previewVoice(e.target.value));
        // Inline time editing event listeners
        this.elements.demoTimeDisplay.addEventListener('click', () => this.startTimeEdit('demo'));
        this.elements.qaTimeDisplay.addEventListener('click', () => this.startTimeEdit('qa'));
        this.elements.demoTimeInput.addEventListener('blur', () => this.finishTimeEdit('demo'));
        this.elements.qaTimeInput.addEventListener('blur', () => this.finishTimeEdit('qa'));
        this.elements.demoTimeInput.addEventListener('keydown', (e) => this.handleTimeEditKeydown(e, 'demo'));
        this.elements.qaTimeInput.addEventListener('keydown', (e) => this.handleTimeEditKeydown(e, 'qa'));
    }

    async loadSettings() {
        try {
            const settings = await ipcRenderer.invoke('load-settings');
            this.settings = settings;
            this.updateTimeDisplays();
            this.updateSettingsInputs();
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        const demoMinutes = parseInt(this.elements.demoMinutes.value);
        const qaMinutes = parseInt(this.elements.qaMinutes.value);
        
        if (demoMinutes < 1 || qaMinutes < 1) {
            alert('Please enter valid times (minimum 1 minute)');
            return;
        }

        this.settings = {
            demoTime: demoMinutes * 60,
            qaTime: qaMinutes * 60
        };

        try {
            await ipcRenderer.invoke('save-settings', this.settings);
            
            // Save TTS settings
            await this.setTTSConfig({
                enabled: this.elements.ttsEnabled.checked,
                voice: this.elements.ttsVoice.value
            });
            
            this.updateTimeDisplays();
            this.updateTranscriptPlaceholder();
            this.hideSettings();
            if (this.currentPhase === 'ready') {
                this.resetTimer();
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Failed to save settings');
        }
    }

    updateSettingsInputs() {
        this.elements.demoMinutes.value = Math.floor(this.settings.demoTime / 60);
        this.elements.qaMinutes.value = Math.floor(this.settings.qaTime / 60);
        this.elements.ttsEnabled.checked = this.ttsEnabled;
        this.elements.ttsVoice.value = this.ttsVoice;
    }

    updateTimeDisplays() {
        this.elements.demoTimeDisplay.textContent = this.formatTime(this.settings.demoTime);
        this.elements.qaTimeDisplay.textContent = this.formatTime(this.settings.qaTime);
    }

    showSettings() {
        this.elements.timerView.classList.remove('active');
        this.elements.settingsView.classList.add('active');
        this.updateSettingsInputs();
    }

    hideSettings() {
        this.elements.settingsView.classList.remove('active');
        this.elements.timerView.classList.add('active');
    }

    startTimer() {
        if (this.currentPhase === 'ready') {
            this.phaseIndex = 0;
            this.currentPhase = this.phases[0];
            this.timeRemaining = this.settings[this.currentPhase + 'Time'];
            this.totalTime = this.timeRemaining;
            
            // Clear demo transcript messages for fresh start
            this.demoTranscriptMessages = [];
            this.allTranscriptMessages = [];
            
            // Reset question generation state for new demo
            this.earlyQuestionGenerated = false;
            this.earlyQuestionResult = null;
            this.questionGenerationStarted = false;
            this.pregeneratedQuestionAudio = null;
            
            // Reset warning state for new demo
            this.twentySecondWarningGiven = false;
            
            // Clear auto-transition for new demo
            this.clearAutoTransition();
            
            // Reset completion announcement flag
            this.sessionCompleteAnnouncementMade = false;
            
            // Announce the start of the phase
            const phaseNames = {
                demo: 'demo',
                qa: 'questions'
            };
            // Use pregenerated audio directly to ensure transcription is paused
            if (this.currentPhase === 'demo') {
                this.playPregeneratedAudio('start_demo.wav', 'starting demo phase, recording 2 minutes on the clock');
            } else {
                this.playPregeneratedAudio('start_questions.wav', 'starting questions phase');
            }
        }

        this.isPaused = false;
        this.elements.pauseBtn.disabled = false;
        this.elements.nextPhaseBtn.disabled = false;

        // Set start timestamp for accurate timing
        this.startTimestamp = Date.now();
        this.pausedDuration = 0;

        this.updateDisplay();
        this.timer = setInterval(() => {
            this.tick();
        }, 100); // More frequent updates to handle alt-tab better
    }

    togglePause() {
        if (this.isPaused) {
            this.resumeTimer();
            this.elements.pauseBtn.textContent = 'Pause';
        } else {
            this.pause();
            this.elements.pauseBtn.textContent = 'Resume';
        }
    }

    pause() {
        this.isPaused = true;
        this.lastPauseTime = Date.now();
        this.elements.pauseBtn.disabled = false;
        clearInterval(this.timer);
    }

    resumeTimer() {
        if (this.lastPauseTime) {
            // Add the paused duration to total paused time
            this.pausedDuration += Date.now() - this.lastPauseTime;
            this.lastPauseTime = null;
        }
        
        this.isPaused = false;
        this.elements.pauseBtn.disabled = false;
        this.elements.nextPhaseBtn.disabled = false;

        this.updateDisplay();
        this.timer = setInterval(() => {
            this.tick();
        }, 100);
    }

    resetTimer() {
        clearInterval(this.timer);
        this.currentPhase = 'ready';
        this.phaseIndex = -1;
        this.timeRemaining = 0;
        this.totalTime = 0;
        this.isPaused = false;
        this.startTimestamp = null;
        this.pausedDuration = 0;
        this.lastPauseTime = null;
        this.isOvertime = false;

        this.elements.pauseBtn.disabled = true;
        this.elements.pauseBtn.textContent = 'Pause';
        this.elements.nextPhaseBtn.disabled = true;
        this.elements.nextPhaseBtn.textContent = 'Next Phase';

        this.updateDisplay();
    }

    async nextPhase(skipAnnouncement = false, skipQuestionGeneration = false) {
        // If we're in Questions Phase (last phase), complete the session
        if (this.currentPhase === 'qa') {
            await this.playPregeneratedAudio('questions_complete.wav', 'questions phase complete. Time is up! Thank you for an awesome demo!');
            
            // Auto-stop recording when manually ending Q&A
            if (this.isRecording) {
                // Prevent duplicate "Demo complete" announcement since we just played Q&A complete
                this.sessionCompleteAnnouncementMade = true;
                await this.stopMasterRecording();
            } else {
                this.completeSession();
            }
            return;
        }
        
        // If we're in demo overtime, transition to Q&A phase
        if (this.currentPhase === 'demo' && this.isOvertime) {
            // Clear auto-transition since we're manually advancing
            this.clearAutoTransition();
            // Reset overtime flag for transition
            this.isOvertime = false;
        }
        
        if (this.phaseIndex < this.phases.length - 1) {
            const previousPhase = this.currentPhase;
            
            this.phaseIndex++;
            this.currentPhase = this.phases[this.phaseIndex];
            this.timeRemaining = this.settings[this.currentPhase + 'Time'];
            this.totalTime = this.timeRemaining;
            this.updateDisplay();
            
            // Restart the timer for the new phase
            this.isPaused = false;
            this.startTimestamp = Date.now();
            this.pausedDuration = 0;
            this.lastPauseTime = null;
            this.isOvertime = false;
            this.twentySecondWarningGiven = false; // Reset warning for new phase
            this.elements.pauseBtn.disabled = false;
            this.elements.nextPhaseBtn.disabled = false;
            this.timer = setInterval(() => {
                this.tick();
            }, 100);
            
            // Special handling for demo to questions transition
            if (previousPhase === 'demo' && this.currentPhase === 'qa' && !skipQuestionGeneration) {
                // Dynamic announcements with minimal pauses
                await new Promise(resolve => setTimeout(resolve, 400));
                await this.speak('Starting Question Phase');
                
                // Use pregenerated question if available, otherwise generate new one
                console.log('Debug: this.earlyQuestionGenerated:', this.earlyQuestionGenerated);
                console.log('Debug: this.earlyQuestionResult:', this.earlyQuestionResult);
                if (this.earlyQuestionGenerated && this.earlyQuestionResult) {
                    console.log('Using pregenerated question and audio for immediate playback');
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Show and speak the pregenerated question immediately
                    this.showQuestion(this.earlyQuestionResult.question, this.earlyQuestionResult.fallback);
                    
                    if (this.pregeneratedQuestionAudio) {
                        try {
                            await this.playPregeneratedAudio(this.pregeneratedQuestionAudio, this.earlyQuestionResult.question, true);
                            this.cleanupQuestionAudio();
                        } catch (error) {
                            console.warn('Failed to play pregenerated question audio, falling back to TTS:', error);
                            await this.speak(this.earlyQuestionResult.question, { isQAQuestion: true });
                        }
                    } else {
                        await this.speak(this.earlyQuestionResult.question, { isQAQuestion: true });
                    }
                } else {
                    // No pregenerated question available, generate new one
                    await new Promise(resolve => setTimeout(resolve, 200));
                    await this.speak('Let me think about the first question for you...');
                    await this.generateAndShowQuestion();
                }
            } else {
                // Announce new phase for all other transitions (unless skipped)
                if (!skipAnnouncement) {
                    const phaseNames = {
                        demo: 'demo',
                        qa: 'questions'
                    };
                    this.speak(`Now starting ${phaseNames[this.currentPhase]} phase. ${Math.floor(this.timeRemaining / 60)} minutes on the clock.`);
                }
            }
        } else {
            this.completeSession();
        }
    }

    tick() {
        if (!this.startTimestamp || this.isPaused) {
            return;
        }

        // Calculate elapsed time based on actual timestamps
        const now = Date.now();
        const elapsed = Math.floor((now - this.startTimestamp - this.pausedDuration) / 1000);
        
        // Calculate remaining time based on elapsed time
        let newTimeRemaining = this.totalTime - elapsed;
        
        // Allow negative time for both demo and Q&A phases (overtime mode)
        
        // Only update if time actually changed (prevents unnecessary updates)
        if (newTimeRemaining !== this.timeRemaining) {
            this.timeRemaining = newTimeRemaining;
            this.updateDisplay();
        }

        // Trigger early question generation at 1 minute into demo phase
        if (this.currentPhase === 'demo' && !this.questionGenerationStarted) {
            const elapsed = this.totalTime - this.timeRemaining;
            if (elapsed >= 60) { // 1 minute elapsed
                this.questionGenerationStarted = true;
                this.startEarlyQuestionGeneration();
            }
        }

        // Give 20-second warning for both demo and Q&A phases
        if ((this.currentPhase === 'demo' || this.currentPhase === 'qa') && !this.twentySecondWarningGiven && !this.isOvertime) {
            if (this.timeRemaining <= 20 && this.timeRemaining > 0) {
                this.twentySecondWarningGiven = true;
                this.give20SecondWarning();
            }
        }

        // Only trigger phase completion announcement when time first reaches 0 (not when negative)
        if (this.timeRemaining <= 0 && !this.isOvertime) {
            // Both Demo and Questions phases now enter overtime mode instead of auto-advancing
            this.isOvertime = true;
            // Call phaseComplete but don't await it to avoid blocking the timer
            this.phaseComplete().catch(console.error);
        }
    }

    async phaseComplete() {
        // Announce phase completion
        const phaseNames = {
            demo: 'demo',
            qa: 'questions'
        };
        
        if (this.currentPhase === 'demo') {
            // For Demo Phase: enter overtime mode instead of advancing to Q&A
            await this.speak(`${phaseNames[this.currentPhase]} phase complete. Time is up!`);
            
            // Continue timer in overtime mode - don't clear interval
            this.elements.currentPhase.textContent = 'Demo Overtime';
            this.elements.pauseBtn.disabled = false; // Keep controls active
            this.elements.nextPhaseBtn.disabled = false; // Keep Next Phase active to allow manual advance
            this.elements.nextPhaseBtn.textContent = 'Start Q&A'; // Change text to indicate manual transition
            
            // Set up auto-transition to Q&A after 10 seconds
            this.setupAutoTransition();
            
            // Keep recording and transcription active
            return; // Exit early, don't auto-advance to Q&A
        } else if (this.currentPhase === 'qa') {
            // For Questions Phase: continue recording in overtime instead of ending session
            await this.playPregeneratedAudio('questions_complete.wav', 'questions phase complete. Time is up! Thank you for an awesome demo!');
            
            // Auto-stop recording when Q&A completes
            if (this.isRecording) {
                // Prevent duplicate "Demo complete" announcement since we just played Q&A complete
                this.sessionCompleteAnnouncementMade = true;
                await this.stopMasterRecording();
            }
            
            return; // Exit early after stopping recording
        }
    }


    updateDisplay() {
        // Remove all phase classes first
        this.elements.timerDisplay.classList.remove('demo-phase', 'questions-phase', 'completed');
        
        if (this.currentPhase === 'ready') {
            this.elements.currentPhase.textContent = 'Ready to Start';
            this.elements.timeRemaining.textContent = '00:00';
            this.elements.progressFill.style.width = '0%';
            this.updateBackgroundColor('ready');
        } else if (this.currentPhase === 'completed') {
            this.elements.timerDisplay.classList.add('completed');
            this.updateBackgroundColor('completed');
            // Don't return here, let the button state logic run below
        } else {
            const phaseNames = {
                demo: 'Demo Phase',
                qa: 'Questions Phase'
            };
            
            // Add appropriate phase class
            if (this.currentPhase === 'demo') {
                this.elements.timerDisplay.classList.add('demo-phase');
            } else if (this.currentPhase === 'qa') {
                this.elements.timerDisplay.classList.add('questions-phase');
            }
            
            // Override phase name if in overtime
            if (this.isOvertime && this.currentPhase === 'demo') {
                this.elements.currentPhase.textContent = 'Demo Overtime';
            } else if (this.isOvertime && this.currentPhase === 'qa') {
                this.elements.currentPhase.textContent = 'Overtime - Questions Continue';
            } else {
                this.elements.currentPhase.textContent = phaseNames[this.currentPhase];
            }
            this.elements.timeRemaining.textContent = this.formatTime(this.timeRemaining);
            
            // Handle progress calculation for negative time (overtime)
            let progress;
            if (this.timeRemaining >= 0) {
                progress = ((this.totalTime - this.timeRemaining) / this.totalTime) * 100;
            } else {
                // In overtime, keep progress at 100%
                progress = 100;
            }
            this.elements.progressFill.style.width = progress + '%';
            
            // Update background color based on timer progress
            this.updateBackgroundColor('timer');
        }
        
        // Update Reset button state - disable when ready/fresh (00:00)
        this.elements.resetBtn.disabled = (this.currentPhase === 'ready');
        
        // Update Next Phase button text based on current state
        if (this.isOvertime && this.currentPhase === 'demo') {
            this.elements.nextPhaseBtn.textContent = 'Start Q&A';
        } else if (this.isOvertime && this.currentPhase === 'qa') {
            this.elements.nextPhaseBtn.textContent = 'End Demo';
        } else {
            this.elements.nextPhaseBtn.textContent = 'Next Phase';
        }
    }

    updateBackgroundColor(state) {
        const body = document.body;
        
        // Remove all timer color classes
        body.classList.remove('timer-green', 'timer-yellow', 'timer-red', 'timer-red-blinking');
        
        if (state === 'ready' || state === 'completed') {
            // Use default background for ready/completed states
            return;
        }
        
        if (state === 'timer' && (this.currentPhase === 'demo' || this.currentPhase === 'qa')) {
            if (this.timeRemaining < 0) {
                // Overtime - use blinking red
                body.classList.add('timer-red-blinking');
                return;
            }
            
            // Calculate progress as percentage of phase completed
            const progress = ((this.totalTime - this.timeRemaining) / this.totalTime) * 100;
            
            if (progress <= 33.33) {
                // First third - green
                body.classList.add('timer-green');
            } else if (progress <= 66.66) {
                // Second third - yellow
                body.classList.add('timer-yellow');
            } else {
                // Last third - red
                body.classList.add('timer-red');
            }
        }
    }

    formatTime(seconds) {
        const isNegative = seconds < 0;
        const absSeconds = Math.abs(seconds);
        const mins = Math.floor(absSeconds / 60);
        const secs = absSeconds % 60;
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return isNegative ? `-${timeStr}` : timeStr;
    }

    async initializeMedia() {
        try {
            const constraints = {
                video: this.selectedCameraId ? 
                    { deviceId: { exact: this.selectedCameraId }, width: 1280, height: 720 } : 
                    { width: 1280, height: 720 },
                audio: this.selectedMicrophoneId ? 
                    { deviceId: { exact: this.selectedMicrophoneId } } : 
                    true
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            this.mediaStream = stream;
            this.elements.videoPreview.srcObject = stream;
            this.elements.recordingStatus.textContent = 'Ready to Start Demo';
        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.elements.recordingStatus.textContent = 'Camera/Microphone Access Denied';
        }
    }

    async enumerateMicrophones() {
        try {
            // Request permissions first
            await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableMicrophones = devices.filter(device => device.kind === 'audioinput');
            
            this.updateMicrophoneDropdown();
        } catch (error) {
            console.error('Error enumerating microphones:', error);
            this.elements.micSelect.innerHTML = '<option value="">Microphone access denied</option>';
        }
    }

    updateMicrophoneDropdown() {
        this.elements.micSelect.innerHTML = '';
        
        if (this.availableMicrophones.length === 0) {
            this.elements.micSelect.innerHTML = '<option value="">No microphones found</option>';
            return;
        }

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Default Microphone';
        this.elements.micSelect.appendChild(defaultOption);

        // Add each available microphone
        this.availableMicrophones.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${device.deviceId.substr(0, 8)}...`;
            
            // Select current microphone if it matches
            if (device.deviceId === this.selectedMicrophoneId) {
                option.selected = true;
            }
            
            this.elements.micSelect.appendChild(option);
        });

        // If no specific mic is selected, show which one is currently being used
        if (!this.selectedMicrophoneId && this.mediaStream) {
            const audioTrack = this.mediaStream.getAudioTracks()[0];
            if (audioTrack) {
                const currentDevice = this.availableMicrophones.find(
                    device => device.deviceId === audioTrack.getSettings().deviceId
                );
                if (currentDevice) {
                    this.elements.micSelect.value = currentDevice.deviceId;
                    this.selectedMicrophoneId = currentDevice.deviceId;
                }
            }
        }
    }

    async changeMicrophone(deviceId) {
        if (this.isRecording || this.isTranscribing) {
            alert('Cannot change microphone while recording. Please stop recording first.');
            // Revert dropdown selection
            this.elements.micSelect.value = this.selectedMicrophoneId || '';
            return;
        }

        this.selectedMicrophoneId = deviceId || null;
        
        try {
            // Stop current stream
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
            }
            
            // Reinitialize with new microphone
            await this.initializeMedia();
            
            console.log('Switched to microphone:', deviceId || 'default');
        } catch (error) {
            console.error('Error changing microphone:', error);
            alert('Failed to switch microphone: ' + error.message);
        }
    }

    async enumerateCameras() {
        try {
            // Request permissions first
            await navigator.mediaDevices.getUserMedia({ video: true });
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');
            
            this.updateCameraDropdown();
        } catch (error) {
            console.error('Error enumerating cameras:', error);
            this.elements.cameraSelect.innerHTML = '<option value="">Camera access denied</option>';
        }
    }

    updateCameraDropdown() {
        this.elements.cameraSelect.innerHTML = '';
        
        if (this.availableCameras.length === 0) {
            this.elements.cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            return;
        }

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Default Camera';
        this.elements.cameraSelect.appendChild(defaultOption);

        // Add each available camera
        this.availableCameras.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${device.deviceId.substr(0, 8)}...`;
            
            // Select current camera if it matches
            if (device.deviceId === this.selectedCameraId) {
                option.selected = true;
            }
            
            this.elements.cameraSelect.appendChild(option);
        });

        // If no specific camera is selected, show which one is currently being used
        if (!this.selectedCameraId && this.mediaStream) {
            const videoTrack = this.mediaStream.getVideoTracks()[0];
            if (videoTrack) {
                const currentDevice = this.availableCameras.find(
                    device => device.deviceId === videoTrack.getSettings().deviceId
                );
                if (currentDevice) {
                    this.elements.cameraSelect.value = currentDevice.deviceId;
                    this.selectedCameraId = currentDevice.deviceId;
                }
            }
        }
    }

    async changeCamera(deviceId) {
        if (this.isRecording || this.isTranscribing) {
            alert('Cannot change camera while recording. Please stop recording first.');
            // Revert dropdown selection
            this.elements.cameraSelect.value = this.selectedCameraId || '';
            return;
        }

        this.selectedCameraId = deviceId || null;
        
        try {
            // Stop current stream
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
            }
            
            // Reinitialize with new camera
            await this.initializeMedia();
            
            console.log('Switched to camera:', deviceId || 'default');
        } catch (error) {
            console.error('Error changing camera:', error);
            alert('Failed to switch camera: ' + error.message);
        }
    }

    // Text-to-Speech methods
    async loadTTSConfig() {
        try {
            const config = await ipcRenderer.invoke('tts-get-config');
            this.ttsEnabled = config.enabled;
            this.ttsVoice = config.voice;
        } catch (error) {
            console.error('Error loading TTS config:', error);
        }
    }

    async speak(text, options = {}) {
        if (!this.ttsEnabled) return;
        
        // Check if this is a Q&A question that should be transcribed
        const isQAQuestion = options.isQAQuestion === true;
        
        try {
            // Check if this is a phrase that has pregenerated audio
            const pregeneratedFile = this.getPregeneratedAudioFile(text);
            if (pregeneratedFile) {
                await this.playPregeneratedAudio(pregeneratedFile, text, isQAQuestion);
                return;
            }
            
            // Pause transcription during TTS to avoid capturing our own speech (except for Q&A questions)
            const wasTranscribing = this.isTranscribing;
            if (wasTranscribing && !isQAQuestion) {
                this.pauseTranscription();
            }
            
            this.isTTSSpeaking = true;
            await ipcRenderer.invoke('tts-speak', text, options);
            this.isTTSSpeaking = false;
            
            // Resume transcription after TTS completes (if we paused it)
            if (wasTranscribing && !isQAQuestion) {
                // Wait a brief moment for audio to clear, then resume
                setTimeout(() => {
                    this.resumeTranscription();
                }, 500);
            }
        } catch (error) {
            console.error('TTS Error:', error);
            this.isTTSSpeaking = false;
        }
    }

    getPregeneratedAudioFile(text) {
        // Map specific phrases to their pregenerated audio files
        const pregeneratedPhrases = {
            'starting demo phase. 2 minutes on the clock.': 'start_demo.wav',
            'starting demo phase, recording 2 minutes on the clock': 'start_demo.wav',
            'starting question phase': 'start_questions.wav',
            'starting questions phase': 'start_questions.wav',
            'now starting questions phase. 2 minutes on the clock.': 'start_questions.wav',
            'twenty seconds remaining': 'twenty_seconds_warning.wav',
            'demo phase complete. time is up!': 'demo_complete.wav',
            'questions phase complete. time is up! thank you for an awesome demo!': 'questions_complete.wav',
            'let me think about the first question for you...': 'thinking_question.wav'
        };
        
        // Normalize the text for comparison (lowercase, remove extra spaces)
        const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();
        
        return pregeneratedPhrases[normalizedText] || null;
    }

    async playPregeneratedAudio(filename, originalText = '', isQAQuestion = false) {
        try {
            // Pause transcription during audio playback to avoid capturing our own speech (except for Q&A questions)
            const wasTranscribing = this.isTranscribing;
            if (wasTranscribing && !isQAQuestion) {
                this.pauseTranscription();
            }
            
            this.isTTSSpeaking = true;
            await ipcRenderer.invoke('play-pregenerated-audio', filename);
            this.isTTSSpeaking = false;
            
            // Resume transcription after audio completes (if we paused it)
            if (wasTranscribing && !isQAQuestion) {
                // Wait a brief moment for audio to clear, then resume
                setTimeout(() => {
                    this.resumeTranscription();
                }, 500);
            }
        } catch (error) {
            console.error('Error playing pregenerated audio:', error);
            this.isTTSSpeaking = false;
            // Fallback to regular TTS if pregenerated audio fails
            if (originalText) {
                await this.speak(originalText, { isQAQuestion });
            }
        }
    }

    async previewVoice(voiceName) {
        if (!voiceName) return;
        
        try {
            // Temporarily use the selected voice for preview
            const originalVoice = this.ttsVoice;
            this.ttsVoice = voiceName;
            
            // Speak a sample phrase with the selected voice
            await this.speak(`Hello, this is the ${voiceName} voice.`, { voice: voiceName });
            
            // Restore original voice (in case user doesn't save)
            this.ttsVoice = originalVoice;
        } catch (error) {
            console.error('Voice preview error:', error);
        }
    }

    async setTTSConfig(config) {
        try {
            await ipcRenderer.invoke('tts-set-config', config);
            this.ttsEnabled = config.enabled !== false;
            this.ttsVoice = config.voice || 'Samantha';
        } catch (error) {
            console.error('Error setting TTS config:', error);
        }
    }

    async startRecording() {
        if (!this.mediaStream) {
            alert('Media stream not available. Please check camera and microphone permissions.');
            return;
        }

        try {
            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(this.mediaStream, {
                mimeType: 'video/webm; codecs=vp9'
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.saveRecording();
            };

            // Determine the current phase for filename
            this.currentRecordingPhase = this.currentPhase === 'ready' ? 'demo' : this.currentPhase;
            
            this.mediaRecorder.start();
            this.isRecording = true;
            this.updateRecordingStatus();
            

        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Failed to start recording: ' + error.message);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.updateRecordingStatus();
            
        }
    }

    updateRecordingStatus() {
        if (this.isRecording) {
            this.elements.recordingIndicator.classList.add('recording');
            this.elements.recordingStatus.textContent = 'Recording...';
        } else {
            this.elements.recordingIndicator.classList.remove('recording');
            this.elements.recordingStatus.textContent = 'Ready to Start Demo';
        }
    }

    // Master recording toggle - starts/stops everything together
    async toggleMasterRecording() {
        if (!this.isRecording && this.currentPhase === 'ready') {
            // Start everything: timer, video recording, and transcription
            await this.startMasterRecording();
        } else if (this.isRecording) {
            // Stop everything if currently recording
            await this.stopMasterRecording();
        } else if (this.currentPhase === 'completed') {
            // Reset to ready state after completion, then start new demo
            this.resetTimer();
            this.clearTranscript();
            await this.startMasterRecording();
        } else {
            // Stop everything for any other state
            await this.stopMasterRecording();
        }
    }

    async startMasterRecording() {
        if (!this.whisperReady) {
            alert('Local Whisper model not ready. Please check Settings for model status.');
            return;
        }

        if (!this.mediaStream) {
            alert('Media stream not available. Please check camera and microphone permissions.');
            return;
        }

        try {
            // Start timer
            this.startTimer();
            
            // Start video recording
            await this.startRecording();
            
            // Start transcription
            await this.startTranscription();
            
            // Update UI
            this.elements.recordIcon.textContent = '■';
            this.elements.recordText.textContent = 'Stop Demo';
            this.elements.masterRecordBtn.classList.remove('btn-record');
            this.elements.masterRecordBtn.classList.add('btn-stop');
            
        } catch (error) {
            console.error('Error starting master recording:', error);
            alert('Failed to start recording: ' + error.message);
        }
    }

    async stopMasterRecording() {
        try {
            // Stop transcription
            this.stopTranscription();
            
            // Stop video recording
            this.stopRecording();
            
            // Complete timer session
            this.completeSession();
            
            // Update UI
            this.elements.recordIcon.textContent = '●';
            this.elements.recordText.textContent = 'Start Demo';
            this.elements.masterRecordBtn.classList.remove('btn-stop');
            this.elements.masterRecordBtn.classList.add('btn-record');
            
        } catch (error) {
            console.error('Error stopping master recording:', error);
        }
    }

    generateTranscriptText() {
        if (this.allTranscriptMessages.length === 0) {
            return 'No transcript available for this demo.';
        }

        const transcriptLines = ['Demo Transcript', '='.repeat(50), ''];
        
        this.allTranscriptMessages.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleString();
            transcriptLines.push(`[${time}] (${msg.phase.toUpperCase()})`);
            transcriptLines.push(msg.text);
            transcriptLines.push('');
        });
        
        return transcriptLines.join('\n');
    }

    async saveRecording() {
        if (this.recordedChunks.length === 0) return;

        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `demo-${this.currentRecordingPhase}-${timestamp}.webm`;

        try {
            const buffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);
            
            // Generate transcript text
            const transcriptData = this.generateTranscriptText();
            
            const result = await ipcRenderer.invoke('save-recording', filename, uint8Array, transcriptData);
            console.log('Recording and transcript saved to:', result.demoFolder);
            
            // Show success message
            const originalText = this.elements.recordingStatus.textContent;
            this.elements.recordingStatus.textContent = 'Recording & transcript saved';
            setTimeout(() => {
                this.elements.recordingStatus.textContent = originalText;
            }, 3000);
            
        } catch (error) {
            console.error('Error saving recording:', error);
            alert('Failed to save recording: ' + error.message);
        }
    }

    // Override resetTimer to stop recording if active
    resetTimer() {
        if (this.isRecording) {
            this.stopRecording();
        }
        
        clearInterval(this.timer);
        this.currentPhase = 'ready';
        this.phaseIndex = -1;
        this.timeRemaining = 0;
        this.totalTime = 0;
        this.isPaused = false;

        this.elements.pauseBtn.disabled = true;
        this.elements.pauseBtn.textContent = 'Pause';
        this.elements.nextPhaseBtn.disabled = true;

        this.updateDisplay();
    }

    // Override completeSession to stop recording if active
    async completeSession() {
        if (this.isRecording) {
            this.stopRecording();
        }
        if (this.isTranscribing) {
            this.stopTranscription();
        }
        
        clearInterval(this.timer);
        this.currentPhase = 'completed';
        this.elements.currentPhase.textContent = 'Demo Complete!';
        this.elements.timeRemaining.textContent = '00:00';
        this.elements.progressFill.style.width = '100%';
        
        // Announce demo completion and time is up (only once)
        if (!this.sessionCompleteAnnouncementMade) {
            this.sessionCompleteAnnouncementMade = true;
            await this.speak('Demo complete! Time is up!');
        }
        
        this.elements.pauseBtn.disabled = true;
        this.elements.nextPhaseBtn.disabled = true;
    }

    // Transcription methods

    async checkWhisperStatus() {
        try {
            const status = await ipcRenderer.invoke('check-whisper-ready');
            this.whisperReady = status.ready;
            
            if (this.elements.whisperStatusText) {
                if (status.ready) {
                    this.elements.whisperStatusText.textContent = '✅ Model ready for transcription';
                    this.elements.whisperStatus.className = 'whisper-status ready';
                } else {
                    this.elements.whisperStatusText.textContent = '❌ Model not found - check console for setup';
                    this.elements.whisperStatus.className = 'whisper-status not-ready';
                }
            }
            
            this.updateTranscriptPlaceholder();
        } catch (error) {
            console.error('Failed to check Whisper status:', error);
            this.whisperReady = false;
            if (this.elements.whisperStatusText) {
                this.elements.whisperStatusText.textContent = '❌ Error checking model status';
                this.elements.whisperStatus.className = 'whisper-status error';
            }
        }
    }

    async startTranscription() {
        if (!this.whisperReady) {
            alert('Local Whisper model not ready. Please check the console for download instructions.');
            return;
        }

        try {
            // Use the same media stream as video recording for audio
            if (!this.mediaStream) {
                await this.initializeMedia();
            }

            // Create audio-only stream for transcription
            this.transcriptionStream = new MediaStream();
            const audioTrack = this.mediaStream.getAudioTracks()[0];
            if (audioTrack) {
                this.transcriptionStream.addTrack(audioTrack);
            }

            this.transcriptionRecorder = new MediaRecorder(this.transcriptionStream, {
                mimeType: 'audio/webm'
            });

            this.transcriptionRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.transcriptionChunks.push(event.data);
                }
            };

            this.transcriptionRecorder.onstop = () => {
                this.processTranscription();
            };

            // Record in 5-second intervals for real-time transcription
            this.transcriptionRecorder.start();
            this.transcriptionInterval = setInterval(() => {
                if (this.isTranscribing && !this.transcriptionPaused && this.transcriptionRecorder.state === 'recording') {
                    this.transcriptionRecorder.stop();
                    setTimeout(() => {
                        if (this.isTranscribing && !this.transcriptionPaused) {
                            this.transcriptionRecorder.start();
                        }
                    }, 100);
                }
            }, 5000);

            this.isTranscribing = true;

        } catch (error) {
            console.error('Error starting transcription:', error);
            alert('Failed to start transcription: ' + error.message);
        }
    }

    stopTranscription() {
        if (this.transcriptionRecorder && this.isTranscribing) {
            clearInterval(this.transcriptionInterval);
            this.transcriptionRecorder.stop();
            this.isTranscribing = false;
            this.transcriptionPaused = false;
        }
    }

    pauseTranscription() {
        if (this.transcriptionRecorder && this.isTranscribing) {
            clearInterval(this.transcriptionInterval);
            if (this.transcriptionRecorder.state === 'recording') {
                this.transcriptionRecorder.stop();
            }
            this.transcriptionPaused = true;
        }
    }

    resumeTranscription() {
        if (this.transcriptionPaused && this.isTranscribing) {
            this.transcriptionPaused = false;
            
            // Restart the recording cycle
            if (this.transcriptionRecorder.state === 'inactive') {
                this.transcriptionRecorder.start();
            }
            
            this.transcriptionInterval = setInterval(() => {
                if (this.isTranscribing && !this.transcriptionPaused && this.transcriptionRecorder.state === 'recording') {
                    this.transcriptionRecorder.stop();
                    setTimeout(() => {
                        if (this.isTranscribing && !this.transcriptionPaused) {
                            this.transcriptionRecorder.start();
                        }
                    }, 100);
                }
            }, 5000);
        }
    }

    async processTranscription() {
        if (this.transcriptionChunks.length === 0) return;

        const blob = new Blob(this.transcriptionChunks, { type: 'audio/webm' });
        this.transcriptionChunks = [];

        try {
            const buffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);
            const text = await ipcRenderer.invoke('transcribe-audio', uint8Array);
            
            if (text && text.trim()) {
                this.addTranscriptMessage(text.trim());
            }
        } catch (error) {
            console.error('Error processing transcription:', error);
        }
    }

    addTranscriptMessage(text) {
        const timestamp = new Date().toLocaleTimeString();
        const fullTimestamp = new Date().toISOString();
        const messageElement = document.createElement('div');
        messageElement.className = 'transcript-message';
        messageElement.innerHTML = `
            <div class="transcript-timestamp">${timestamp}</div>
            <div class="transcript-text">${text}</div>
        `;

        // Store all transcript messages with full timestamps
        this.allTranscriptMessages.push({
            timestamp: fullTimestamp,
            phase: this.currentPhase,
            text: text
        });

        // If we're in demo phase, save this message for question generation
        if (this.currentPhase === 'demo') {
            this.demoTranscriptMessages.push(text);
        }

        const container = this.elements.transcriptMessages;

        // Remove placeholder if it exists
        const placeholder = container.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        container.appendChild(messageElement);

        // Always auto-scroll to the bottom when new message is added
        // Use multiple approaches to ensure scrolling works reliably
        this.scrollToBottom(container);
    }

    scrollToBottom(container) {
        // Try immediate scroll first
        container.scrollTop = container.scrollHeight;
        
        // Also try with setTimeout to handle any DOM updates
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 0);
        
        // And try using scrollIntoView on the last element as a fallback
        setTimeout(() => {
            const lastMessage = container.lastElementChild;
            if (lastMessage) {
                lastMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }, 10);
    }

    clearTranscript() {
        this.elements.transcriptMessages.innerHTML = `
            <div class="transcript-placeholder">
                <p>Speech-to-text will appear here during recording</p>
                ${!this.whisperReady ? '<p class="api-key-prompt">Local Whisper model loading... Check console for setup instructions</p>' : ''}
            </div>
        `;
    }


    updateTranscriptPlaceholder() {
        if (!this.elements.transcriptMessages.querySelector('.transcript-message')) {
            this.clearTranscript();
        }
    }

    // Override resetTimer to stop transcription if active
    resetTimer() {
        if (this.isRecording) {
            this.stopRecording();
        }
        if (this.isTranscribing) {
            this.stopTranscription();
        }
        
        clearInterval(this.timer);
        this.currentPhase = 'ready';
        this.phaseIndex = -1;
        this.timeRemaining = this.settings.demoTime; // Show user-defined demo time
        this.totalTime = 0;
        this.isPaused = false;

        this.elements.pauseBtn.disabled = true;
        this.elements.pauseBtn.textContent = 'Pause';
        this.elements.nextPhaseBtn.disabled = true;

        // Clear demo transcript messages on reset
        this.demoTranscriptMessages = [];
        this.allTranscriptMessages = [];
        
        // Reset question generation state
        this.earlyQuestionGenerated = false;
        this.earlyQuestionResult = null;
        this.questionGenerationStarted = false;
        this.pregeneratedQuestionAudio = null;
        
        // Reset warning state
        this.twentySecondWarningGiven = false;
        
        // Clear auto-transition
        this.clearAutoTransition();
        
        // Reset completion announcement flag
        this.sessionCompleteAnnouncementMade = false;

        // Reset UI to show "Start Demo" button
        this.elements.recordIcon.textContent = '●';
        this.elements.recordText.textContent = 'Start Demo';
        this.elements.masterRecordBtn.classList.remove('btn-stop');
        this.elements.masterRecordBtn.classList.add('btn-record');

        // Hide question display on reset
        this.dismissQuestion();

        this.updateDisplay();
    }

    async generateQuestion() {
        try {
            // Collect demo phase transcript
            const demoTranscript = this.collectDemoTranscript();
            
            console.log('Demo-only transcript collected:', demoTranscript);
            console.log('Demo transcript length:', demoTranscript.length, 'characters from', this.demoTranscriptMessages.length, 'messages');
            
            if (!demoTranscript || demoTranscript.trim().length === 0) {
                console.log('No transcript available for question generation - using fallback');
                const fallbackQuestions = [
                    "Great work! What's the biggest challenge you faced building this?",
                    "Impressive demo! How would you scale this to handle 10x more users?",
                    "Nice implementation! What's your most controversial design decision here?"
                ];
                const randomQuestion = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
                return {
                    success: true,
                    question: randomQuestion,
                    fallback: true
                };
            }

            console.log('Generating question based on demo transcript:', demoTranscript.substring(0, 100) + '...');
            
            // Generate question using Ollama API
            const result = await ipcRenderer.invoke('generate-question', demoTranscript);
            
            console.log('Question generation result:', result);
            
            return result;
        } catch (error) {
            console.error('Error generating question:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async startEarlyQuestionGeneration() {
        if (this.earlyQuestionGenerated) return;
        
        console.log('Starting early question generation at 1 minute mark...');
        
        try {
            // Generate question in background without blocking
            this.earlyQuestionResult = await this.generateQuestion();
            
            // Also generate audio for the question if successful
            if (this.earlyQuestionResult && this.earlyQuestionResult.success && this.earlyQuestionResult.question) {
                console.log('Generating audio for question...');
                try {
                    const audioResult = await ipcRenderer.invoke('generate-question-audio', this.earlyQuestionResult.question);
                    if (audioResult.success) {
                        this.pregeneratedQuestionAudio = audioResult.filename;
                        console.log('Question audio generated:', this.pregeneratedQuestionAudio);
                    }
                } catch (audioError) {
                    console.warn('Failed to generate question audio, will use TTS fallback:', audioError);
                    this.pregeneratedQuestionAudio = null;
                }
            }
            
            this.earlyQuestionGenerated = true;
            console.log('Early question generated successfully:', this.earlyQuestionResult);
        } catch (error) {
            console.error('Early question generation failed:', error);
            this.earlyQuestionResult = null;
            this.pregeneratedQuestionAudio = null;
        }
    }

    async generateAndShowQuestion() {
        try {
            let result;
            
            // Use pre-generated question if available, otherwise generate new one
            if (this.earlyQuestionGenerated && this.earlyQuestionResult) {
                console.log('Using pre-generated question from early generation');
                result = this.earlyQuestionResult;
            } else {
                console.log('No pre-generated question available, generating new one...');
                result = await this.generateQuestion();
                
                // Generate audio for the new question
                if (result && result.success && result.question) {
                    console.log('Generating audio for new question...');
                    try {
                        const audioResult = await ipcRenderer.invoke('generate-question-audio', result.question);
                        if (audioResult.success) {
                            this.pregeneratedQuestionAudio = audioResult.filename;
                            console.log('New question audio generated:', this.pregeneratedQuestionAudio);
                        }
                    } catch (audioError) {
                        console.warn('Failed to generate new question audio, will use TTS fallback:', audioError);
                        this.pregeneratedQuestionAudio = null;
                    }
                }
            }
            
            if (result && result.success && result.question) {
                // Display the question
                this.showQuestion(result.question, result.fallback);
                
                // Voice the question using pregenerated audio if available
                await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
                
                if (this.pregeneratedQuestionAudio) {
                    console.log('Using question audio:', this.pregeneratedQuestionAudio);
                    try {
                        await this.playPregeneratedAudio(this.pregeneratedQuestionAudio, result.question, true);
                        // Clean up the audio file after use
                        this.cleanupQuestionAudio();
                    } catch (error) {
                        console.warn('Failed to play question audio, falling back to TTS:', error);
                        await this.speak(result.question, { isQAQuestion: true });
                    }
                } else {
                    await this.speak(result.question, { isQAQuestion: true });
                }
            } else {
                console.error('Question generation failed:', result);
            }
        } catch (error) {
            console.error('Error generating question:', error);
        }
    }

    collectDemoTranscript() {
        // Use only the messages captured during demo phase
        return this.demoTranscriptMessages.join(' ').trim();
    }

    showQuestion(question, isFallback = false) {
        this.elements.generatedQuestion.textContent = question;
        this.elements.questionSource.textContent = isFallback ? 
            'Generated by fallback (Ollama not available)' : 
            'Generated by AI based on demo transcript';
        this.elements.questionDisplay.style.display = 'block';
    }

    async readQuestion() {
        const questionText = this.elements.generatedQuestion.textContent;
        if (questionText && questionText.trim()) {
            try {
                await this.speak(questionText, { isQAQuestion: true });
            } catch (error) {
                console.error('Error reading question:', error);
            }
        }
    }

    dismissQuestion() {
        this.elements.questionDisplay.style.display = 'none';
    }

    cleanupQuestionAudio() {
        // Reset the pregenerated audio filename after use
        // The actual file cleanup will be handled by the main process if needed
        this.pregeneratedQuestionAudio = null;
    }

    async give20SecondWarning() {
        console.log('Giving 20-second warning');
        try {
            await this.speak('Twenty seconds remaining');
        } catch (error) {
            console.error('Error giving 20-second warning:', error);
        }
    }

    setupAutoTransition() {
        // Clear any existing timeout
        if (this.autoTransitionTimeout) {
            clearTimeout(this.autoTransitionTimeout);
        }
        
        console.log('Setting up auto-transition to Q&A in 10 seconds');
        
        // Set up 10-second auto-transition to Q&A
        this.autoTransitionTimeout = setTimeout(() => {
            if (this.currentPhase === 'demo' && this.isOvertime && !this.autoTransitionTriggered) {
                console.log('Auto-transitioning to Q&A after 10 seconds of demo overtime');
                this.autoTransitionTriggered = true;
                this.nextPhase().catch(console.error);
            }
        }, 10000); // 10 seconds
    }

    clearAutoTransition() {
        if (this.autoTransitionTimeout) {
            clearTimeout(this.autoTransitionTimeout);
            this.autoTransitionTimeout = null;
        }
        this.autoTransitionTriggered = false;
    }

    startTimeEdit(phase) {
        // Don't allow editing during active timer
        if (this.currentPhase !== 'ready' && this.currentPhase !== 'completed') {
            return;
        }

        const displayElement = phase === 'demo' ? this.elements.demoTimeDisplay : this.elements.qaTimeDisplay;
        const inputElement = phase === 'demo' ? this.elements.demoTimeInput : this.elements.qaTimeInput;
        const timeEditor = displayElement.parentElement;
        
        // Get current time in minutes
        const currentSeconds = phase === 'demo' ? this.settings.demoTime : this.settings.qaTime;
        const currentMinutes = Math.floor(currentSeconds / 60);
        
        // Show input, hide display
        displayElement.style.display = 'none';
        inputElement.style.display = 'inline-block';
        timeEditor.querySelector('.time-unit').style.display = 'inline';
        
        // Set input value and focus
        inputElement.value = currentMinutes;
        inputElement.focus();
        inputElement.select();
        
        // Add editing class for visual feedback
        timeEditor.classList.add('editing');
    }

    finishTimeEdit(phase) {
        const displayElement = phase === 'demo' ? this.elements.demoTimeDisplay : this.elements.qaTimeDisplay;
        const inputElement = phase === 'demo' ? this.elements.demoTimeInput : this.elements.qaTimeInput;
        const timeEditor = displayElement.parentElement;
        
        // Get new value
        const newMinutes = parseInt(inputElement.value) || 1;
        const clampedMinutes = Math.max(1, Math.min(60, newMinutes)); // Clamp between 1-60
        
        // Update settings
        const newSeconds = clampedMinutes * 60;
        if (phase === 'demo') {
            this.settings.demoTime = newSeconds;
        } else {
            this.settings.qaTime = newSeconds;
        }
        
        // Auto-save
        this.autoSaveSettings();
        
        // Update display
        this.updateTimeDisplays();
        
        // Hide input, show display
        inputElement.style.display = 'none';
        timeEditor.querySelector('.time-unit').style.display = 'none';
        displayElement.style.display = 'inline';
        
        // Remove editing class
        timeEditor.classList.remove('editing');
    }

    handleTimeEditKeydown(event, phase) {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.finishTimeEdit(phase);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            // Cancel edit without saving
            const displayElement = phase === 'demo' ? this.elements.demoTimeDisplay : this.elements.qaTimeDisplay;
            const inputElement = phase === 'demo' ? this.elements.demoTimeInput : this.elements.qaTimeInput;
            const timeEditor = displayElement.parentElement;
            
            inputElement.style.display = 'none';
            timeEditor.querySelector('.time-unit').style.display = 'none';
            displayElement.style.display = 'inline';
            timeEditor.classList.remove('editing');
        }
    }

    async autoSaveSettings() {
        try {
            await ipcRenderer.invoke('save-settings', this.settings);
            console.log('Settings auto-saved');
            
            // Update settings form if it's open
            this.updateSettingsInputs();
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DemoModerator();
});