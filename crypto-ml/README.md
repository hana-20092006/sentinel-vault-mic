# Crypto ML Risk Prediction API

This Flask API provides risk prediction for cryptocurrency transactions using a trained machine learning model.

## Features

- **Single Transaction Prediction**: Predict risk score for individual transactions
- **Batch Prediction**: Process multiple transactions at once
- **Risk Classification**: Low, Medium, High risk levels
- **Fraud Detection**: Binary classification with confidence scores
- **CORS Support**: Ready for frontend integration
- **API Documentation**: Built-in documentation endpoint

## Quick Start

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the API server:
```bash
python app.py
```

3. The API will be available at `http://localhost:5000`

## API Endpoints

### GET `/`
Returns API documentation

### GET `/health`
Check if the API is running and model is loaded

### GET `/features`
Get the list of required features for prediction

### POST `/predict`
Predict risk score for a single transaction

**Request:**
```json
{
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
}
```

**Response:**
```json
{
  "risk_score": 15.7,
  "risk_level": "low",
  "is_fraud": false,
  "confidence": 0.843,
  "probabilities": {
    "legitimate": 0.843,
    "fraud": 0.157
  }
}
```

### POST `/predict_batch`
Predict risk scores for multiple transactions

**Request:**
```json
{
  "transactions": [
    { "features": {...} },
    { "features": {...} }
  ]
}
```

## Integration with SentinelVault

The API is designed to be easily integrated with the SentinelVault frontend. The frontend can make POST requests to `/predict` to get risk assessments for wallet addresses and transactions.

## Model Details

- **Algorithm**: Random Forest Classifier
- **Training Data**: Ethereum transaction dataset
- **Features**: 23 transaction features
- **Threshold**: 0.4 for fraud detection
- **Performance**: Optimized for imbalanced dataset using SMOTE

## Environment Variables

- `PORT`: Server port (default: 5000)
- `DEBUG`: Enable debug mode (default: False)

## Production Deployment

For production deployment, use Gunicorn:

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```
