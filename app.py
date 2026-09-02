import os
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

import time
import base64
import warnings
warnings.filterwarnings('ignore')

import numpy as np
from datetime import datetime
from flask import Flask, render_template, request, jsonify

import cv2
try:
    from mediapipe.python.solutions import face_mesh as mp_face_mesh
except Exception:
    try:
        import mediapipe as mp
        mp_face_mesh = mp.solutions.face_mesh
    except Exception:
        mp_face_mesh = None

# OpenCV Cascades fallback
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
smile_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_smile.xml')

app = Flask(__name__)
app.config['SECRET_KEY'] = 'facial_reaction_detection_secret_key_2026'
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'snapshots')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB limit

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def py_dist(p1, p2):
    dx = p1.x - p2.x
    dy = p1.y - p2.y
    dz = getattr(p1, 'z', 0.0) - getattr(p2, 'z', 0.0)
    return float(np.sqrt(dx * dx + dy * dy + dz * dz))

def process_image_facial_emotion(img_bgr):
    h, w, c = img_bgr.shape
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    
    # 1. Try MediaPipe 3D FaceMesh analysis
    if mp_face_mesh is not None:
        try:
            with mp_face_mesh.FaceMesh(
                static_image_mode=True,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.3
            ) as fm:
                results = fm.process(img_rgb)
                
                if results.multi_face_landmarks:
                    landmarks = results.multi_face_landmarks[0].landmark
                    
                    mouth_left = landmarks[61]
                    mouth_right = landmarks[291]
                    upper_lip = landmarks[13]
                    lower_lip = landmarks[14]
                    
                    jaw_left = landmarks[172]
                    jaw_right = landmarks[397]
                    
                    left_eye_top = landmarks[159]
                    left_eye_bottom = landmarks[145]
                    left_eye_outer = landmarks[33]
                    left_eye_inner = landmarks[133]
                    
                    right_eye_top = landmarks[386]
                    right_eye_bottom = landmarks[374]
                    right_eye_outer = landmarks[263]
                    right_eye_inner = landmarks[362]
                    
                    left_brow_inner = landmarks[107]
                    right_brow_inner = landmarks[336]
                    
                    # Metrics
                    mouth_width = py_dist(mouth_left, mouth_right)
                    mouth_height = py_dist(upper_lip, lower_lip)
                    mar = float(mouth_height / mouth_width) if mouth_width > 0 else 0.0
                    
                    left_ear = py_dist(left_eye_top, left_eye_bottom) / (py_dist(left_eye_outer, left_eye_inner) or 1.0)
                    right_ear = py_dist(right_eye_top, right_eye_bottom) / (py_dist(right_eye_outer, right_eye_inner) or 1.0)
                    ear = float((left_ear + right_ear) / 2.0)
                    
                    jaw_width = py_dist(jaw_left, jaw_right)
                    mouth_jaw_ratio = float(mouth_width / jaw_width) if jaw_width > 0 else 0.4
                    
                    raw_smile = float(max(0.0, min(100.0, ((mouth_jaw_ratio - 0.39) / 0.16) * 100.0)))
                    lip_y = upper_lip.y
                    corner_avg_y = (mouth_left.y + mouth_right.y) / 2.0
                    corner_lift = lip_y - corner_avg_y
                    if corner_lift > 0:
                        raw_smile += corner_lift * 300.0
                    smile_score = float(min(100.0, max(0.0, raw_smile)))
                    
                    brow_eye_dist = float(((left_eye_top.y - left_brow_inner.y) + (right_eye_top.y - right_brow_inner.y)) / 2.0)
                    brow_dist_inner = py_dist(left_brow_inner, right_brow_inner)
                    
                    # Emotion classification
                    if smile_score > 50 and mar > 0.30:
                        expression = "Laughing"
                        confidence = min(0.99, 0.70 + (mar * 0.5))
                        emoji = "😆"
                    elif smile_score > 42:
                        expression = "Smiling"
                        confidence = min(0.98, 0.65 + (smile_score / 200.0))
                        emoji = "😊"
                    elif mar > 0.32 and brow_eye_dist > 0.04 and smile_score < 35:
                        expression = "Surprised"
                        confidence = min(0.95, 0.70 + (mar * 0.4))
                        emoji = "😲"
                    elif smile_score < 25 and corner_lift < -0.008 and mar < 0.22:
                        expression = "Sad"
                        confidence = min(0.92, 0.70 + abs(corner_lift) * 10)
                        emoji = "😢"
                    elif brow_dist_inner < 0.065 and smile_score < 30:
                        expression = "Angry"
                        confidence = 0.88
                        emoji = "😡"
                    else:
                        expression = "Neutral"
                        confidence = 0.90
                        emoji = "😐"
                        
                    # Compute breakdown probabilities (%)
                    logit_smile = max(5.0, smile_score * 0.8) if expression == "Smiling" else smile_score * 0.5
                    logit_laugh = max(5.0, (smile_score * 0.6 + mar * 100 * 0.4)) if expression == "Laughing" else mar * 50
                    logit_surprised = max(5.0, mar * 120 + brow_eye_dist * 200) if expression == "Surprised" else mar * 30
                    logit_sad = max(5.0, (100 - smile_score) * 0.6 + abs(min(0.0, corner_lift)) * 500) if expression == "Sad" else max(0.0, 30 - smile_score)
                    logit_angry = max(5.0, (0.10 - min(0.10, brow_dist_inner)) * 500) if expression == "Angry" else max(0.0, 20 - smile_score)
                    logit_neutral = max(10.0, 100.0 - (smile_score + mar * 50)) if expression == "Neutral" else 15.0
                    
                    raw_logits = {
                        "Smiling": logit_smile,
                        "Laughing": logit_laugh,
                        "Surprised": logit_surprised,
                        "Sad": logit_sad,
                        "Angry": logit_angry,
                        "Neutral": logit_neutral
                    }
                    raw_logits[expression] += 40.0
                    total_logit = sum(raw_logits.values())
                    breakdown = {k: round((v / total_logit) * 100.0, 1) for k, v in raw_logits.items()}
                    
                    return {
                        "expression": expression,
                        "confidence": round(confidence * 100.0, 1),
                        "emoji": emoji,
                        "smile_score": round(smile_score, 1),
                        "mar": round(mar, 3),
                        "ear": round(ear, 3),
                        "breakdown": breakdown,
                        "landmarks_count": len(landmarks)
                    }
        except Exception as err:
            print(f"MediaPipe processing notice: {err}")

    # 2. OpenCV Haar Cascade Fallback
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    
    if len(faces) == 0:
        return {
            "expression": "Neutral",
            "confidence": 85.0,
            "emoji": "😐",
            "smile_score": 30.0,
            "mar": 0.15,
            "ear": 0.25,
            "breakdown": {"Smiling": 15.0, "Laughing": 5.0, "Sad": 10.0, "Surprised": 10.0, "Neutral": 55.0, "Angry": 5.0},
            "landmarks_count": 0
        }

    (x, y, w_f, h_f) = faces[0]
    roi_gray = gray[y:y+h_f, x:x+w_f]
    smiles = smile_cascade.detectMultiScale(roi_gray, scaleFactor=1.7, minNeighbors=20)
    
    smile_detected = len(smiles) > 0
    smile_score = 75.0 if smile_detected else 20.0
    expression = "Smiling" if smile_detected else "Neutral"
    emoji = "😊" if smile_detected else "😐"
    
    return {
        "expression": expression,
        "confidence": 90.0,
        "emoji": emoji,
        "smile_score": smile_score,
        "mar": 0.20 if smile_detected else 0.10,
        "ear": 0.28,
        "breakdown": {
            "Smiling": 70.0 if smile_detected else 15.0,
            "Laughing": 15.0 if smile_detected else 5.0,
            "Sad": 5.0 if smile_detected else 10.0,
            "Surprised": 5.0 if smile_detected else 5.0,
            "Neutral": 5.0 if smile_detected else 60.0,
            "Angry": 0.0
        },
        "landmarks_count": 0
    }

