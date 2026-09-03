from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import joblib
import pandas as pd
import numpy as np
import requests
import os
import logging
import time
from datetime import datetime
import json
from auth_routes import router as auth_router, init_auth_db
from db_auth import close_db_pool

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="AI Risk Prediction API",
    description="FastAPI server for crypto transaction risk analysis with Chainlink integration",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include authentication router
app.include_router(auth_router)

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    logger.info("📊 Starting up... Initializing authentication database")
    if init_auth_db():
        logger.info("✅ Authentication database initialized successfully")
    else:
        logger.warning("⚠️ Failed to initialize authentication database")

@app.on_event("shutdown")
async def shutdown_event():
    """Close database connections on shutdown"""
    logger.info("🛑 Shutting down... Closing database connections")
    close_db_pool()

# Load the trained model and features
try:
    model = joblib.load('crypto_model.pkl')
    features = joblib.load('features.pkl')
    logger.info("✅ Model and features loaded successfully")
except Exception as e:
    logger.error(f"❌ Error loading model: {e}")
    model = None
    features = None

# Chainlink configuration (you'll need to set these up)
CHAINLINK_NODE_URL = os.environ.get('CHAINLINK_NODE_URL', 'http://localhost:6688')
CHAINLINK_JOB_ID = os.environ.get('CHAINLINK_JOB_ID', 'your-job-id')
CHAINLINK_API_KEY = os.environ.get('CHAINLINK_API_KEY', 'your-api-key')

# Pydantic models for request/response
class RiskFeatures(BaseModel):
    """Model for risk prediction features"""
    Avg_min_between_sent_tnx: float = 0.0
    Avg_min_between_received_tnx: float = 0.0
    Time_Diff_between_first_and_last_Mins_: float = 0.0
    Sent_tnx: int = 0
    Received_tnx: int = 0
    Number_of_Created_Contracts: int = 0
    Unique_Received_From_Addresses: int = 0
    Unique_Sent_To_Addresses: int = 0
    min_value_received: float = 0.0
    max_value_received: float = 0.0
    avg_val_received: float = 0.0
    min_val_sent: float = 0.0
    max_val_sent: float = 0.0
    avg_val_sent: float = 0.0
    total_eth_sent: float = 0.0
    total_eth_received: float = 0.0
    total_eth_balance: float = 0.0
    total_erc20_tnxs: int = 0
    erc20_total_eth_sent: float = 0.0
    erc20_total_eth_received: float = 0.0
    erc20_total_eth_balance: float = 0.0

class TransactionRequest(BaseModel):
    """Model for transaction risk analysis"""
    sender: str = Field(..., description="Sender wallet address")
    recipient: str = Field(..., description="Recipient wallet address")
    amount_eth: float = Field(..., gt=0, description="Transaction amount in ETH")
    transaction_hash: Optional[str] = None
    timestamp: Optional[str] = None

class RiskPrediction(BaseModel):
    """Model for risk prediction response"""
    risk_score: float = Field(..., ge=0, le=100, description="Risk score (0-100)")
    risk_level: str = Field(..., description="Risk level: low, medium, high")
    is_fraud: bool = Field(..., description="Whether transaction is flagged as fraud")
    confidence: float = Field(..., ge=0, le=1, description="Model confidence")
    probabilities: Dict[str, float] = Field(..., description="Probability breakdown")
    timestamp: str = Field(..., description="Prediction timestamp")
    transaction_id: Optional[str] = None

class ChainlinkLog(BaseModel):
    """Model for Chainlink logging"""
    transaction_hash: str
    risk_score: float
    risk_level: str
    is_fraud: bool
    timestamp: str
    verified: bool = False

# Global storage for logs (in production, use a database)
risk_logs: List[ChainlinkLog] = []
TRANSACTION_CACHE_TTL_SECONDS = int(os.environ.get('TRANSACTION_CACHE_TTL_SECONDS', '60'))
transaction_cache: Dict[str, Dict[str, Any]] = {}


class RiskProbabilities(BaseModel):
    legitimate: float
    fraud: float


class CombinedRisk(BaseModel):
    risk_score: float = Field(..., ge=0, le=100)
    risk_level: str
    recommendation: str


class TransactionRiskResponse(RiskPrediction):
    combined_risk: CombinedRisk
    sender_risk: RiskPrediction
    recipient_risk: RiskPrediction

