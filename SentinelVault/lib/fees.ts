export async function getBtcFeeRate() {
  const res = await fetch(
    "https://mempool.space/api/v1/fees/recommended"
  );

  const data = await res.json();
  return data.fastestFee;
}