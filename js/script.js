

/**
 * Begena Web Simulator
 * Native Web Audio API Synthesizer with Gizit Buzzing Overtones & Audio Recorder
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. STATE MANAGEMENT & GLOBALS
    // ==========================================
    let audioCtx = null;
    let masterGain = null;
    let reverbGain = null;
    let bassFilter = null;
    let trebleFilter = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let audioBlobUrl = null;
    
    let isMuted = false;
    let isRecording = false;
    let metronomeInterval = null;
    let isMetronomeOn = false;
    let demoInterval = null;
    let isDemoRunning = false;
    let pitchOffsetSemitones = 0;

    // Begena 10-String Pentatonic Scale Frequencies (Base Hz)
    const BASE_FREQUENCIES = [
        110.00, // String 1: A2
        123.47, // String 2: B2
        138.59, // String 3: C#3
        164.81, // String 4: E3
        185.00, // String 5: F#3
        220.00, // String 6: A3
        246.94, // String 7: B3
        277.18, // String 8: C#3
        329.63, // String 9: E3
        369.99  // String 10: F#3
    ];

    const KEY_MAPPINGS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

    // DOM Elements
    const stringsWrapper = document.getElementById('strings-wrapper');
    const visualizerCanvas = document.getElementById('visualizer-canvas');
    const canvasCtx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;

    // UI Inputs & Controls
    const themeSelector = document.getElementById('theme-selector');
    const masterVolInput = document.getElementById('master-volume');
    const reverbInput = document.getElementById('reverb-level');
    const bassInput = document.getElementById('eq-bass');
    const trebleInput = document.getElementById('treble-level') || document.getElementById('eq-treble');
    const muteBtn = document.getElementById('mute-btn');
    const animCheckbox = document.getElementById('toggle-animations');

    const tuneDownBtn = document.getElementById('tune-down');
    const tuneResetBtn = document.getElementById('tune-reset');
    const tuneUpBtn = document.getElementById('tune-up');
    const octaveShiftInput = document.getElementById('octave-shift');

    const recordBtn = document.getElementById('record-btn');
    const stopBtn = document.getElementById('stop-btn');
    const playbackBtn = document.getElementById('playback-btn');
    const downloadBtn = document.getElementById('download-btn');
    const clearRecBtn = document.getElementById('clear-rec-btn');

    const metronomeToggle = document.getElementById('metronome-toggle');
    const metronomeTempo = document.getElementById('metronome-tempo');
    const demoBtn = document.getElementById('demo-btn');
    const randomMelodyBtn = document.getElementById('random-melody-btn');

    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mainNav = document.getElementById('main-nav');
    const togglePanelBtn = document.getElementById('toggle-panel-btn');
    const controlPanel = document.getElementById('control-panel');

    // ==========================================
    // 2. AUDIO ENGINE INITIALIZATION (WEB AUDIO API)
    // ==========================================
    function initAudioEngine() {
        if (audioCtx) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();

        // Master Gain
        masterGain = audioCtx.createGain();
        masterGain.gain.value = parseFloat(masterVolInput ? masterVolInput.value : 0.7);

        // EQ Filters
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 250;
        bassFilter.gain.value = parseFloat(bassInput ? bassInput.value : 4);

        trebleFilter = audioCtx.createBiquadFilter();
        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 2000;
        trebleFilter.gain.value = parseFloat(trebleInput ? trebleInput.value : -2);

        // Reverb / Buzz Simulation Gain Node
        reverbGain = audioCtx.createGain();
        reverbGain.gain.value = parseFloat(reverbInput ? reverbInput.value : 0.5);

        // Signal Routing: Master -> EQ Bass -> EQ Treble -> Destination
        masterGain.connect(bassFilter);
        bassFilter.connect(trebleFilter);
        trebleFilter.connect(audioCtx.destination);

        startVisualizer();
    }

    // ==========================================
    // 3. SOUND SYNTHESIS & BUZZ (GIZIT) SIMULATION
    // ==========================================
    function playStringSound(index) {
        initAudioEngine();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;
        const octaveShift = parseInt(octaveShiftInput ? octaveShiftInput.value : 0, 10);
        const totalSemitones = pitchOffsetSemitones + (octaveShift * 12);
        
        // Calculate adjusted pitch
        const baseFreq = BASE_FREQUENCIES[index];
        const targetFreq = baseFreq * Math.pow(2, totalSemitones / 12);

        // Primary Oscillator (Sawtooth gives rich harmonics)
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(targetFreq, now);

        // Gizit Buzz Oscillator (Slightly detuned for signature buzz)
        const buzzOsc = audioCtx.createOscillator();
        buzzOsc.type = 'triangle';
        buzzOsc.frequency.setValueAtTime(targetFreq * 2.01, now);

        // Sub-envelope for string decay
        const noteGain = audioCtx.createGain();
        noteGain.gain.setValueAtTime(0.8, now);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);

        // Lowpass filter to mimic warm wooden body dampening
        const lowpass = audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(800, now);
        lowpass.frequency.exponentialRampToValueAtTime(180, now + 3.0);

        // Connect Oscillators
        osc.connect(lowpass);
        buzzOsc.connect(lowpass);
        lowpass.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(now);
        buzzOsc.start(now);
        osc.stop(now + 3.6);
        buzzOsc.stop(now + 3.6);

        // Trigger visual effect on UI string
        triggerStringAnimation(index);
    }

    // ==========================================
    // 4. UI STRING GENERATION & INTERACTION
    // ==========================================
    function buildStringsUI() {
        if (!stringsWrapper) return;
        stringsWrapper.innerHTML = '';

        for (let i = 0; i < 10; i++) {
            const track = document.createElement('div');
            track.className = 'begena-string-track';
            track.dataset.index = i;

            // Vary string thickness from thickest (bass) to thinnest
            const thickness = 4.5 - (i * 0.25);
            
            const stringElem = document.createElement('div');
            stringElem.className = 'string-element';
            stringElem.style.setProperty('--string-thickness', `${thickness}px`);

            const badge = document.createElement('div');
            badge.className = 'string-badge';
            badge.innerText = KEY_MAPPINGS[i];

            track.appendChild(stringElem);
            track.appendChild(badge);

            // Click & Pointer Events
            track.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                playStringSound(i);
            });

            // Touch Swipe Playability
            track.addEventListener('pointerenter', (e) => {
                if (e.buttons === 1) { // Left click or drag active
                    playStringSound(i);
                }
            });

            stringsWrapper.appendChild(track);
        }
    }

    function triggerStringAnimation(index) {
        if (animCheckbox && !animCheckbox.checked) return;

        const tracks = stringsWrapper.querySelectorAll('.begena-string-track');
        if (!tracks[index]) return;

        const track = tracks[index];
        track.classList.add('vibrating');

        // Add ripple animation
        const ripple = document.createElement('div');
        ripple.className = 'string-ripple-effect';
        track.appendChild(ripple);

        setTimeout(() => {
            track.classList.remove('vibrating');
            if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
        }, 600);
    }

    // ==========================================
    // 5. AUDIO RECORDING & WEBM EXPORT
    // ==========================================
    function startRecording() {
        initAudioEngine();
        recordedChunks = [];

        const dest = audioCtx.createMediaStreamDestination();
        masterGain.connect(dest);

        mediaRecorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });

        mediaRecorder.ondataavailable = (evt) => {
            if (evt.data.size > 0) {
                recordedChunks.push(evt.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
            audioBlobUrl = URL.createObjectURL(blob);

            if (playbackBtn) playbackBtn.disabled = false;
            if (downloadBtn) downloadBtn.disabled = false;
            if (clearRecBtn) clearRecBtn.disabled = false;
        };

        mediaRecorder.start();
        isRecording = true;

        if (recordBtn) {
            recordBtn.classList.add('recording');
            recordBtn.innerText = '● Recording...';
            recordBtn.disabled = true;
        }
        if (stopBtn) stopBtn.disabled = false;
    }

    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;

            if (recordBtn) {
                recordBtn.classList.remove('recording');
                recordBtn.innerText = '● Record';
                recordBtn.disabled = false;
            }
            if (stopBtn) stopBtn.disabled = true;
        }
    }

    function downloadAudio() {
        if (!audioBlobUrl) return;
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = audioBlobUrl;
        a.download = `Begena_Performance_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
        }, 100);
    }

    // ==========================================
    // 6. VISUALIZER CANVAS
    // ==========================================
    function startVisualizer() {
        if (!visualizerCanvas || !canvasCtx || !audioCtx) return;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        masterGain.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function renderFrame() {
            requestAnimationFrame(renderFrame);
            analyser.getByteFrequencyData(dataArray);

            canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

            const barWidth = (visualizerCanvas.width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * visualizerCanvas.height;
                canvasCtx.fillStyle = `rgba(252, 209, 22, ${dataArray[i] / 255 * 0.4})`;
                canvasCtx.fillRect(x, visualizerCanvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        }
        renderFrame();
    }

    // ==========================================
    // 7. NAVIGATION & SECTION SWITCHING
    // ==========================================
    const navButtons = document.querySelectorAll('.nav-btn, .action-trigger');
    const sections = document.querySelectorAll('.content-section');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            
            sections.forEach(sec => {
                if (sec.id === targetId) {
                    sec.classList.add('active');
                } else {
                    sec.classList.remove('active');
                }
            });

            document.querySelectorAll('.nav-btn').forEach(nb => {
                nb.classList.toggle('active', nb.getAttribute('data-target') === targetId);
            });

            // Close mobile menu if open
            if (hamburgerBtn && mainNav) {
                hamburgerBtn.classList.remove('open');
                mainNav.classList.remove('open');
            }
        });
    });

    // ==========================================
    // 8. RESPONSIVE MOBILE TOGGLES
    // ==========================================
    // Hamburger Navigation Menu Toggle
    if (hamburgerBtn && mainNav) {
        hamburgerBtn.addEventListener('click', () => {
            hamburgerBtn.classList.toggle('open');
            mainNav.classList.toggle('open');
        });
    }

    // Collapsible Simulator Control Panel Toggle
    if (togglePanelBtn && controlPanel) {
        togglePanelBtn.addEventListener('click', () => {
            controlPanel.classList.toggle('open');
            if (controlPanel.classList.contains('open')) {
                togglePanelBtn.innerText = '✕ Hide Controls';
            } else {
                togglePanelBtn.innerText = '⚙ Controls & Tuning Panel';
            }
        });
    }

    // ==========================================
    // 9. HARDWARE KEYBOARD LISTENERS
    // ==========================================
    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const keyIndex = KEY_MAPPINGS.indexOf(e.key);
        if (keyIndex !== -1) {
            playStringSound(keyIndex);
        }
    });

    // ==========================================
    // 10. CONTROL PANEL EVENT BINDINGS
    // ==========================================
    if (themeSelector) {
        themeSelector.addEventListener('change', (e) => {
            document.body.setAttribute('data-theme', e.target.value);
        });
    }

    if (masterVolInput) {
        masterVolInput.addEventListener('input', (e) => {
            if (masterGain) masterGain.gain.value = parseFloat(e.target.value);
        });
    }

    if (reverbInput) {
        reverbInput.addEventListener('input', (e) => {
            if (reverbGain) reverbGain.gain.value = parseFloat(e.target.value);
        });
    }

    if (bassInput) {
        bassInput.addEventListener('input', (e) => {
            if (bassFilter) bassFilter.gain.value = parseFloat(e.target.value);
        });
    }

    if (trebleInput) {
        trebleInput.addEventListener('input', (e) => {
            if (trebleFilter) trebleFilter.gain.value = parseFloat(e.target.value);
        });
    }

    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            isMuted = !isMuted;
            if (masterGain) {
                masterGain.gain.value = isMuted ? 0 : parseFloat(masterVolInput.value);
            }
            muteBtn.innerText = isMuted ? 'Unmute Audio' : 'Mute Audio';
        });
    }

    if (tuneDownBtn) {
        tuneDownBtn.addEventListener('click', () => { pitchOffsetSemitones--; });
    }
    if (tuneResetBtn) {
        tuneResetBtn.addEventListener('click', () => { pitchOffsetSemitones = 0; });
    }
    if (tuneUpBtn) {
        tuneUpBtn.addEventListener('click', () => { pitchOffsetSemitones++; });
    }

    // Recorder Bindings
    if (recordBtn) recordBtn.addEventListener('click', startRecording);
    if (stopBtn) stopBtn.addEventListener('click', stopRecording);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadAudio);
    if (playbackBtn) {
        playbackBtn.addEventListener('click', () => {
            if (audioBlobUrl) {
                const audio = new Audio(audioBlobUrl);
                audio.play();
            }
        });
    }
    if (clearRecBtn) {
        clearRecBtn.addEventListener('click', () => {
            audioBlobUrl = null;
            recordedChunks = [];
            if (playbackBtn) playbackBtn.disabled = true;
            if (downloadBtn) downloadBtn.disabled = true;
            if (clearRecBtn) clearRecBtn.disabled = true;
        });
    }

    // Generative Melodies
    if (randomMelodyBtn) {
        randomMelodyBtn.addEventListener('click', () => {
            const sequence = [0, 2, 3, 5, 7, 5, 3, 2, 0];
            sequence.forEach((stringIdx, i) => {
                setTimeout(() => {
                    playStringSound(stringIdx);
                }, i * 350);
            });
        });
    }

    // Initialize UI Component Structure
    buildStringsUI();
});