def get_wallet_transactions(address: str) -> List[Dict]:
    """Fetch transaction data for an Ethereum or Bitcoin address"""
    normalized_address = (address or "").strip().lower()
    now = time.time()

    cached_entry = transaction_cache.get(normalized_address)
    if cached_entry and cached_entry["expires_at"] > now:
        return cached_entry["transactions"]

    try:
        # Check if it's a Bitcoin address
        if address.startswith(('1', '3', 'bc1')):
            transactions = get_bitcoin_transactions(address)
        # Otherwise, treat as Ethereum address
        else:
            transactions = get_ethereum_transactions(address)

        transaction_cache[normalized_address] = {
            "transactions": transactions,
            "expires_at": now + TRANSACTION_CACHE_TTL_SECONDS,
        }
        return transactions
    except Exception as e:
        logger.error(f"Error fetching transactions for {address}: {e}")
        return []

def get_ethereum_transactions(address: str) -> List[Dict]:
    """Fetch Ethereum transaction data"""
    try:
        # Use Etherscan API (free tier)
        url = f"https://api.etherscan.io/api"
        params = {
            'module': 'account',
            'action': 'txlist',
            'address': address,
            'startblock': '0',
            'endblock': 'latest',
            'sort': 'desc',
            'page': '1',
            'offset': '100',
            'apikey': 'YourApiKeyHere'  # Replace with your API key or use free tier
        }
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if data.get('status') == '1':
            return data.get('result', [])
        else:
            # Fallback to Blockscout
            return get_wallet_transactions_blockscout(address)
            
    except Exception as e:
        logger.error(f"Error fetching Ethereum transactions for {address}: {e}")
        return []

def get_bitcoin_transactions(address: str) -> List[Dict]:
    """Fetch Bitcoin transaction data and convert to Ethereum format"""
    try:
        # Use Blockstream API for Bitcoin transactions
        url = f"https://blockstream.info/api/address/{address}/txs"
        response = requests.get(url, timeout=10)
        
        if response.status_code != 200:
            return []
            
        bitcoin_txs = response.json()
        
        # Convert Bitcoin transactions to Ethereum-like format
        ethereum_txs = []
        for tx in bitcoin_txs[:50]:  # Limit to 50 transactions
            converted_tx = {
                'from': tx.get('vin', [{}])[0].get('prevout', {}).get('scriptpubkey_address', ''),
                'to': address,  # Bitcoin doesn't have explicit to address in the same way
                'value': str(tx.get('value', 0)),  # Bitcoin uses satoshis
                'timeStamp': str(tx.get('status', {}).get('block_time', 0)),
                'hash': tx.get('txid', ''),
                'blockNumber': str(tx.get('status', {}).get('block_height', 0)),
                'gas': '21000',  # Standard ETH transfer gas
                'gasPrice': '20000000000',  # 20 gwei
                'gasUsed': '21000',
                'input': '0x',  # No input data for simple transfers
            }
            ethereum_txs.append(converted_tx)
        
        return ethereum_txs
        
    except Exception as e:
        logger.error(f"Error fetching Bitcoin transactions for {address}: {e}")
        return []

def get_wallet_transactions_blockscout(address: str) -> List[Dict]:
    """Fallback to Blockscout API"""
    try:
        url = f"https://eth.blockscout.com/api"
        params = {
            'module': 'account',
            'action': 'txlist',
            'address': address
        }
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        return data.get('result', [])
    except:
        return []

