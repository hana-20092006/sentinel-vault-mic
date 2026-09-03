import { NextRequest, NextResponse } from 'next/server';

const CRYPTO_ML_API_URL = process.env.CRYPTO_ML_API_URL || 'http://localhost:8000';

type RiskPayload = {
  risk_score?: number;
  risk_level?: string;
  is_fraud?: boolean;
  confidence?: number;
  probabilities?: {
    legitimate?: number;
    fraud?: number;
  };
  combined_risk?: {
    risk_score?: number;
    risk_level?: string;
    recommendation?: string;
  };
  sender_risk?: RiskPayload;
  recipient_risk?: RiskPayload;
};

type ChainlinkLog = {
  transaction_hash: string;
  verified: boolean;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function confirmChainlinkLog(transactionHash: string): Promise<{ logged: boolean; verified: boolean }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`${CRYPTO_ML_API_URL}/logs?limit=25`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (response.ok) {
        const logs: ChainlinkLog[] = await response.json();
        const match = logs.find((log) => log.transaction_hash === transactionHash);

        if (match) {
          return {
            logged: true,
            verified: Boolean(match.verified),
          };
        }
      }
    } catch (_error) {
      // Ignore retry errors and fall through to the next attempt.
    }

    await wait(400);
  }

  return {
    logged: false,
    verified: false,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const transactionHash = body.transaction_hash || `tx_${Date.now()}`;
    const transactionRequest = {
      ...body,
      transaction_hash: transactionHash,
    };
    
    const transactionResponse = await fetch(`${CRYPTO_ML_API_URL}/predict_transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionRequest),
    });

    // Check all responses
    if (!transactionResponse.ok) {
      const errorData = await transactionResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to get transaction risk prediction' },
        { status: transactionResponse.status }
      );
    }

    const transactionData: RiskPayload = await transactionResponse.json();
    
    const senderData: RiskPayload = transactionData.sender_risk || transactionData;
    const recipientData: RiskPayload = transactionData.recipient_risk || transactionData;

    const chainlinkStatus = await confirmChainlinkLog(transactionHash);
    
    const combinedRisk = transactionData.combined_risk || {
      risk_score: transactionData.risk_score || 0,
      risk_level: transactionData.risk_level || 'unknown',
      recommendation: getRecommendation(transactionData.risk_level || 'unknown'),
    };

    // Transform the response to match the expected frontend structure
    const transformedResponse = {
      transaction: {
        sender: body.sender,
        recipient: body.recipient,
        amount_eth: body.amount_eth,
      },
      chainlink: {
        transaction_hash: transactionHash,
        logging_expected: true,
        logged: chainlinkStatus.logged,
        verified: chainlinkStatus.verified,
      },
      combined_risk: {
        risk_score: combinedRisk.risk_score || 0,
        risk_level: combinedRisk.risk_level || 'unknown',
        recommendation: combinedRisk.recommendation || getRecommendation(combinedRisk.risk_level || 'unknown'),
      },
      sender_risk: {
        address: body.sender,
        risk_score: senderData.risk_score || 0,
        risk_level: senderData.risk_level || 'unknown',
        is_fraud: senderData.is_fraud || false,
        confidence: senderData.confidence || 0,
        probabilities: senderData.probabilities || { legitimate: 0, fraud: 0 },
      },
      recipient_risk: {
        address: body.recipient,
        risk_score: recipientData.risk_score || 0,
        risk_level: recipientData.risk_level || 'unknown',
        is_fraud: recipientData.is_fraud || false,
        confidence: recipientData.confidence || 0,
        probabilities: recipientData.probabilities || { legitimate: 0, fraud: 0 },
      },
    };
    
    return NextResponse.json(transformedResponse);
  } catch (error) {
    console.error('Transaction risk prediction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getRecommendation(riskLevel: string): 'safe' | 'caution' | 'risky' {
  switch (riskLevel.toLowerCase()) {
    case 'low':
      return 'safe';
    case 'medium':
      return 'caution';
    case 'high':
      return 'risky';
    default:
      return 'caution';
  }
}
