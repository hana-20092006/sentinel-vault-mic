# Chainlink Integration Guide

## Architecture Overview

```
FastAPI Server (AI Risk Model)
   ↓
Prediction (Risk Score)
   ↓
Chainlink (Blockchain logging / verification)
```

## Setup Instructions

### 1. Chainlink Node Setup

**Install Chainlink Node:**
```bash
# Using Docker (recommended)
docker pull smartcontract/chainlink:0.10.7
docker run -p 6688:6688 -v ~/.chainlink:/chainlink -it --add-host=host.docker.internal:host-gateway smartcontract/chainlink:0.10.7 n
```

**Or using npm:**
```bash
npm install -g @chainlink/chainlink
chainlink local init
chainlink local n
```

### 2. Environment Variables

Create a `.env` file in the crypto-ml directory:

```bash
# Chainlink Configuration
CHAINLINK_NODE_URL=http://localhost:6688
CHAINLINK_API_KEY=your-api-key-here
CHAINLINK_JOB_ID=your-job-id-here

# Ethereum Node (for blockchain interaction)
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
ETHEREUM_ACCOUNT_PRIVATE_KEY=your-private-key-here

# FastAPI Configuration
FASTAPI_HOST=0.0.0.0
FASTAPI_PORT=8000
```

### 3. Chainlink Job Configuration

Create a Chainlink job for risk logging:

```json
{
  "initiators": [
    {
      "type": "web",
      "params": {
        "url": "http://localhost:8000/chainlink/webhook"
      }
    }
  ],
  "tasks": [
    {
      "type": "httpget",
      "params": {
        "url": "http://localhost:8000/logs",
        "headers": {
          "Content-Type": "application/json"
        }
      }
    },
    {
      "type": "jsonparse",
      "params": {
        "path": ["0", "risk_score"]
      }
    },
    {
      "type": "ethuint256",
      "params": {}
    },
    {
      "type": "ethtx",
      "params": {
        "address": "YOUR_CONTRACT_ADDRESS"
      }
    }
  ]
}
```

### 4. Smart Contract for Risk Logging

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RiskLogger {
    struct RiskRecord {
        bytes32 transactionHash;
        uint256 riskScore;
        string riskLevel;
        bool isFraud;
        uint256 timestamp;
        bool verified;
    }
    
    mapping(bytes32 => RiskRecord) public riskRecords;
    address public chainlinkNode;
    
    event RiskLogged(
        bytes32 indexed transactionHash,
        uint256 riskScore,
        string riskLevel,
        bool isFraud,
        uint256 timestamp,
        bool verified
    );
    
    constructor(address _chainlinkNode) {
        chainlinkNode = _chainlinkNode;
    }
    
    function logRisk(
        bytes32 _transactionHash,
        uint256 _riskScore,
        string memory _riskLevel,
        bool _isFraud,
        bool _verified
    ) external {
        require(msg.sender == chainlinkNode, "Only Chainlink node can log");
        
        riskRecords[_transactionHash] = RiskRecord({
            transactionHash: _transactionHash,
            riskScore: _riskScore,
            riskLevel: _riskLevel,
            isFraud: _isFraud,
            timestamp: block.timestamp,
            verified: _verified
        });
        
        emit RiskLogged(
            _transactionHash,
            _riskScore,
            _riskLevel,
            _isFraud,
            block.timestamp,
            _verified
        );
    }
    
    function getRiskRecord(bytes32 _transactionHash) external view returns (RiskRecord memory) {
        return riskRecords[_transactionHash];
    }
}
```

### 5. Deployment Steps

**Step 1: Deploy Smart Contract**
```bash
# Using Hardhat or Truffle
npx hardhat compile
npx hardhat run scripts/deploy.js --network mainnet
```

**Step 2: Configure Chainlink Job**
```bash
# Create job via Chainlink UI or API
curl -X POST http://localhost:6688/v2/specs \
  -H 'Content-Type: application/json' \
  -H 'X-Chainlink-EA-AccessKey: YOUR_API_KEY' \
  -H 'X-Chainlink-EA-Secret: YOUR_SECRET' \
  -d @chainlink-job.json
```

**Step 3: Start FastAPI Server**
```bash
cd crypto-ml
pip install -r requirements_fastapi.txt
python fastapi_server.py
```

## API Usage

### 1. Predict Transaction Risk

```bash
curl -X POST http://localhost:8000/predict_transaction \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45",
    "recipient": "0x1234567890123456789012345678901234567890",
    "amount_eth": 1.5,
    "transaction_hash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
  }'
```

### 2. Predict Address Risk

```bash
curl -X POST http://localhost:8000/predict_address \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45"
  }'
```

### 3. Get Risk Logs

```bash
curl http://localhost:8000/logs
```

### 4. Get Statistics

```bash
curl http://localhost:8000/stats
```

## Monitoring

### 1. FastAPI Documentation
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 2. Chainlink Node UI
- Access: `http://localhost:6688`
- Monitor jobs, bridges, and transactions

### 3. Health Checks

```bash
# FastAPI Health
curl http://localhost:8000/health

# Chainlink Node Health
curl http://localhost:6688/v2/health
```

## Production Considerations

### 1. Security
- Use HTTPS for all endpoints
- Implement API key authentication
- Secure private keys and API keys
- Use environment variables for sensitive data

### 2. Scalability
- Deploy FastAPI with Gunicorn or Uvicorn workers
- Use a load balancer for multiple instances
- Implement Redis for caching
- Use PostgreSQL for persistent storage

### 3. Reliability
- Implement retry logic for Chainlink calls
- Add circuit breakers for external APIs
- Monitor and alert on failures
- Implement graceful degradation

### 4. Cost Optimization
- Use Chainlink's price feeds for ETH/USD conversion
- Batch multiple risk predictions
- Optimize gas costs for smart contract interactions
- Use Layer 2 solutions for cheaper transactions

## Troubleshooting

### Common Issues

1. **Chainlink Node Not Responding**
   - Check if node is running: `docker ps`
   - Verify port 6688 is accessible
   - Check node logs: `docker logs <container-id>`

2. **FastAPI Prediction Errors**
   - Verify model files exist: `crypto_model.pkl`, `features.pkl`
   - Check feature names match training data
   - Monitor API logs for errors

3. **Blockchain Logging Failures**
   - Verify Chainlink job configuration
   - Check smart contract address
   - Ensure sufficient ETH for gas fees

### Debug Commands

```bash
# Check FastAPI logs
docker logs <fastapi-container>

# Check Chainlink job status
curl -X GET http://localhost:6688/v2/jobs/<job-id> \
  -H 'X-Chainlink-EA-AccessKey: YOUR_API_KEY' \
  -H 'X-Chainlink-EA-Secret: YOUR_SECRET'

# Verify smart contract interaction
npx hardhat console --network mainnet
> const riskLogger = await ethers.getContractAt("RiskLogger", "CONTRACT_ADDRESS");
> const record = await riskLogger.getRiskRecord("0x...");
```

## Next Steps

1. **Enhanced Features**
   - Real-time transaction monitoring
   - Multi-chain support (Ethereum, Polygon, BSC)
   - Advanced fraud detection algorithms
   - Risk scoring for DeFi protocols

2. **Integration**
   - Connect to DEX protocols (Uniswap, SushiSwap)
   - Integrate with wallet providers (MetaMask, WalletConnect)
   - Add notification systems (email, SMS, Discord)

3. **Analytics**
   - Risk trend analysis
   - Fraud pattern detection
   - Compliance reporting
   - Risk dashboard

This setup provides a production-ready AI risk prediction system with blockchain verification through Chainlink! 🚀
