import { NextRequest, NextResponse } from 'next/server';

const CRYPTO_ML_API_URL = process.env.CRYPTO_ML_API_URL || 'http://localhost:8000';

type ChainlinkLog = {
  transaction_hash: string;
  risk_score: number;
  risk_level: string;
  is_fraud: boolean;
  timestamp: string;
  verified: boolean;
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = searchParams.get('limit') || '10';
  const transactionHash = searchParams.get('transaction_hash');

  try {
    const response = await fetch(`${CRYPTO_ML_API_URL}/logs?limit=${limit}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.detail || errorData.error || 'Failed to fetch Chainlink logs' },
        { status: response.status }
      );
    }

    const logs: ChainlinkLog[] = await response.json();
    const filteredLogs = transactionHash
      ? logs.filter((log) => log.transaction_hash === transactionHash)
      : logs;

    return NextResponse.json({
      logs: filteredLogs,
      found: filteredLogs.length > 0,
    });
  } catch (error) {
    console.error('Chainlink logs proxy error:', error);
    return NextResponse.json(
      { error: 'Chainlink logs are not reachable' },
      { status: 503 }
    );
  }
}