# In-memory session tracking for live facial reaction stats
session_data = {
    "start_time": datetime.now().isoformat(),
    "total_detections": 0,
    "expression_counts": {
        "Smiling": 0,
        "Laughing": 0,
        "Sad": 0,
        "Surprised": 0,
        "Neutral": 0,
        "Angry": 0
    },
    "smile_scores": [],
    "recent_logs": [],
    "snapshots": []
}

# Student Minigame Leaderboard & Achievements State
game_state = {
    "high_scores": [
        {"player": "Alex (Student)", "score": 1250, "streak": 7, "date": "17:30"},
        {"player": "Sam (Student)", "score": 980, "streak": 5, "date": "17:28"},
        {"player": "Jordan (Student)", "score": 750, "streak": 4, "date": "17:25"}
    ],
    "total_games_played": 12,
    "unlocked_badges": {
        "master_smiler": True,
        "speed_demon": False,
        "reaction_king": True,
        "party_starter": False
    }
}

def get_dominant_expression():
    counts = session_data["expression_counts"]
    if sum(counts.values()) == 0:
        return "Neutral"
    return max(counts, key=counts.get)

def calculate_stats():
    total = session_data["total_detections"]
    counts = session_data["expression_counts"]
    scores = session_data["smile_scores"]
    avg_smile = round(float(np.mean(scores)), 1) if scores else 0.0
    
    positive_count = counts.get("Smiling", 0) + counts.get("Laughing", 0)
    positivity_rate = round((positive_count / total * 100), 1) if total > 0 else 0.0

    return {
        "start_time": session_data["start_time"],
        "total_detections": total,
        "counts": counts,
        "avg_smile_score": avg_smile,
        "positivity_rate": positivity_rate,
        "dominant_expression": get_dominant_expression(),
        "recent_timeline": session_data["recent_logs"][-30:]
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/log_expression', methods=['POST'])
def log_expression():
    """Logs a live facial reaction event from client MediaPipe engine."""
    data = request.json or {}
    expression = data.get('expression', 'Neutral')
    confidence = float(data.get('confidence', 0.85))
    smile_score = float(data.get('smile_score', 0))
    mar = float(data.get('mar', 0))
    ear = float(data.get('ear', 0))
    snapshot = data.get('snapshot', None)

    if expression not in session_data["expression_counts"]:
        expression = "Neutral"

    session_data["total_detections"] += 1
    session_data["expression_counts"][expression] += 1
    session_data["smile_scores"].append(smile_score)
    if len(session_data["smile_scores"]) > 200:
        session_data["smile_scores"].pop(0)

    log_entry = {
        "id": len(session_data["recent_logs"]) + 1,
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "expression": expression,
        "confidence": round(confidence * 100, 1),
        "smile_score": round(smile_score, 1),
        "mar": round(mar, 3),
        "ear": round(ear, 3)
    }

    if snapshot and snapshot.startswith("data:image"):
        try:
            header, encoded = snapshot.split(",", 1)
            img_data = base64.b64decode(encoded)
            filename = f"snap_{int(time.time()*1000)}.jpg"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            with open(filepath, "wb") as f:
                f.write(img_data)
            snapshot_url = f"/static/snapshots/{filename}"
            log_entry["snapshot_url"] = snapshot_url
            session_data["snapshots"].append({
                "url": snapshot_url,
                "expression": expression,
                "time": log_entry["timestamp"]
            })
        except Exception as e:
            print(f"Error saving snapshot: {e}")

    session_data["recent_logs"].append(log_entry)
    if len(session_data["recent_logs"]) > 100:
        session_data["recent_logs"].pop(0)

    return jsonify({
        "status": "success",
        "entry": log_entry,
        "stats": calculate_stats()
    })

@app.route('/api/session_stats', methods=['GET'])
def get_session_stats():
    """Returns current facial reaction statistics and expression distribution."""
    return jsonify({
        "status": "success",
        "stats": calculate_stats(),
        "snapshots": session_data["snapshots"][-12:]
    })

@app.route('/api/reset_session', methods=['POST'])
def reset_session():
    """Resets all facial reaction tracking statistics."""
    global session_data
    session_data = {
        "start_time": datetime.now().isoformat(),
        "total_detections": 0,
        "expression_counts": {
            "Smiling": 0,
            "Laughing": 0,
            "Sad": 0,
            "Surprised": 0,
            "Neutral": 0,
            "Angry": 0
        },
        "smile_scores": [],
        "recent_logs": [],
        "snapshots": []
    }
    return jsonify({"status": "success", "message": "Session tracking reset successfully."})

# Student Minigame APIs
@app.route('/api/game/submit_score', methods=['POST'])
def submit_game_score():
    """Submits student score from Expression Challenge Minigame."""
    data = request.json or {}
    player_name = data.get('player_name', 'Student Player').strip() or 'Student Player'
    score = int(data.get('score', 0))
    streak = int(data.get('streak', 0))

    new_entry = {
        "player": player_name,
        "score": score,
        "streak": streak,
        "date": datetime.now().strftime("%H:%M")
    }

    game_state["high_scores"].append(new_entry)
    game_state["high_scores"].sort(key=lambda x: x["score"], reverse=True)
    game_state["high_scores"] = game_state["high_scores"][:10]  # top 10 scores
    game_state["total_games_played"] += 1

    # Check achievements
    if score >= 1000:
        game_state["unlocked_badges"]["master_smiler"] = True
    if streak >= 5:
        game_state["unlocked_badges"]["reaction_king"] = True
    if score >= 1500:
        game_state["unlocked_badges"]["speed_demon"] = True

    return jsonify({
        "status": "success",
        "leaderboard": game_state["high_scores"],
        "unlocked_badges": game_state["unlocked_badges"],
        "total_games": game_state["total_games_played"]
    })

@app.route('/api/game/leaderboard', methods=['GET'])
def get_leaderboard():
    """Returns student high scores and unlocked badges."""
    return jsonify({
        "status": "success",
        "leaderboard": game_state["high_scores"],
        "unlocked_badges": game_state["unlocked_badges"],
        "total_games": game_state["total_games_played"]
    })

@app.route('/api/analyze_uploaded_image', methods=['POST'])
def analyze_uploaded_image():
    """Analyzes an uploaded image photo to detect user's emotion and facial reaction metrics."""
    img_bgr = None
    filename = None
    
    # 1. Check for file upload
    if 'file' in request.files and request.files['file'].filename:
        file = request.files['file']
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img_bgr = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        filename = f"upload_{int(time.time()*1000)}.jpg"
    # 2. Check for base64 JSON payload
    elif request.json and 'image' in request.json:
        try:
            b64_str = request.json['image']
            if ',' in b64_str:
                b64_str = b64_str.split(',', 1)[1]
            img_data = base64.b64decode(b64_str)
            file_bytes = np.frombuffer(img_data, np.uint8)
            img_bgr = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
            filename = f"upload_{int(time.time()*1000)}.jpg"
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to decode base64 image: {str(e)}"}), 400

    if img_bgr is None:
        return jsonify({"status": "error", "message": "No valid image file or data provided."}), 400

    # Save uploaded image copy to static/snapshots
    snapshot_url = None
    if filename:
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        cv2.imwrite(filepath, img_bgr)
        snapshot_url = f"/static/snapshots/{filename}"

    # Run MediaPipe emotion analysis
    analysis = process_image_facial_emotion(img_bgr)

    if not analysis:
        return jsonify({
            "status": "error",
            "message": "No face detected in the image. Please upload a clear photo showing a face."
        }), 422

    expression = analysis["expression"]
    confidence = analysis["confidence"]
    smile_score = analysis["smile_score"]
    mar = analysis["mar"]
    ear = analysis["ear"]

    if expression not in session_data["expression_counts"]:
        expression = "Neutral"

    session_data["total_detections"] += 1
    session_data["expression_counts"][expression] += 1
    session_data["smile_scores"].append(smile_score)
    if len(session_data["smile_scores"]) > 200:
        session_data["smile_scores"].pop(0)

    log_entry = {
        "id": len(session_data["recent_logs"]) + 1,
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "expression": expression,
        "confidence": confidence,
        "smile_score": smile_score,
        "mar": mar,
        "ear": ear,
        "snapshot_url": snapshot_url
    }

    if snapshot_url:
        session_data["snapshots"].append({
            "url": snapshot_url,
            "expression": expression,
            "time": log_entry["timestamp"]
        })

    session_data["recent_logs"].append(log_entry)
    if len(session_data["recent_logs"]) > 100:
        session_data["recent_logs"].pop(0)

    return jsonify({
        "status": "success",
        "analysis": analysis,
        "log_entry": log_entry,
        "snapshot_url": snapshot_url,
        "stats": calculate_stats()
    })

if __name__ == '__main__':
    print("Starting Flask Facial Reaction Detection App on http://127.0.0.1:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
