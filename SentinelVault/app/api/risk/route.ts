import { NextRequest, NextResponse } from 'next/server';

const CRYPTO_ML_API_URL = process.env.CRYPTO_ML_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Forward the request to the crypto-ML API
    const response = await fetch(`${CRYPTO_ML_API_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to get risk prediction' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Risk prediction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Check if the crypto-ML API is healthy
    const response = await fetch(`${CRYPTO_ML_API_URL}/health`);
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Crypto ML API is not available' },
        { status: 503 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { error: 'Crypto ML API is not reachable' },
      { status: 503 }
    );
  }
}