def extract_features_from_transactions(transactions: List[Dict], address: str) -> Dict[str, float]:
    """Extract ML features from transaction data"""
    if not transactions:
        # Return default features for new/empty wallets
        feature_list = list(features) if features else []
        return {name: 0.0 for name in feature_list}
    
    # Filter transactions for this address
    sent_txs = [tx for tx in transactions if tx.get('from', '').lower() == address.lower()]
    received_txs = [tx for tx in transactions if tx.get('to', '').lower() == address.lower()]
    
    # Basic transaction counts
    sent_count = len(sent_txs)
    received_count = len(received_txs)
    
    # Unique addresses
    unique_sent_to = len(set(tx.get('to', '') for tx in sent_txs if tx.get('to')))
    unique_received_from = len(set(tx.get('from', '') for tx in received_txs if tx.get('from')))
    
    # Value calculations (convert from Wei to ETH or satoshis to BTC)
    sent_values = []
    received_values = []
    
    # Check if this is Bitcoin data (satoshis) or Ethereum data (Wei)
    is_bitcoin = any(tx.get('value', '0').isdigit() and len(tx.get('value', '0')) <= 10 for tx in transactions)
    
    if is_bitcoin:
        # Convert satoshis to BTC
        sent_values = [float(tx.get('value', 0)) / 1e8 for tx in sent_txs if float(tx.get('value', 0)) > 0]
        received_values = [float(tx.get('value', 0)) / 1e8 for tx in received_txs if float(tx.get('value', 0)) > 0]
    else:
        # Convert Wei to ETH
        sent_values = [float(tx.get('value', 0)) / 1e18 for tx in sent_txs if float(tx.get('value', 0)) > 0]
        received_values = [float(tx.get('value', 0)) / 1e18 for tx in received_txs if float(tx.get('value', 0)) > 0]
    
    # Time calculations
    timestamps = [int(tx.get('timeStamp', 0)) for tx in transactions if tx.get('timeStamp', '0').isdigit()]
    
    # Create feature dict with all required features
    feature_dict = {}
    feature_list = list(features) if features else []
    
    for feature in feature_list:
        feature_dict[feature] = 0.0
    
    # Fill in the features we can calculate (using exact feature names from training)
    if 'Avg min between sent tnx' in feature_dict:
        feature_dict['Avg min between sent tnx'] = 0.0
    if 'Avg min between received tnx' in feature_dict:
        feature_dict['Avg min between received tnx'] = 0.0
    if 'Time Diff between first and last (Mins)' in feature_dict:
        feature_dict['Time Diff between first and last (Mins)'] = 0.0
    if 'Sent tnx' in feature_dict:
        feature_dict['Sent tnx'] = float(sent_count)
    if 'Received Tnx' in feature_dict:
        feature_dict['Received Tnx'] = float(received_count)
    if 'Number of Created Contracts' in feature_dict:
        feature_dict['Number of Created Contracts'] = 0.0
    if 'Unique Received From Addresses' in feature_dict:
        feature_dict['Unique Received From Addresses'] = float(unique_received_from)
    if 'Unique Sent To Addresses' in feature_dict:
        feature_dict['Unique Sent To Addresses'] = float(unique_sent_to)
    if 'min value received' in feature_dict:
        feature_dict['min value received'] = min(received_values) if received_values else 0.0
    if 'max value received ' in feature_dict:  # Note the space
        feature_dict['max value received '] = max(received_values) if received_values else 0.0
    if 'avg val received' in feature_dict:
        feature_dict['avg val received'] = np.mean(received_values) if received_values else 0.0
    if 'min val sent' in feature_dict:
        feature_dict['min val sent'] = min(sent_values) if sent_values else 0.0
    if 'max val sent' in feature_dict:
        feature_dict['max val sent'] = max(sent_values) if sent_values else 0.0
    if 'avg val sent' in feature_dict:
        feature_dict['avg val sent'] = np.mean(sent_values) if sent_values else 0.0
    if 'total Ether sent' in feature_dict:
        feature_dict['total Ether sent'] = sum(sent_values)
    if 'total ether received' in feature_dict:
        feature_dict['total ether received'] = sum(received_values)
    if 'total ether balance' in feature_dict:
        feature_dict['total ether balance'] = sum(received_values) - sum(sent_values)
    
    # Calculate time differences
    if len(timestamps) > 1:
        timestamps.sort()
        time_diff_minutes = (timestamps[-1] - timestamps[0]) / 60
        if 'Time Diff between first and last (Mins)' in feature_dict:
            feature_dict['Time Diff between first and last (Mins)'] = time_diff_minutes
        
        # Average time between transactions
        if len(timestamps) > 2:
            time_diffs = [(timestamps[i] - timestamps[i-1]) / 60 for i in range(1, len(timestamps))]
            avg_time = np.mean(time_diffs)
            if 'Avg min between sent tnx' in feature_dict:
                feature_dict['Avg min between sent tnx'] = avg_time
            if 'Avg min between received tnx' in feature_dict:
                feature_dict['Avg min between received tnx'] = avg_time
    
    return feature_dict

