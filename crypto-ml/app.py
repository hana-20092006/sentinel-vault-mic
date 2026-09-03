from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Load the trained model and features
try:
    model = joblib.load('crypto_model.pkl')
    features = joblib.load('features.pkl')
    logger.info("Model and features loaded successfully")
except Exception as e:
    logger.error(f"Error loading model: {e}")
    model = None
    features = None

# HTML template for API documentation
API_DOCS = """
<!DOCTYPE html>
<html>
<head>
    <title>Crypto ML Risk Prediction API</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .method { color: #fff; padding: 3px 8px; border-radius: 3px; font-weight: bold; }
        .get { background: #61affe; }
        .post { background: #49cc90; }
        code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; }
        pre { background: #f8f8f8; padding: 10px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>Crypto ML Risk Prediction API</h1>
    <p>This API provides risk prediction for cryptocurrency transactions using a trained machine learning model.</p>
    
    <div class="endpoint">
        <h3><span class="method get">GET</span> /</h3>
        <p>Returns this API documentation.</p>
    </div>
    
    <div class="endpoint">
        <h3><span class="method get">GET</span> /health</h3>
        <p>Check if the API is running and model is loaded.</p>
        <pre>{
  "status": "healthy",
  "model_loaded": true
}</pre>
    </div>
    
    <div class="endpoint">
        <h3><span class="method post">POST</span> /predict</h3>
        <p>Predict risk score for transaction data.</p>
        <h4>Request Body:</h4>
        <pre>{
  "features": {
    "Avg_min_between_sent_tnx": 0.5,
    "Avg_min_between_received_tnx": 2.3,
    "Time_Diff_between_first_and_last(Mins)": 1000,
    "Sent_tnx": 15,
    "Received_tnx": 25,
    "Number_of_Created_Contracts": 0,
    "Unique_Received_From_Addresses": 20,
    "Unique_Sent_To_Addresses": 12,
    "min_value_received": 0.001,
    "max_value_received": 10.5,
    "avg_val_received": 2.3,
    "min_val_sent": 0.0005,
    "max_val_sent": 5.2,
    "avg_val_sent": 1.8,
    "total_eth_sent": 25.5,
    "total_eth_received": 45.2,
    "total_eth_balance": 19.7,
    "total_erc20_tnxs": 8,
    "erc20_total_eth_sent": 12.3,
    "erc20_total_eth_received": 8.7,
    "erc20_total_eth_balance": -3.6
  }
}</pre>
        <h4>Response:</h4>
        <pre>{
  "risk_score": 15.7,
  "risk_level": "low",
  "is_fraud": false,
  "confidence": 0.843
}</pre>
    </div>
    
    <div class="endpoint">
        <h3><span class="method get">GET</span> /features</h3>
        <p>Get the list of required features for prediction.</p>
    </div>
</body>
</html>
"""

@app.route('/')
def home():
    """API documentation endpoint"""
    return render_template_string(API_DOCS)

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'features_loaded': features is not None
    })

@app.route('/features')
def get_features():
    """Get required features for prediction"""
    if features is None:
        return jsonify({'error': 'Features not loaded'}), 500
    
    return jsonify({
        'features': features.tolist(),
        'count': len(features)
    })

@app.route('/predict', methods=['POST'])
def predict():
    """Predict risk score for transaction data"""
    try:
        if model is None or features is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'features' not in data:
            return jsonify({'error': 'No features provided'}), 400
        
        # Convert features to DataFrame in the correct order
        input_features = data['features']
        
        # Create DataFrame with features in the correct order
        df = pd.DataFrame([input_features], columns=features)
        
        # Fill missing values with 0 (same as training)
        df = df.fillna(0)
        
        # Make prediction
        prediction_proba = model.predict_proba(df)[0]
        risk_score = prediction_proba[1] * 100  # Convert to percentage
        is_fraud = prediction_proba[1] > 0.4  # Using the same threshold as training
        
        # Determine risk level
        if risk_score < 20:
            risk_level = 'low'
        elif risk_score < 50:
            risk_level = 'medium'
        else:
            risk_level = 'high'
        
        return jsonify({
            'risk_score': round(risk_score, 2),
            'risk_level': risk_level,
            'is_fraud': bool(is_fraud),
            'confidence': round(max(prediction_proba), 3),
            'probabilities': {
                'legitimate': round(prediction_proba[0], 3),
                'fraud': round(prediction_proba[1], 3)
            }
        })
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500

@app.route('/predict_batch', methods=['POST'])
def predict_batch():
    """Predict risk scores for multiple transactions"""
    try:
        if model is None or features is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'transactions' not in data:
            return jsonify({'error': 'No transactions provided'}), 400
        
        transactions = data['transactions']
        results = []
        
        for i, tx_features in enumerate(transactions):
            try:
                # Create DataFrame with features in the correct order
                df = pd.DataFrame([tx_features], columns=features)
                df = df.fillna(0)
                
                # Make prediction
                prediction_proba = model.predict_proba(df)[0]
                risk_score = prediction_proba[1] * 100
                is_fraud = prediction_proba[1] > 0.4
                
                # Determine risk level
                if risk_score < 20:
                    risk_level = 'low'
                elif risk_score < 50:
                    risk_level = 'medium'
                else:
                    risk_level = 'high'
                
                results.append({
                    'transaction_id': i,
                    'risk_score': round(risk_score, 2),
                    'risk_level': risk_level,
                    'is_fraud': bool(is_fraud),
                    'confidence': round(max(prediction_proba), 3)
                })
                
            except Exception as e:
                results.append({
                    'transaction_id': i,
                    'error': str(e)
                })
        
        return jsonify({
            'results': results,
            'total_processed': len(transactions),
            'successful': len([r for r in results if 'error' not in r])
        })
        
    except Exception as e:
        logger.error(f"Batch prediction error: {e}")
        return jsonify({'error': f'Batch prediction failed: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting Crypto ML API on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
