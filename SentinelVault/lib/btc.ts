import * as bitcoin from "bitcoinjs-lib";
import { fetchUtxos } from "./utxo";
import { getBtcFeeEstimate, selectBtcFee } from "./feeEstimate";
import { validateTxInput } from "./validators";
import { FeeSpeed, config } from "./env";
import { parseAmountToBaseUnits } from "./amount";

const DUST_THRESHOLD = config.bitcoin.dustThreshold;

export async function buildBtcTx(
  from: string,
  to: string,
  amount: string,
  speed: FeeSpeed = "normal"
) {
  // Validate inputs
  const validation = validateTxInput(from, to, amount, "bitcoin");
  if (!validation.valid) {
    throw new Error(`Validation error: ${validation.errors.join(", ")}`);
  }

  try {
    const [utxos, feeEstimate] = await Promise.all([
      fetchUtxos(from),
      getBtcFeeEstimate(),
    ]);

    if (!utxos.length) throw new Error("No UTXOs found for this address.");

    const feeRate = selectBtcFee(feeEstimate, speed);
    const amountSats = Number(parseAmountToBaseUnits(amount, 8));

    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
    let inputSum = 0;

    for (const utxo of utxos) {
      if (!utxo.rawTxHex) throw new Error(`Missing raw tx hex for UTXO ${utxo.txid}`);

      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(utxo.rawTxHex, "hex"),
      });

      inputSum += utxo.value;
      if (inputSum >= amountSats) break;
    }

    const inputCount = psbt.inputCount;
    const outputCount = 2;
    const estimatedSize = inputCount * 180 + outputCount * 34 + 10;
    const fee = Math.floor(estimatedSize * feeRate);
    const change = inputSum - amountSats - fee;

    if (change < 0) throw new Error("Insufficient BTC balance to cover amount + fees.");

    psbt.addOutput({ address: to, value: BigInt(amountSats) });
    if (change > DUST_THRESHOLD) {
      psbt.addOutput({ address: from, value: BigInt(Math.floor(change)) });
    }

    return psbt.toBase64();
  } catch (error) {
    throw new Error(`Failed to build Bitcoin transaction: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
