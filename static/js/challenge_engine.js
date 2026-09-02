/**
 * ChallengeEngine - Interactive Student Expression Match Minigame Logic
 */

class ChallengeEngine {
    constructor(uiCallbacks) {
        this.callbacks = uiCallbacks || {};
        this.gameState = 'IDLE'; // IDLE, PLAYING, GAME_OVER

        this.challenges = [
            { id: 'smile', name: 'Smiling', emoji: '😊', prompt: 'Show your biggest Smile! 😊', minScore: 45 },
            { id: 'laugh', name: 'Laughing', emoji: '😆', prompt: 'Burst into a Laugh! 😆', minScore: 50 },
            { id: 'surprise', name: 'Surprised', emoji: '😲', prompt: 'Make a Surprised Face! 😲', minScore: 35 },
            { id: 'sad', name: 'Sad', emoji: '😢', prompt: 'Show a Sad Frown! 😢', minScore: 20 },
            { id: 'neutral', name: 'Neutral', emoji: '😐', prompt: 'Stay completely Neutral! 😐', minScore: 0 }
        ];

        this.currentChallengeIndex = 0;
        this.currentChallenge = null;
        
        this.score = 0;
        this.streak = 0;
        this.roundCount = 0;
        this.maxRounds = 5;

        this.timeRemaining = 5.0; // 5 seconds per challenge
        this.timerInterval = null;
        this.isMatchLocked = false;
    }

    startGame() {
        this.score = 0;
        this.streak = 0;
        this.roundCount = 0;
        this.gameState = 'PLAYING';
        
        if (this.callbacks.onGameStart) {
            this.callbacks.onGameStart();
        }

        this.nextChallenge();
    }

    stopGame() {
        this.gameState = 'IDLE';
        this.clearTimer();
        if (this.callbacks.onGameStop) {
            this.callbacks.onGameStop();
        }
    }

    nextChallenge() {
        if (this.roundCount >= this.maxRounds) {
            this.endGame();
            return;
        }

        this.roundCount++;
        this.isMatchLocked = false;

        // Pick a challenge (avoid repeating same consecutive expression)
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * this.challenges.length);
        } while (nextIndex === this.currentChallengeIndex && this.challenges.length > 1);

        this.currentChallengeIndex = nextIndex;
        this.currentChallenge = this.challenges[nextIndex];

        this.timeRemaining = 5.0;

        if (this.callbacks.onChallengeUpdate) {
            this.callbacks.onChallengeUpdate({
                challenge: this.currentChallenge,
                round: this.roundCount,
                maxRounds: this.maxRounds,
                score: this.score,
                streak: this.streak
            });
        }

        this.startTimer();
    }

    startTimer() {
        this.clearTimer();
        const tickRateMs = 100;

        this.timerInterval = setInterval(() => {
            if (this.gameState !== 'PLAYING') return;

            this.timeRemaining -= (tickRateMs / 1000);

            if (this.callbacks.onTimerTick) {
                this.callbacks.onTimerTick(Math.max(0, this.timeRemaining));
            }

            if (this.timeRemaining <= 0) {
                this.handleTimeout();
            }
        }, tickRateMs);
    }

    clearTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    // Process current live expression frame from FaceEngine
    evaluateFrame(analysisData) {
        if (this.gameState !== 'PLAYING' || this.isMatchLocked || !this.currentChallenge) return;

        const target = this.currentChallenge;
        const currentExpr = analysisData.expression;

        let isMatch = false;

        if (target.id === 'smile' && (currentExpr === 'Smiling' || currentExpr === 'Laughing')) {
            isMatch = true;
        } else if (target.id === 'laugh' && currentExpr === 'Laughing') {
            isMatch = true;
        } else if (target.id === 'surprise' && currentExpr === 'Surprised') {
            isMatch = true;
        } else if (target.id === 'sad' && currentExpr === 'Sad') {
            isMatch = true;
        } else if (target.id === 'neutral' && currentExpr === 'Neutral') {
            isMatch = true;
        }

        if (isMatch) {
            this.handleSuccess(analysisData);
        }
    }

    handleSuccess(analysisData) {
        this.isMatchLocked = true;
        this.clearTimer();

        this.streak += 1;
        const multiplier = Math.min(4, 1 + Math.floor(this.streak / 2));
        const roundPoints = Math.round((150 + (analysisData.smileScore || 30) * 2) * multiplier);
        this.score += roundPoints;

        if (this.callbacks.onRoundSuccess) {
            this.callbacks.onRoundSuccess({
                pointsEarned: roundPoints,
                score: this.score,
                streak: this.streak,
                multiplier: multiplier,
                expression: this.currentChallenge.name
            });
        }

        // Brief delay before next challenge prompt
        setTimeout(() => {
            if (this.gameState === 'PLAYING') {
                this.nextChallenge();
            }
        }, 1200);
    }

    handleTimeout() {
        this.isMatchLocked = true;
        this.clearTimer();
        this.streak = 0; // Reset streak on miss

        if (this.callbacks.onRoundTimeout) {
            this.callbacks.onRoundTimeout({
                challenge: this.currentChallenge,
                score: this.score
            });
        }

        setTimeout(() => {
            if (this.gameState === 'PLAYING') {
                this.nextChallenge();
            }
        }, 1200);
    }

    endGame() {
        this.gameState = 'GAME_OVER';
        this.clearTimer();

        if (this.callbacks.onGameOver) {
            this.callbacks.onGameOver({
                finalScore: this.score,
                maxStreak: this.streak,
                rounds: this.maxRounds
            });
        }
    }
}
