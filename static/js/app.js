/**
 * App.js - Main Application Controller with Bulletproof Mode Switching
 */

document.addEventListener('DOMContentLoaded', () => {
    // Mode Switcher Buttons
    const tabFreeTrack = document.getElementById('tabFreeTrack');
    const tabChallengeGame = document.getElementById('tabChallengeGame');
    
    // Stage Controls
    const toggleCamBtn = document.getElementById('toggleCamBtn');
    const camBtnText = document.getElementById('camBtnText');
    const captureSnapBtn = document.getElementById('captureSnapBtn');
    const resetSessionBtn = document.getElementById('resetSessionBtn');

    const videoElement = document.getElementById('inputVideo');
    const canvasElement = document.getElementById('outputCanvas');
    const cameraPlaceholder = document.getElementById('cameraPlaceholder');

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    const showMeshToggle = document.getElementById('showMeshToggle');
    const showContoursToggle = document.getElementById('showContoursToggle');

    // Overlays
    const hudOverlay = document.getElementById('hudOverlay');
    const hudEmoji = document.getElementById('hudEmoji');
    const hudExpression = document.getElementById('hudExpression');
    const hudConfidence = document.getElementById('hudConfidence');

    const gameOverlay = document.getElementById('gameOverlay');
    const gameStartContainer = document.getElementById('gameStartContainer');
    const startGameBtn = document.getElementById('startGameBtn');
    const gamePromptText = document.getElementById('gamePromptText');
    const gameRoundBadge = document.getElementById('gameRoundBadge');
    const gameTimerText = document.getElementById('gameTimerText');
    const gameScoreVal = document.getElementById('gameScoreVal');
    const gameStreakVal = document.getElementById('gameStreakVal');
    const gameToast = document.getElementById('gameToast');
    const toastText = document.getElementById('toastText');

    // Modal
    const gameOverModal = document.getElementById('gameOverModal');
    const modalFinalScore = document.getElementById('modalFinalScore');
    const modalMaxStreak = document.getElementById('modalMaxStreak');
    const studentNameInput = document.getElementById('studentNameInput');
    const submitScoreBtn = document.getElementById('submitScoreBtn');
    const playAgainBtn = document.getElementById('playAgainBtn');

    const leaderboardList = document.getElementById('leaderboardList');

    // Gauges
    const smileVal = document.getElementById('smileVal');
    const smileBar = document.getElementById('smileBar');
    const marVal = document.getElementById('marVal');
    const marBar = document.getElementById('marBar');
    const positivityVal = document.getElementById('positivityVal');
    const positivityBar = document.getElementById('positivityBar');

    const countSmiling = document.getElementById('countSmiling');
    const countLaughing = document.getElementById('countLaughing');
    const countSad = document.getElementById('countSad');
    const countSurprised = document.getElementById('countSurprised');
    const countNeutral = document.getElementById('countNeutral');

    const counterCards = {
        'Smiling': document.getElementById('cardSmiling'),
        'Laughing': document.getElementById('cardLaughing'),
        'Sad': document.getElementById('cardSad'),
        'Surprised': document.getElementById('cardSurprised'),
        'Neutral': document.getElementById('cardNeutral')
    };

    const logTableBody = document.getElementById('logTableBody');

    // Mode state
    window.currentAppMode = 'FREE';

    // 1. Setup Mode Switching Event Listeners immediately
    if (tabFreeTrack) {
        tabFreeTrack.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchAppMode('FREE');
        });
    }

    if (tabChallengeGame) {
        tabChallengeGame.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchAppMode('GAME');
        });
    }

    const tabUploadImage = document.getElementById('tabUploadImage');
    if (tabUploadImage) {
        tabUploadImage.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchAppMode('UPLOAD');
        });
    }

    // 2. Initialize Challenge Engine safely
    try {
        window.challengeEngine = new ChallengeEngine({
            onGameStart: () => {
                if (gameStartContainer) gameStartContainer.style.display = 'none';
                if (gameToast) gameToast.style.display = 'none';
            },
            onGameStop: () => {
                if (gameStartContainer) gameStartContainer.style.display = 'flex';
            },
            onChallengeUpdate: (data) => {
                if (gameRoundBadge) gameRoundBadge.textContent = `Round ${data.round} / ${data.maxRounds}`;
                if (gamePromptText) gamePromptText.textContent = data.challenge.prompt;
                if (gameScoreVal) gameScoreVal.textContent = `Score: ${data.score}`;
                if (gameStreakVal) gameStreakVal.textContent = `Streak: ${data.streak} 🔥`;
            },
            onTimerTick: (timeSec) => {
                if (gameTimerText) gameTimerText.textContent = timeSec.toFixed(1);
            },
            onRoundSuccess: (res) => {
                showGameToast(`🎯 MATCH! +${res.pointsEarned} PTS (${res.multiplier}x Streak!)`, '#10b981');
                if (gameScoreVal) gameScoreVal.textContent = `Score: ${res.score}`;
                if (gameStreakVal) gameStreakVal.textContent = `Streak: ${res.streak} 🔥`;
                if (res.streak >= 3 && window.confetti) {
                    window.confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
                }
            },
            onRoundTimeout: (res) => {
                showGameToast(`⌛ TIME OUT! Try Next Face`, '#ef4444');
                if (gameStreakVal) gameStreakVal.textContent = `Streak: 0 🔥`;
            },
            onGameOver: (res) => {
                if (modalFinalScore) modalFinalScore.textContent = res.finalScore;
                if (modalMaxStreak) modalMaxStreak.textContent = `Max Streak: ${res.maxStreak} 🔥`;
                if (gameOverModal) gameOverModal.style.display = 'flex';
                if (res.finalScore > 500 && window.confetti) {
                    window.confetti({ particleCount: 100, spread: 100, origin: { y: 0.5 } });
                }
            }
        });
    } catch (err) {
        console.warn('Challenge Engine initialization warning:', err);
    }

    function showGameToast(msg, bgColor) {
        if (!gameToast || !toastText) return;
        toastText.textContent = msg;
        gameToast.style.background = bgColor;
        gameToast.style.display = 'block';
        setTimeout(() => {
            if (gameToast) gameToast.style.display = 'none';
        }, 1150);
    }

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (window.faceEngine && !window.faceEngine.isRunning) {
                if (toggleCamBtn) toggleCamBtn.click();
            }
            if (window.challengeEngine) window.challengeEngine.startGame();
        });
    }

    // 3. Initialize Face Engine safely
    try {
        window.faceEngine = new FaceEngine(canvasElement);
        let lastLogTime = 0;

        window.faceEngine.onExpressionDetected = (data) => {
            if (hudEmoji) hudEmoji.textContent = data.emoji;
            if (hudExpression) hudExpression.textContent = data.expression;
            if (hudConfidence) hudConfidence.textContent = `${Math.round(data.confidence * 100)}%`;
            updateActiveCard(data.expression);

            if (smileVal) smileVal.textContent = `${data.smileScore}%`;
            if (smileBar) smileBar.style.width = `${data.smileScore}%`;
            if (marVal) marVal.textContent = data.mar.toFixed(2);
            if (marBar) marBar.style.width = `${Math.min(100, Math.round(data.mar * 200))}%`;

            if (timelineChart) {
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                timelineChart.data.labels.push(timeStr);
                timelineChart.data.datasets[0].data.push(data.smileScore);
                if (timelineChart.data.labels.length > 25) {
                    timelineChart.data.labels.shift();
                    timelineChart.data.datasets[0].data.shift();
                }
                timelineChart.update('none');
            }

            if (window.currentAppMode === 'GAME' && window.challengeEngine) {
                window.challengeEngine.evaluateFrame(data);
            }

            const now = Date.now();
            if (now - lastLogTime > 800) {
                lastLogTime = now;
                sendLogToFlask(data);
            }
        };
    } catch (err) {
        console.warn('Face Engine initialization warning:', err);
    }

    // 4. Initialize Chart safely
    let timelineChart = null;
    try {
        const chartCanvas = document.getElementById('timelineChart');
        if (chartCanvas && window.Chart) {
            const ctx = chartCanvas.getContext('2d');
            timelineChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Smile Intensity %',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true,
                        pointRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { display: false },
                        y: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                    }
                }
            });
        }
    } catch (err) {
        console.warn('Chart initialization warning:', err);
    }

    // Camera Toggle Button
    if (toggleCamBtn) {
        toggleCamBtn.addEventListener('click', () => {
            if (!window.faceEngine) return;
            if (!window.faceEngine.isRunning) {
                window.faceEngine.start(videoElement);
                if (camBtnText) camBtnText.textContent = 'Stop Camera';
                toggleCamBtn.classList.remove('btn-primary');
                toggleCamBtn.classList.add('btn-danger');
                if (cameraPlaceholder) cameraPlaceholder.style.display = 'none';
                if (statusDot) statusDot.classList.add('active');
                if (statusText) statusText.textContent = 'Tracking Reactions Live';
                if (captureSnapBtn) captureSnapBtn.disabled = false;
            } else {
                window.faceEngine.stop();
                if (camBtnText) camBtnText.textContent = 'Start Camera';
                toggleCamBtn.classList.remove('btn-danger');
                toggleCamBtn.classList.add('btn-primary');
                if (cameraPlaceholder) cameraPlaceholder.style.display = 'flex';
                if (statusDot) statusDot.classList.remove('active');
                if (statusText) statusText.textContent = 'Camera Inactive';
                if (captureSnapBtn) captureSnapBtn.disabled = true;
                if (window.challengeEngine) window.challengeEngine.stopGame();
            }
        });
    }

    if (showMeshToggle) showMeshToggle.addEventListener('change', (e) => { if (window.faceEngine) window.faceEngine.showMesh = e.target.checked; });
    if (showContoursToggle) showContoursToggle.addEventListener('change', (e) => { if (window.faceEngine) window.faceEngine.showContours = e.target.checked; });

    function updateActiveCard(expression) {
        Object.keys(counterCards).forEach(key => {
            if (counterCards[key]) {
                if (key === expression) counterCards[key].classList.add('active-reaction');
                else counterCards[key].classList.remove('active-reaction');
            }
        });
    }

    async function sendLogToFlask(data) {
        try {
            const res = await fetch('/api/log_expression', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    expression: data.expression,
                    confidence: data.confidence,
                    smile_score: data.smileScore,
                    mar: data.mar,
                    ear: data.ear
                })
            });

            const json = await res.json();
            if (json.status === 'success' && json.stats) {
                updateUIStats(json.stats);
                if (json.entry) addLogRow(json.entry);
            }
        } catch (e) {
            console.error('Log error:', e);
        }
    }

    function updateUIStats(stats) {
        if (positivityVal) positivityVal.textContent = `${stats.positivity_rate}%`;
        if (positivityBar) positivityBar.style.width = `${stats.positivity_rate}%`;

        if (stats.counts) {
            if (countSmiling) countSmiling.textContent = stats.counts.Smiling || 0;
            if (countLaughing) countLaughing.textContent = stats.counts.Laughing || 0;
            if (countSad) countSad.textContent = stats.counts.Sad || 0;
            if (countSurprised) countSurprised.textContent = stats.counts.Surprised || 0;
            if (countNeutral) countNeutral.textContent = stats.counts.Neutral || 0;
        }
    }

    function addLogRow(entry) {
        if (!logTableBody) return;
        const emptyRow = logTableBody.querySelector('.empty-row');
        if (emptyRow) emptyRow.remove();

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${entry.timestamp}</strong></td>
            <td><span class="expr-badge badge-${entry.expression.toLowerCase()}">${entry.expression}</span></td>
            <td>${entry.confidence}%</td>
            <td>${entry.smile_score}%</td>
            <td>${entry.mar}</td>
            <td>${entry.ear}</td>
            <td>-</td>
        `;

        logTableBody.insertBefore(tr, logTableBody.firstChild);
        if (logTableBody.children.length > 40) logTableBody.removeChild(logTableBody.lastChild);
    }

    // Modal Score Submission
    if (submitScoreBtn) {
        submitScoreBtn.addEventListener('click', async () => {
            const pName = (studentNameInput ? studentNameInput.value : '').trim() || 'Student Star';
            const finalScore = parseInt(modalFinalScore ? modalFinalScore.textContent : '0') || 0;
            const streakNum = parseInt((modalMaxStreak ? modalMaxStreak.textContent : '').replace(/\D/g, '')) || 0;

            try {
                const res = await fetch('/api/game/submit_score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ player_name: pName, score: finalScore, streak: streakNum })
                });

                const json = await res.json();
                if (json.status === 'success') {
                    renderLeaderboard(json.leaderboard);
                    if (gameOverModal) gameOverModal.style.display = 'none';
                }
            } catch (e) {
                console.error('Submit score error:', e);
                if (gameOverModal) gameOverModal.style.display = 'none';
            }
        });
    }

    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => {
            if (gameOverModal) gameOverModal.style.display = 'none';
            if (window.challengeEngine) window.challengeEngine.startGame();
        });
    }

    function renderLeaderboard(scores) {
        if (!scores || !leaderboardList) return;
        leaderboardList.innerHTML = scores.map((s, idx) => `
            <div class="lb-item">
                <span class="lb-rank">${idx + 1}</span>
                <span class="lb-name">${s.player}</span>
                <span class="lb-score">${s.score} pts</span>
            </div>
        `).join('');
    }

    // Initial Leaderboard Fetch
    fetch('/api/game/leaderboard')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                renderLeaderboard(data.leaderboard);
            }
        })
        .catch(e => console.log('Leaderboard fetch err:', e));

    // 5. Upload Image Section Logic & Controller
    const uploadDropzone = document.getElementById('uploadDropzone');
    const imageFileInput = document.getElementById('imageFileInput');
    const triggerUploadBtn = document.getElementById('triggerUploadBtn');
    const uploadStageView = document.getElementById('uploadStageView');
    const uploadedImagePreview = document.getElementById('uploadedImagePreview');
    const uploadCanvas = document.getElementById('uploadCanvas');
    const uploadHudEmoji = document.getElementById('uploadHudEmoji');
    const uploadHudExpression = document.getElementById('uploadHudExpression');
    const uploadHudConfidence = document.getElementById('uploadHudConfidence');
    const uploadLoadingOverlay = document.getElementById('uploadLoadingOverlay');
    const reuploadBtn = document.getElementById('reuploadBtn');

    const specElements = {
        Smiling: { val: document.getElementById('specValSmiling'), bar: document.getElementById('specBarSmiling') },
        Laughing: { val: document.getElementById('specValLaughing'), bar: document.getElementById('specBarLaughing') },
        Sad: { val: document.getElementById('specValSad'), bar: document.getElementById('specBarSad') },
        Surprised: { val: document.getElementById('specValSurprised'), bar: document.getElementById('specBarSurprised') },
        Neutral: { val: document.getElementById('specValNeutral'), bar: document.getElementById('specBarNeutral') },
        Angry: { val: document.getElementById('specValAngry'), bar: document.getElementById('specBarAngry') }
    };

    if (triggerUploadBtn && imageFileInput) {
        triggerUploadBtn.addEventListener('click', () => imageFileInput.click());
    }

    if (uploadDropzone) {
        uploadDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadDropzone.classList.add('dragover');
        });

        uploadDropzone.addEventListener('dragleave', () => {
            uploadDropzone.classList.remove('dragover');
        });

        uploadDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadDropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleUploadedFile(e.dataTransfer.files[0]);
            }
        });
    }

    if (imageFileInput) {
        imageFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleUploadedFile(e.target.files[0]);
            }
        });
    }

    if (reuploadBtn) {
        reuploadBtn.addEventListener('click', () => {
            if (uploadStageView) uploadStageView.style.display = 'none';
            if (uploadDropzone) uploadDropzone.style.display = 'flex';
            if (imageFileInput) imageFileInput.value = '';
        });
    }

    // Sample Preset Face Buttons handler
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const presetType = e.currentTarget.getAttribute('data-preset');
            generateSamplePresetImage(presetType);
        });
    });

    function generateSamplePresetImage(type) {
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 480;
        const ctx = c.getContext('2d');
        
        // Background gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 640, 480);
        bgGrad.addColorStop(0, '#1e293b');
        bgGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 640, 480);
        
        // Face outline
        ctx.fillStyle = '#fce7f3';
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(320, 230, 140, 180, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eyes
        ctx.fillStyle = '#1e293b';
        if (type === 'surprised') {
            ctx.beginPath(); ctx.arc(260, 190, 20, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(380, 190, 20, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.beginPath(); ctx.arc(260, 190, 12, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(380, 190, 12, 0, Math.PI * 2); ctx.fill();
        }

        // Eyebrows
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 6;
        ctx.beginPath();
        if (type === 'angry') {
            ctx.moveTo(220, 165); ctx.lineTo(290, 185);
            ctx.moveTo(420, 165); ctx.lineTo(350, 185);
        } else if (type === 'surprised') {
            ctx.moveTo(220, 150); ctx.lineTo(290, 155);
            ctx.moveTo(420, 150); ctx.lineTo(350, 155);
        } else if (type === 'sad') {
            ctx.moveTo(220, 180); ctx.lineTo(290, 165);
            ctx.moveTo(420, 180); ctx.lineTo(350, 165);
        } else {
            ctx.moveTo(220, 165); ctx.lineTo(290, 165);
            ctx.moveTo(420, 165); ctx.lineTo(350, 165);
        }
        ctx.stroke();

        // Mouth
        ctx.strokeStyle = '#e11d48';
        ctx.fillStyle = '#e11d48';
        ctx.lineWidth = 6;
        ctx.beginPath();

        if (type === 'smiling' || type === 'laughing') {
            ctx.arc(320, 270, 60, 0.1 * Math.PI, 0.9 * Math.PI, false);
            if (type === 'laughing') {
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.stroke();
            }
        } else if (type === 'sad') {
            ctx.arc(320, 330, 50, 1.1 * Math.PI, 1.9 * Math.PI, false);
            ctx.stroke();
        } else if (type === 'surprised') {
            ctx.arc(320, 290, 35, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.moveTo(270, 300);
            ctx.lineTo(370, 300);
            ctx.stroke();
        }

        const dataUrl = c.toDataURL('image/jpeg', 0.9);
        processUploadedBase64(dataUrl);
    }

    async function handleUploadedFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Please select a valid image file (JPG, PNG, WEBP).');
            return;
        }

        if (uploadDropzone) uploadDropzone.style.display = 'none';
        if (uploadStageView) uploadStageView.style.display = 'flex';
        if (uploadLoadingOverlay) uploadLoadingOverlay.style.display = 'flex';

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/analyze_uploaded_image', {
                method: 'POST',
                body: formData
            });

            const json = await res.json();
            if (json.status === 'success') {
                renderUploadResults(json, file);
            } else {
                alert(json.message || 'Failed to detect facial expression in the image.');
                if (uploadLoadingOverlay) uploadLoadingOverlay.style.display = 'none';
            }
        } catch (err) {
            console.error('Upload analysis error:', err);
            alert('Error communicating with facial analysis server.');
            if (uploadLoadingOverlay) uploadLoadingOverlay.style.display = 'none';
        }
    }

    async function processUploadedBase64(dataUrl) {
        if (uploadDropzone) uploadDropzone.style.display = 'none';
        if (uploadStageView) uploadStageView.style.display = 'flex';
        if (uploadLoadingOverlay) uploadLoadingOverlay.style.display = 'flex';

        try {
            const res = await fetch('/api/analyze_uploaded_image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: dataUrl })
            });

            const json = await res.json();
            if (json.status === 'success') {
                renderUploadResults(json, null, dataUrl);
            } else {
                alert(json.message || 'Failed to analyze facial expression.');
                if (uploadLoadingOverlay) uploadLoadingOverlay.style.display = 'none';
            }
        } catch (err) {
            console.error('Base64 analysis error:', err);
            alert('Error analyzing sample preset image.');
            if (uploadLoadingOverlay) uploadLoadingOverlay.style.display = 'none';
        }
    }

    function renderUploadResults(json, fileObject, dataUrlSrc) {
        const analysis = json.analysis;
        
        if (uploadHudEmoji) uploadHudEmoji.textContent = analysis.emoji;
        if (uploadHudExpression) uploadHudExpression.textContent = analysis.expression;
        if (uploadHudConfidence) uploadHudConfidence.textContent = `${analysis.confidence}%`;

        if (smileVal) smileVal.textContent = `${analysis.smile_score}%`;
        if (smileBar) smileBar.style.width = `${analysis.smile_score}%`;
        if (marVal) marVal.textContent = analysis.mar.toFixed(2);
        if (marBar) marBar.style.width = `${Math.min(100, Math.round(analysis.mar * 200))}%`;

        updateActiveCard(analysis.expression);

        // Update Emotion Spectrum Bars
        if (analysis.breakdown) {
            Object.keys(specElements).forEach(key => {
                const item = specElements[key];
                if (item && item.val && item.bar) {
                    const score = analysis.breakdown[key] || 0.0;
                    item.val.textContent = `${score}%`;
                    item.bar.style.width = `${score}%`;
                }
            });
        }

        if (json.stats) updateUIStats(json.stats);
        if (json.log_entry) addLogRow(json.log_entry);

        // Render Image preview onto uploadCanvas
        const img = uploadedImagePreview || new Image();
        img.crossOrigin = 'anonymous';

        img.onload = async () => {
            if (uploadCanvas) {
                if (window.faceEngine) {
                    await window.faceEngine.processStaticImage(img, uploadCanvas);
                } else {
                    uploadCanvas.width = img.naturalWidth || img.width;
                    uploadCanvas.height = img.naturalHeight || img.height;
                    const ctx = uploadCanvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                }
            }
            if (uploadLoadingOverlay) uploadLoadingOverlay.style.display = 'none';
        };

        if (fileObject) {
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(fileObject);
        } else if (dataUrlSrc) {
            img.src = dataUrlSrc;
        } else if (json.snapshot_url) {
            img.src = json.snapshot_url;
        } else {
            if (uploadLoadingOverlay) uploadLoadingOverlay.style.display = 'none';
        }
    }
});
