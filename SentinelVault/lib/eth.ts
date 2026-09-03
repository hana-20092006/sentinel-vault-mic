import { ethers } from "ethers";
import { FeeSpeed, config } from "./env";
import { getEthFeeEstimate, selectEthFee } from "./feeEstimate";
import { validateTxInput } from "./validators";

export async function buildEthTx(
  from: string,
  to: string,
  amount: string,
  speed: FeeSpeed = "normal"
) {
  // Validate inputs
  const validation = validateTxInput(from, to, amount, "ethereum");
  if (!validation.valid) {
    throw new Error(`Validation error: ${validation.errors.join(", ")}`);
  }

  const provider = new ethers.JsonRpcProvider(config.ethereum.rpc);

  try {
    const nonce = await provider.getTransactionCount(from);
    const feeEstimate = await getEthFeeEstimate();
    const maxFeePerGas = ethers.parseUnits(selectEthFee(feeEstimate, speed), "gwei");

    const tx = {
      to,
      value: ethers.parseEther(amount),
      nonce,
      gasLimit: 21000n,
      maxFeePerGas,
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"), // 2 gwei standard
      chainId: 1,
      type: 2,
    };

    return ethers.Transaction.from(tx).unsignedSerialized;
  } catch (error) {
    throw new Error(`Failed to build Ethereum transaction: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}