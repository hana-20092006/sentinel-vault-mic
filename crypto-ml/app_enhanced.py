from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np
import os
import logging
import requests

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

# Etherscan API for getting recipient wallet data
ETHERSCAN_API_KEY = os.environ.get('ETHERSCAN_API_KEY', '')
ETHERSCAN_BASE_URL = "https://api.etherscan.io/api"

def get_wallet_transactions(address):
    """Fetch transaction data for any Ethereum address"""
    try:
        params = {
            'module': 'account',
            'action': 'txlist',
            'address': address,
            'startblock': '0',
            'endblock': 'latest',
            'sort': 'desc',
            'page': '1',
            'offset': '100'
        }
        
        if ETHERSCAN_API_KEY:
            params['apikey'] = ETHERSCAN_API_KEY
        else:
            # Use free Blockscout API if no API key
            return get_wallet_transactions_blockscout(address)
        
        response = requests.get(ETHERSCAN_BASE_URL, params=params, timeout=10)
        data = response.json()
        
        if data.get('status') == '1':
            return data.get('result', [])
        else:
            return []
            
    except Exception as e:
        logger.error(f"Error fetching transactions for {address}: {e}")
        return []

def get_wallet_transactions_blockscout(address):
    """Fallback to Blockscout API"""
    try:
        url = f"https://eth.blockscout.com/api?module=account&action=txlist&address={address}"
        response = requests.get(url, timeout=10)
        data = response.json()
        return data.get('result', [])
    except:
        return []

def extract_features_from_transactions(transactions, address):
    """Extract ML features from transaction data using correct feature names"""
    if not transactions:
        # Return default features for new/empty wallets with correct names
        feature_list = list(features)
        return {name: 0 for name in feature_list}
    
    # Filter transactions for this address
    sent_txs = [tx for tx in transactions if tx.get('from', '').lower() == address.lower()]
    received_txs = [tx for tx in transactions if tx.get('to', '').lower() == address.lower()]
    
    # Basic transaction counts
    sent_count = len(sent_txs)
    received_count = len(received_txs)
    
    # Unique addresses
    unique_sent_to = len(set(tx.get('to', '') for tx in sent_txs if tx.get('to')))
    unique_received_from = len(set(tx.get('from', '') for tx in received_txs if tx.get('from')))
    
    # Value calculations (convert from Wei to ETH)
    sent_values = [float(tx.get('value', 0)) / 1e18 for tx in sent_txs if float(tx.get('value', 0)) > 0]
    received_values = [float(tx.get('value', 0)) / 1e18 for tx in received_txs if float(tx.get('value', 0)) > 0]
    
    # Time calculations
    timestamps = [int(tx.get('timeStamp', 0)) for tx in transactions if tx.get('timeStamp', '0').isdigit()]
    
    # Create feature dict with all required features (set to 0 if not applicable)
    feature_dict = {}
    feature_list = list(features)
    
    for feature in feature_list:
        feature_dict[feature] = 0
    
    # Fill in the features we can calculate
    feature_dict['Avg min between sent tnx'] = 0
    feature_dict['Avg min between received tnx'] = 0
    feature_dict['Time Diff between first and last (Mins)'] = 0
    feature_dict['Sent tnx'] = sent_count
    feature_dict['Received Tnx'] = received_count
    feature_dict['Number of Created Contracts'] = 0  # Would need contract detection
    feature_dict['Unique Received From Addresses'] = unique_received_from
    feature_dict['Unique Sent To Addresses'] = unique_sent_to
    feature_dict['min value received'] = min(received_values) if received_values else 0
    feature_dict['max value received '] = max(received_values) if received_values else 0
    feature_dict['avg val received'] = np.mean(received_values) if received_values else 0
    feature_dict['min val sent'] = min(sent_values) if sent_values else 0
    feature_dict['max val sent'] = max(sent_values) if sent_values else 0
    feature_dict['avg val sent'] = np.mean(sent_values) if sent_values else 0
    feature_dict['total Ether sent'] = sum(sent_values)
    feature_dict['total ether received'] = sum(received_values)
    feature_dict['total ether balance'] = sum(received_values) - sum(sent_values)
    
    # Calculate time differences
    if len(timestamps) > 1:
        timestamps.sort()
        time_diff_minutes = (timestamps[-1] - timestamps[0]) / 60
        feature_dict['Time Diff between first and last (Mins)'] = time_diff_minutes
        
        # Average time between transactions
        if len(timestamps) > 2:
            time_diffs = [(timestamps[i] - timestamps[i-1]) / 60 for i in range(1, len(timestamps))]
            feature_dict['Avg min between sent tnx'] = np.mean(time_diffs)
            feature_dict['Avg min between received tnx'] = np.mean(time_diffs)
    
    return feature_dict

