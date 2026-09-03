interface RiskFeatures {
  Avg_min_between_sent_tnx: number;
  Avg_min_between_received_tnx: number;
  Time_Diff_between_first_and_last_Mins_: number;
  Sent_tnx: number;
  Received_tnx: number;
  Number_of_Created_Contracts: number;
  Unique_Received_From_Addresses: number;
  Unique_Sent_To_Addresses: number;
  min_value_received: number;
  max_value_received: number;
  avg_val_received: number;
  min_val_sent: number;
  max_val_sent: number;
  avg_val_sent: number;
  total_eth_sent: number;
  total_eth_received: number;
  total_eth_balance: number;
  total_erc20_tnxs: number;
  erc20_total_eth_sent: number;
  erc20_total_eth_received: number;
  erc20_total_eth_balance: number;
}

interface RiskPrediction {
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  is_fraud: boolean;
  confidence: number;
  probabilities: {
    legitimate: number;
    fraud: number;
  };
}

interface RiskAPIHealth {
  status: string;
  model_loaded: boolean;
  available: boolean;
  error?: string;
}

export async function predictRisk(features: RiskFeatures): Promise<RiskPrediction> {
  try {
    const response = await fetch('/api/risk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ features }),
    });

    if (!response.ok) {
      throw new Error(`Risk prediction failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error predicting risk:', error);
    throw error;
  }
}

export async function checkRiskAPIHealth(): Promise<RiskAPIHealth> {
  try {
    const response = await fetch('/api/risk');
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);

      return {
        status: 'unavailable',
        model_loaded: false,
        available: false,
        error: errorData?.error || `Health check failed: ${response.status} ${response.statusText}`.trim(),
      };
    }

    const data = await response.json();

    return {
      status: data.status || 'unknown',
      model_loaded: Boolean(data.model_loaded),
      available: true,
      error: data.error,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      model_loaded: false,
      available: false,
      error: error instanceof Error ? error.message : 'Unable to reach risk API',
    };
  }
}

// Helper function to extract features from transaction data
export function extractFeaturesFromTransactions(transactions: any[], address: string): RiskFeatures {
  // Default values
  const features: RiskFeatures = {
    Avg_min_between_sent_tnx: 0,
    Avg_min_between_received_tnx: 0,
    Time_Diff_between_first_and_last_Mins_: 0,
    Sent_tnx: 0,
    Received_tnx: 0,
    Number_of_Created_Contracts: 0,
    Unique_Received_From_Addresses: 0,
    Unique_Sent_To_Addresses: 0,
    min_value_received: 0,
    max_value_received: 0,
    avg_val_received: 0,
    min_val_sent: 0,
    max_val_sent: 0,
    avg_val_sent: 0,
    total_eth_sent: 0,
    total_eth_received: 0,
    total_eth_balance: 0,
    total_erc20_tnxs: 0,
    erc20_total_eth_sent: 0,
    erc20_total_eth_received: 0,
    erc20_total_eth_balance: 0,
  };

  if (!transactions || transactions.length === 0) {
    return features;
  }

  const sentTxs = transactions.filter(tx => 
    tx.from && tx.from.toLowerCase() === address.toLowerCase()
  );
  const receivedTxs = transactions.filter(tx => 
    tx.to && tx.to.toLowerCase() === address.toLowerCase()
  );

  features.Sent_tnx = sentTxs.length;
  features.Received_tnx = receivedTxs.length;

  // Calculate unique addresses
  const uniqueSentTo = new Set(sentTxs.map(tx => tx.to).filter(Boolean));
  const uniqueReceivedFrom = new Set(receivedTxs.map(tx => tx.from).filter(Boolean));
  features.Unique_Sent_To_Addresses = uniqueSentTo.size;
  features.Unique_Received_From_Addresses = uniqueReceivedFrom.size;

  // Calculate value statistics
  const sentValues = sentTxs.map(tx => parseFloat(tx.value) || 0).filter(v => v > 0);
  const receivedValues = receivedTxs.map(tx => parseFloat(tx.value) || 0).filter(v => v > 0);

  if (sentValues.length > 0) {
    features.min_val_sent = Math.min(...sentValues);
    features.max_val_sent = Math.max(...sentValues);
    features.avg_val_sent = sentValues.reduce((a, b) => a + b, 0) / sentValues.length;
    features.total_eth_sent = features.avg_val_sent * sentValues.length;
  }

  if (receivedValues.length > 0) {
    features.min_value_received = Math.min(...receivedValues);
    features.max_value_received = Math.max(...receivedValues);
    features.avg_val_received = receivedValues.reduce((a, b) => a + b, 0) / receivedValues.length;
    features.total_eth_received = features.avg_val_received * receivedValues.length;
  }

  features.total_eth_balance = features.total_eth_received - features.total_eth_sent;

  // Calculate time differences
  const timestamps = transactions.map(tx => new Date(tx.timeStamp || tx.timestamp).getTime()).filter(t => !isNaN(t));
  if (timestamps.length > 1) {
    timestamps.sort((a, b) => a - b);
    features.Time_Diff_between_first_and_last_Mins_ = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60);
    
    // Calculate average time between transactions
    const timeDiffs = [];
    for (let i = 1; i < timestamps.length; i++) {
      timeDiffs.push((timestamps[i] - timestamps[i - 1]) / (1000 * 60));
    }
    
    if (timeDiffs.length > 0) {
      const sentTimeDiffs = [];
      const receivedTimeDiffs = [];
      
      // This is a simplified calculation - in practice, you'd want more sophisticated timing analysis
      features.Avg_min_between_sent_tnx = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
      features.Avg_min_between_received_tnx = features.Avg_min_between_sent_tnx;
    }
  }

  return features;
}
