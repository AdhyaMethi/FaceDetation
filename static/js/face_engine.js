/**
 * FaceEngine - High Precision MediaPipe FaceMesh & Facial Expression Engine
 */

class FaceEngine {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.faceMesh = null;
        this.camera = null;
        this.isRunning = false;

        this.showMesh = true;
        this.showContours = true;

        // Callback function when an expression frame is processed
        this.onExpressionDetected = null;

        // Smoothing buffer for expression scores
        this.history = {
            smile: [],
            mar: [],
            ear: []
        };

        this.initMediaPipe();
    }

    initMediaPipe() {
        this.faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.faceMesh.onResults((results) => this.processResults(results));
    }

    start(videoElement) {
        if (this.isRunning) return;

        this.camera = new Camera(videoElement, {
            onFrame: async () => {
                if (this.isRunning) {
                    await this.faceMesh.send({ image: videoElement });
                }
            },
            width: 1280,
            height: 720
        });

        this.isRunning = true;
        this.camera.start();
    }

    stop() {
        this.isRunning = false;
        if (this.camera) {
            this.camera.stop();
            this.camera = null;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    async processStaticImage(imageElement, targetCanvas) {
        if (!this.faceMesh) return null;
        const canvasToUse = targetCanvas || this.canvas;
        const ctxToUse = canvasToUse.getContext('2d');
        
        const w = imageElement.naturalWidth || imageElement.width || 640;
        const h = imageElement.naturalHeight || imageElement.height || 480;
        canvasToUse.width = w;
        canvasToUse.height = h;
        
        ctxToUse.clearRect(0, 0, w, h);
        ctxToUse.drawImage(imageElement, 0, 0, w, h);
        
        let detectedAnalysis = null;
        
        const handleFrame = (results) => {
            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                const landmarks = results.multiFaceLandmarks[0];
                detectedAnalysis = this.analyzeFaceLandmarks(landmarks);
                
                ctxToUse.save();
                if (this.showContours) {
                    drawConnectors(ctxToUse, landmarks, FACEMESH_TESSELATION, {
                        color: 'rgba(99, 102, 241, 0.25)',
                        lineWidth: 1
                    });
                }
                if (this.showMesh) {
                    drawConnectors(ctxToUse, landmarks, FACEMESH_LIPS, {
                        color: detectedAnalysis.expression === 'Smiling' || detectedAnalysis.expression === 'Laughing' ? '#10b981' : '#6366f1',
                        lineWidth: 2
                    });
                    drawConnectors(ctxToUse, landmarks, FACEMESH_LEFT_EYE, { color: '#06b6d4', lineWidth: 2 });
                    drawConnectors(ctxToUse, landmarks, FACEMESH_RIGHT_EYE, { color: '#06b6d4', lineWidth: 2 });
                    drawConnectors(ctxToUse, landmarks, FACEMESH_LEFT_EYEBROW, { color: '#a855f7', lineWidth: 2 });
                    drawConnectors(ctxToUse, landmarks, FACEMESH_RIGHT_EYEBROW, { color: '#a855f7', lineWidth: 2 });
                }
                ctxToUse.restore();
            }
        };

        await this.faceMesh.send({ image: imageElement });
        return detectedAnalysis;
    }

    // Calculate 3D Euclidean distance between two landmarks
    dist(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = (p1.z || 0) - (p2.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // Moving average helper for smooth metrics
    smooth(arr, val, windowSize = 5) {
        arr.push(val);
        if (arr.length > windowSize) arr.shift();
        const sum = arr.reduce((a, b) => a + b, 0);
        return sum / arr.length;
    }

    analyzeFaceLandmarks(landmarks) {
        // Key MediaPipe 468 Landmark Indices:
        // Mouth: 61 (left corner), 291 (right corner), 13 (upper lip center), 14 (lower lip center)
        // Jaw: 172 (left), 397 (right)
        // Left Eye: 159 (top), 145 (bottom), 33 (outer), 133 (inner)
        // Right Eye: 386 (top), 374 (bottom), 362 (inner), 263 (outer)
        // Eyebrows: 70 (left outer), 107 (left inner), 336 (right inner), 300 (right outer)
        
        const mouthLeft = landmarks[61];
        const mouthRight = landmarks[291];
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];

        const jawLeft = landmarks[172];
        const jawRight = landmarks[397];

        const leftEyeTop = landmarks[159];
        const leftEyeBottom = landmarks[145];
        const leftEyeOuter = landmarks[33];
        const leftEyeInner = landmarks[133];

        const rightEyeTop = landmarks[386];
        const rightEyeBottom = landmarks[374];
        const rightEyeOuter = landmarks[263];
        const rightEyeInner = landmarks[362];

        const leftBrowInner = landmarks[107];
        const rightBrowInner = landmarks[336];

        // 1. Mouth Aspect Ratio (MAR)
        const mouthWidth = this.dist(mouthLeft, mouthRight);
        const mouthHeight = this.dist(upperLip, lowerLip);
        const rawMAR = mouthWidth > 0 ? (mouthHeight / mouthWidth) : 0;
        const mar = this.smooth(this.history.mar, rawMAR);

        // 2. Eye Aspect Ratio (EAR)
        const leftEAR = this.dist(leftEyeTop, leftEyeBottom) / (this.dist(leftEyeOuter, leftEyeInner) || 1);
        const rightEAR = this.dist(rightEyeTop, rightEyeBottom) / (this.dist(rightEyeOuter, rightEyeInner) || 1);
        const rawEAR = (leftEAR + rightEAR) / 2.0;
        const ear = this.smooth(this.history.ear, rawEAR);

        // 3. Smile Ratio & Smile Score calculation
        const jawWidth = this.dist(jawLeft, jawRight);
        const mouthJawRatio = jawWidth > 0 ? (mouthWidth / jawWidth) : 0.4;
        
        // Baseline neutral mouth-jaw ratio is approx 0.40 - 0.43. Smile increases to > 0.48
        // Convert to 0% - 100% smile score
        let rawSmile = Math.max(0, Math.min(100, ((mouthJawRatio - 0.39) / 0.16) * 100));
        
        // Also factor in mouth corner lift relative to upper lip
        const lipY = upperLip.y;
        const cornerAvgY = (mouthLeft.y + mouthRight.y) / 2.0;
        const cornerLift = (lipY - cornerAvgY); // Positive when corners are lifted
        if (cornerLift > 0) {
            rawSmile += cornerLift * 300;
        }

        const smileScore = this.smooth(this.history.smile, Math.min(100, rawSmile));

        // 4. Eyebrow Height / Elevation
        const browDistInner = this.dist(leftBrowInner, rightBrowInner);
        const browEyeDist = ((leftEyeTop.y - leftBrowInner.y) + (rightEyeTop.y - rightBrowInner.y)) / 2.0;

        // 5. Expression Classification Logic
        let expression = "Neutral";
        let confidence = 0.85;
        let emoji = "😐";

        if (smileScore > 50 && mar > 0.30) {
            expression = "Laughing";
            confidence = Math.min(0.99, 0.7 + (mar * 0.5));
            emoji = "😆";
        } else if (smileScore > 42) {
            expression = "Smiling";
            confidence = Math.min(0.98, 0.65 + (smileScore / 200));
            emoji = "😊";
        } else if (mar > 0.35 && browEyeDist > 0.05 && smileScore < 35) {
            expression = "Surprised";
            confidence = Math.min(0.95, 0.7 + (mar * 0.4));
            emoji = "😲";
        } else if (smileScore < 20 && cornerLift < -0.01 && mar < 0.20) {
            expression = "Sad";
            confidence = Math.min(0.92, 0.7 + Math.abs(cornerLift) * 10);
            emoji = "😢";
        } else if (browDistInner < 0.06 && smileScore < 25) {
            expression = "Angry";
            confidence = 0.88;
            emoji = "😡";
        } else {
            expression = "Neutral";
            confidence = 0.90;
            emoji = "😐";
        }

        return {
            expression,
            confidence,
            emoji,
            smileScore: Math.round(smileScore),
            mar: parseFloat(mar.toFixed(3)),
            ear: parseFloat(ear.toFixed(3))
        };
    }

    processResults(results) {
        // Resize canvas to match video stream dimensions
        if (results.image) {
            if (this.canvas.width !== results.image.width || this.canvas.height !== results.image.height) {
                this.canvas.width = results.image.width;
                this.canvas.height = results.image.height;
            }
        }

        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];

            // Analyze facial reaction
            const analysis = this.analyzeFaceLandmarks(landmarks);

            // Draw Face Mesh Overlay
            if (this.showContours) {
                drawConnectors(this.ctx, landmarks, FACEMESH_TESSELATION, {
                    color: 'rgba(99, 102, 241, 0.18)',
                    lineWidth: 1
                });
            }

            if (this.showMesh) {
                // Highlight key features (lips, eyes, eyebrows)
                drawConnectors(this.ctx, landmarks, FACEMESH_LIPS, {
                    color: analysis.expression === 'Smiling' || analysis.expression === 'Laughing' ? '#10b981' : '#6366f1',
                    lineWidth: 2
                });
                drawConnectors(this.ctx, landmarks, FACEMESH_LEFT_EYE, { color: '#06b6d4', lineWidth: 2 });
                drawConnectors(this.ctx, landmarks, FACEMESH_RIGHT_EYE, { color: '#06b6d4', lineWidth: 2 });
                drawConnectors(this.ctx, landmarks, FACEMESH_LEFT_EYEBROW, { color: '#a855f7', lineWidth: 2 });
                drawConnectors(this.ctx, landmarks, FACEMESH_RIGHT_EYEBROW, { color: '#a855f7', lineWidth: 2 });
            }

            // Trigger callback with analysis data
            if (this.onExpressionDetected) {
                this.onExpressionDetected(analysis);
            }
        }

        this.ctx.restore();
    }
}