def predict_risk_for_address(address):
    """Get risk prediction for any Ethereum address"""
    try:
        # Fetch transaction data
        transactions = get_wallet_transactions(address)
        
        # Extract features
        features = extract_features_from_transactions(transactions, address)
        
        # Create DataFrame with features in the correct order
        df = pd.DataFrame([features], columns=features)
        
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
        
        return {
            'address': address,
            'risk_score': round(risk_score, 2),
            'risk_level': risk_level,
            'is_fraud': bool(is_fraud),
            'confidence': round(max(prediction_proba), 3),
            'probabilities': {
                'legitimate': round(prediction_proba[0], 3),
                'fraud': round(prediction_proba[1], 3)
            },
            'transaction_count': len(transactions),
            'features_analyzed': features
        }
        
    except Exception as e:
        logger.error(f"Error predicting risk for {address}: {e}")
        return {
            'address': address,
            'error': str(e),
            'risk_score': 50,
            'risk_level': 'unknown',
            'is_fraud': False,
            'confidence': 0
        }

# HTML template for API documentation
API_DOCS = """
<!DOCTYPE html>
<html>
<head>
    <title>Enhanced Crypto ML Risk Prediction API</title>
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
    <h1>Enhanced Crypto ML Risk Prediction API</h1>
    <p>This API provides risk prediction for ANY cryptocurrency wallet address (sender or recipient).</p>
    
    <div class="endpoint">
        <h3><span class="method get">GET</span> /</h3>
        <p>Returns this API documentation.</p>
    </div>
    
    <div class="endpoint">
        <h3><span class="method get">GET</span> /health</h3>
        <p>Check if the API is running and model is loaded.</p>
    </div>
    
    <div class="endpoint">
        <h3><span class="method post">POST</span> /predict_address</h3>
        <p>Analyze risk for ANY wallet address (sender or recipient).</p>
        <h4>Request Body:</h4>
        <pre>{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45"
}</pre>
        <h4>Response:</h4>
        <pre>{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45",
  "risk_score": 15.7,
  "risk_level": "low",
  "is_fraud": false,
  "confidence": 0.843,
  "probabilities": {
    "legitimate": 0.843,
    "fraud": 0.157
  },
  "transaction_count": 127,
  "features_analyzed": {...}
}</pre>
    </div>
    
    <div class="endpoint">
        <h3><span class="method post">POST</span> /predict_transaction</h3>
        <p>Analyze risk for a specific transaction (both sender and recipient).</p>
        <h4>Request Body:</h4>
        <pre>{
  "sender": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45",
  "recipient": "0x1234567890123456789012345678901234567890",
  "amount_eth": 1.5
}</pre>
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
        'features_loaded': features is not None,
        'api_type': 'enhanced_with_recipient_analysis'
    })

@app.route('/predict_address', methods=['POST'])
def predict_address():
    """Predict risk for any wallet address"""
    try:
        if model is None or features is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'address' not in data:
            return jsonify({'error': 'Address is required'}), 400
        
        address = data['address']
        if not address.startswith('0x') or len(address) != 42:
            return jsonify({'error': 'Invalid Ethereum address format'}), 400
        
        result = predict_risk_for_address(address)
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Address prediction error: {e}")
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500

@app.route('/predict_transaction', methods=['POST'])
def predict_transaction():
    """Predict risk for a specific transaction (both sender and recipient)"""
    try:
        if model is None or features is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'sender' not in data or 'recipient' not in data:
            return jsonify({'error': 'Both sender and recipient addresses are required'}), 400
        
        sender = data['sender']
        recipient = data['recipient']
        amount = data.get('amount_eth', 0)
        
        # Analyze both addresses
        sender_risk = predict_risk_for_address(sender)
        recipient_risk = predict_risk_for_address(recipient)
        
        # Calculate combined transaction risk
        combined_risk_score = (sender_risk['risk_score'] + recipient_risk['risk_score']) / 2
        
        # Adjust for amount (large amounts are riskier)
        if amount > 10:  # Large transaction
            combined_risk_score = min(100, combined_risk_score * 1.2)
        elif amount > 1:  # Medium transaction
            combined_risk_score = min(100, combined_risk_score * 1.1)
        
        # Determine combined risk level
        if combined_risk_score < 20:
            combined_risk_level = 'low'
        elif combined_risk_score < 50:
            combined_risk_level = 'medium'
        else:
            combined_risk_level = 'high'
        
        return jsonify({
            'transaction': {
                'sender': sender,
                'recipient': recipient,
                'amount_eth': amount
            },
            'sender_risk': sender_risk,
            'recipient_risk': recipient_risk,
            'combined_risk': {
                'risk_score': round(combined_risk_score, 2),
                'risk_level': combined_risk_level,
                'recommendation': 'safe' if combined_risk_score < 30 else 'caution' if combined_risk_score < 70 else 'risky'
            }
        })
        
    except Exception as e:
        logger.error(f"Transaction prediction error: {e}")
        return jsonify({'error': f'Transaction prediction failed: {str(e)}'}), 500

@app.route('/predict', methods=['POST'])
def predict():
    """Original endpoint for backward compatibility"""
    try:
        if model is None or features is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'features' not in data:
            return jsonify({'error': 'No features provided'}), 400
        
        # Convert features to DataFrame in the correct order
        input_features = data['features']
        
        # Create DataFrame with features in the correct order
        feature_list = list(features)
        df = pd.DataFrame([input_features], columns=feature_list)
        
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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting Enhanced Crypto ML API on port {port}")
    logger.info("New features: Recipient analysis, transaction risk assessment")
    app.run(host='0.0.0.0', port=port, debug=debug)
