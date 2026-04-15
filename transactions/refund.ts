import {
  IFetcher,
  IEvaluator,
  ISubmitter,
  conStr0,
  conStr3,
  MeshTxBuilder,
  conStr1,
} from "@meshsdk/core";
import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import { ProposalInfo } from "./contribute-proposal";
import { CrowdFundScript } from "@/utils/scripts";
import { CrowdfundGovDatum, Refundable } from "@/types/gcf-spend";
import { fromPlutusDataToJson, PlutusData } from "@meshsdk/core-cst";

export const refundProposal = async (
  wallet: MeshCardanoHeadlessWallet,
  fetcher: IFetcher,
  evaluator: IEvaluator,
  submitter: ISubmitter,
  proposalInfo: ProposalInfo,
  refundAmount: number,
) => {
  const scripts = new CrowdFundScript(
    proposalInfo.scripts.initialTxHashIndex.txHash,
    proposalInfo.scripts.initialTxHashIndex.txIndex,
  );
  const utxos = await wallet.getUtxosMesh();
  const collaterals = utxos.filter((u) =>
    u.output.amount.some(
      (a) => a.unit === "lovelace" && BigInt(a.quantity) >= 5000000,
    ),
  );
  if (collaterals.length === 0) {
    throw new Error(
      "No utxos larger than 5 ADA available in the wallet for collateral",
    );
  }

  const walletAddress = await wallet.getChangeAddressBech32();
  if (!walletAddress) {
    throw new Error("Wallet address not found");
  }

  const scriptRef = localStorage.getItem("scriptRef");
  if (!scriptRef) {
    throw new Error("Script reference not found in local storage");
  }

  const previousDatum: CrowdfundGovDatum = fromPlutusDataToJson(
    PlutusData.fromCbor(proposalInfo.utxo.output.plutusData),
  ) as CrowdfundGovDatum;

  const previousCrowdfundStatus: Refundable = previousDatum
    .fields[0] as unknown as Refundable;

  const newCrowdfundStatus: Refundable = conStr3([
    previousCrowdfundStatus.fields[0],
    previousCrowdfundStatus.fields[1],
    {
      int:
        BigInt(previousCrowdfundStatus.fields[2]?.int ?? 0) -
        BigInt(refundAmount),
    },
  ]);
  const newDatum: CrowdfundGovDatum = conStr0([
    newCrowdfundStatus,
    previousDatum.fields[1],
  ]) as unknown as CrowdfundGovDatum;

  const txBuilder = new MeshTxBuilder({
    fetcher,
    evaluator,
  });
  const txHex = await txBuilder
    .selectUtxosFrom(utxos)
    .txInCollateral(
      collaterals[0].input.txHash,
      collaterals[0].input.outputIndex,
    )
    .setTotalCollateral("5000000")
    .spendingPlutusScriptV3()
    .txIn(proposalInfo.utxo.input.txHash, proposalInfo.utxo.input.outputIndex)
    .txInRedeemerValue(conStr1([]), "JSON")
    .txInInlineDatumPresent()
    .spendingTxInReference(scriptRef, 0)
    .txOut(scripts.crowdfundScript().address, [
      {
        unit: "lovelace",
        quantity: (5000000).toString(),
      },
      {
        unit: scripts.authTokenPolicyId(),
        quantity: "1",
      },
    ])
    .txOutInlineDatumValue(newDatum, "JSON")
    .mintPlutusScriptV3()
    .mint((-refundAmount).toString(), scripts.shareTokenScript().hash, "")
    .mintingScript(scripts.shareTokenScript().cbor)
    .mintRedeemerValue(conStr1([]), "JSON")
    .changeAddress(walletAddress)
    .complete();

  const signedTx = await wallet.signTxReturnFullTx(txHex);

  let txHash: string;
  try {
    txHash = await submitter.submitTx(signedTx);
    console.log("Transaction submitted with hash:", txHash);

    const savedProposalTxHashes = localStorage.getItem("proposalTxHashes");
    const parsedProposalTxHashes: string[] = savedProposalTxHashes
      ? (JSON.parse(savedProposalTxHashes) as string[])
      : [];
    const updatedProposalTxHashes = parsedProposalTxHashes.map((hash) =>
      hash === proposalInfo.utxo.input.txHash ? txHash : hash,
    );
    localStorage.setItem(
      "proposalTxHashes",
      JSON.stringify(updatedProposalTxHashes),
    );
  } catch (e) {
    console.error("Failed to submit transaction:", e);
    throw e;
  }

  return txHash;
};