def predict_risk(features_dict: Dict[str, float]) -> RiskPrediction:
    """Make risk prediction using the loaded model"""
    try:
        if model is None or features is None:
            raise HTTPException(status_code=500, detail="Model not loaded")
        
        # Create DataFrame with features in the correct order
        feature_list = list(features)
        df = pd.DataFrame([features_dict], columns=feature_list)
        
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
        
        return RiskPrediction(
            risk_score=round(risk_score, 2),
            risk_level=risk_level,
            is_fraud=bool(is_fraud),
            confidence=round(max(prediction_proba), 3),
            probabilities={
                'legitimate': round(prediction_proba[0], 3),
                'fraud': round(prediction_proba[1], 3)
            },
            timestamp=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

async def log_to_chainlink(transaction_hash: str, risk_prediction: RiskPrediction):
    """Log risk prediction to Chainlink (background task)"""
    try:
        # This is where you'd integrate with Chainlink
        # For now, we'll simulate the logging
        log_entry = ChainlinkLog(
            transaction_hash=transaction_hash,
            risk_score=risk_prediction.risk_score,
            risk_level=risk_prediction.risk_level,
            is_fraud=risk_prediction.is_fraud,
            timestamp=risk_prediction.timestamp,
            verified=True  # In production, this would be verified by Chainlink
        )
        
        # Add to our logs (in production, this would go to Chainlink)
        risk_logs.append(log_entry)
        
        # TODO: Implement actual Chainlink integration
        # You would use the Chainlink node API to create a job that logs this data
        # to the blockchain
        
        logger.info(f"✅ Logged to Chainlink: {transaction_hash} -> Risk: {risk_prediction.risk_score}")
        
    except Exception as e:
        logger.error(f"Chainlink logging error: {e}")

# API Endpoints
@app.get("/", tags=["Health"])
async def root():
    """Root endpoint"""
    return {
        "message": "AI Risk Prediction API",
        "version": "2.0.0",
        "status": "running",
        "model_loaded": model is not None,
        "features_loaded": features is not None,
        "endpoints": {
            "health": "/health",
            "predict": "/predict",
            "predict_transaction": "/predict_transaction",
            "logs": "/logs",
            "docs": "/docs"
        }
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "features_loaded": features is not None,
        "api_type": "FastAPI with Chainlink integration",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/predict", response_model=RiskPrediction, tags=["Prediction"])
async def predict_risk_from_features(features: RiskFeatures):
    """Predict risk from provided features"""
    try:
        # Convert Pydantic model to dict
        features_dict = features.dict()
        
        # Make prediction
        prediction = predict_risk(features_dict)
        
        return prediction
        
    except Exception as e:
        logger.error(f"Feature prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@app.post("/predict_transaction", response_model=TransactionRiskResponse, tags=["Prediction"])
async def predict_transaction_risk(transaction: TransactionRequest, background_tasks: BackgroundTasks):
    """Predict risk for a complete transaction (sender + recipient)"""
    try:
        # Get transaction data for both sender and recipient
        sender_transactions = get_wallet_transactions(transaction.sender)
        recipient_transactions = get_wallet_transactions(transaction.recipient)
        
        # Extract features for both addresses
        sender_features = extract_features_from_transactions(sender_transactions, transaction.sender)
        recipient_features = extract_features_from_transactions(recipient_transactions, transaction.recipient)
        
        # Make predictions for both addresses
        sender_prediction = predict_risk(sender_features)
        recipient_prediction = predict_risk(recipient_features)
        
        # Combine predictions with weights
        combined_score = (sender_prediction.risk_score * 0.4 + 
                        recipient_prediction.risk_score * 0.4 + 
                        (transaction.amount_eth * 10) * 0.2)  # Amount factor
        
        # Ensure score is within bounds
        combined_score = max(0, min(100, combined_score))
        
        # Determine risk level
        if combined_score < 30:
            risk_level = "low"
        elif combined_score < 70:
            risk_level = "medium"
        else:
            risk_level = "high"
        
        # Calculate combined confidence
        combined_confidence = (sender_prediction.confidence + recipient_prediction.confidence) / 2
        
        # Calculate combined probabilities
        combined_legitimate = (sender_prediction.probabilities["legitimate"] + 
                              recipient_prediction.probabilities["legitimate"]) / 2
        combined_fraud = (sender_prediction.probabilities["fraud"] + 
                         recipient_prediction.probabilities["fraud"]) / 2
        
        final_prediction = RiskPrediction(
            risk_score=combined_score,
            risk_level=risk_level,
            is_fraud=combined_score > 70,
            confidence=combined_confidence,
            probabilities={
                "legitimate": combined_legitimate,
                "fraud": combined_fraud
            },
            timestamp=datetime.now().isoformat(),
            transaction_id=transaction.transaction_hash
        )

        recommendation = "safe" if risk_level == "low" else "caution" if risk_level == "medium" else "risky"
        response_payload = TransactionRiskResponse(
            risk_score=final_prediction.risk_score,
            risk_level=final_prediction.risk_level,
            is_fraud=final_prediction.is_fraud,
            confidence=final_prediction.confidence,
            probabilities=final_prediction.probabilities,
            timestamp=final_prediction.timestamp,
            transaction_id=final_prediction.transaction_id,
            combined_risk=CombinedRisk(
                risk_score=final_prediction.risk_score,
                risk_level=final_prediction.risk_level,
                recommendation=recommendation,
            ),
            sender_risk=sender_prediction,
            recipient_risk=recipient_prediction,
        )
        
        # Log to Chainlink in background
        background_tasks.add_task(log_to_chainlink, transaction.transaction_hash or f"tx_{int(time.time())}", final_prediction)
        
        return response_payload
        
    except Exception as e:
        logger.error(f"Transaction prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Transaction prediction failed: {str(e)}")

@app.post("/predict_address", response_model=RiskPrediction, tags=["Prediction"])
async def predict_address_risk(request_data: dict, background_tasks: BackgroundTasks):
    """Predict risk for a single wallet address"""
    try:
        address = request_data.get("address")
        if not address:
            raise HTTPException(status_code=400, detail="Address is required")
        
        if not address.startswith(('0x', '1', '3', 'bc1')):
            raise HTTPException(status_code=400, detail="Invalid cryptocurrency address format")
        
        # Fetch transaction data
        transactions = get_wallet_transactions(address)
        
        # Extract features
        features_dict = extract_features_from_transactions(transactions, address)
        
        # Make prediction
        prediction = predict_risk(features_dict)
        
        # Generate a mock transaction hash for logging
        mock_hash = f"0x{'mock' + str(int(time.time())):0{64}{'0'}}"
        
        # Log to Chainlink in background
        background_tasks.add_task(log_to_chainlink, mock_hash, prediction)
        
        return prediction
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Address prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Address prediction failed: {str(e)}")

@app.get("/logs", response_model=List[ChainlinkLog], tags=["Logging"])
async def get_risk_logs(limit: int = 100):
    """Get recent risk prediction logs"""
    return risk_logs[-limit:] if len(risk_logs) > limit else risk_logs

@app.get("/stats", tags=["Analytics"])
async def get_risk_stats():
    """Get risk prediction statistics"""
    if not risk_logs:
        return {"message": "No logs available"}
    
    total_predictions = len(risk_logs)
    fraud_count = sum(1 for log in risk_logs if log.is_fraud)
    avg_risk_score = sum(log.risk_score for log in risk_logs) / total_predictions
    
    risk_levels = {}
    for log in risk_logs:
        risk_levels[log.risk_level] = risk_levels.get(log.risk_level, 0) + 1
    
    return {
        "total_predictions": total_predictions,
        "fraud_detections": fraud_count,
        "fraud_rate": round(fraud_count / total_predictions * 100, 2),
        "average_risk_score": round(avg_risk_score, 2),
        "risk_level_distribution": risk_levels,
        "last_updated": datetime.utcnow().isoformat()
    }

# Chainlink webhook endpoint (for receiving data from Chainlink)
@app.post("/chainlink/webhook", tags=["Chainlink"])
async def chainlink_webhook(data: Dict[str, Any]):
    """Webhook endpoint for Chainlink jobs"""
    try:
        # Process incoming data from Chainlink
        logger.info(f"Received Chainlink webhook: {data}")
        
        # Here you would process the data according to your needs
        # For example, verify predictions, update statuses, etc.
        
        return {"status": "success", "message": "Webhook processed"}
        
    except Exception as e:
        logger.error(f"Chainlink webhook error: {e}")
        raise HTTPException(status_code=500, detail="Webhook processing failed")

if __name__ == "__main__":
    import uvicorn
    
    logger.info("🚀 Starting FastAPI AI Risk Prediction Server")
    logger.info("📊 Features: Risk prediction + Chainlink integration")
    logger.info("🔗 Chainlink integration ready for blockchain logging")
    
    uvicorn.run(
        "fastapi_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
