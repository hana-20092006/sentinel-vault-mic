import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { FeeSpeed, config } from "./env";
import { getSolFeeEstimate, selectSolFee } from "./feeEstimate";
import { validateTxInput } from "./validators";
import { parseAmountToBaseUnits } from "./amount";

export async function buildSolTx(
  from: string,
  to: string,
  amount: string,
  speed: FeeSpeed = "normal"
) {
  // Validate inputs
  const validation = validateTxInput(from, to, amount, "solana");
  if (!validation.valid) {
    throw new Error(`Validation error: ${validation.errors.join(", ")}`);
  }

  try {
    const connection = new Connection(config.solana.rpc, config.solana.commitment);

    const fromPub = new PublicKey(from);
    const toPub = new PublicKey(to);

    const feeEstimate = await getSolFeeEstimate();
    const priorityFee = selectSolFee(feeEstimate, speed);

    const lamports = parseAmountToBaseUnits(amount, 9);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromPub,
        toPubkey: toPub,
        lamports,
      })
    );

    tx.feePayer = fromPub;

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const serialized = tx.serialize({
      requireAllSignatures: false,
    });

    return Buffer.from(serialized).toString("base64");
  } catch (error) {
    throw new Error(`Failed to build Solana transaction: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
