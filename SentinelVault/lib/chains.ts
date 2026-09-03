import { buildEthTx } from "./eth";
import { buildBtcTx } from "./btc";
import { buildSolTx } from "./sol";
import { FeeSpeed } from "./env";

export interface BuildTxParams {
  from: string;
  to: string;
  amount: string | number;
  speed?: FeeSpeed;
}

export const chains = {
  ethereum: {
    label: "Ethereum",
    buildTx: async ({ from, to, amount, speed = "normal" }: BuildTxParams) =>
      await buildEthTx(from, to, amount as string, speed),
  },

  bitcoin: {
    label: "Bitcoin",
    buildTx: async ({ from, to, amount, speed = "normal" }: BuildTxParams) =>
      await buildBtcTx(from, to, String(amount), speed),
  },

  solana: {
    label: "Solana",
    buildTx: async ({ from, to, amount, speed = "normal" }: BuildTxParams) =>
      await buildSolTx(from, to, String(amount), speed),
  },
};
