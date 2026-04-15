import {
  conStr0,
  conStr1,
  conStr3,
  hashDrepAnchor,
  IEvaluator,
  IFetcher,
  ISubmitter,
  MeshTxBuilder,
} from "@meshsdk/core";
import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import { ProposalInfo } from "./contribute-proposal";
import { CrowdFundScript } from "@/utils/scripts";
import { fromPlutusDataToJson, PlutusData } from "@meshsdk/core-cst";
import { Crowdfund, CrowdfundGovDatum, Proposed } from "@/types/gcf-spend";

export const submitGovActionProposal = async (
  wallet: MeshCardanoHeadlessWallet,
  fetcher: IFetcher,
  evaluator: IEvaluator,
  submitter: ISubmitter,
  proposalInfo: ProposalInfo,
) => {
  const txBuilder = new MeshTxBuilder({
    fetcher,
    evaluator,
  });
  const scripts = new CrowdFundScript(
    proposalInfo.scripts.initialTxHashIndex.txHash,
    proposalInfo.scripts.initialTxHashIndex.txIndex,
  );

  const utxos = await wallet.getUtxosMesh();
  const walletAddress = await wallet.getChangeAddressBech32();
  if (!walletAddress) {
    throw new Error("Wallet address not found");
  }
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

  const scriptRef = localStorage.getItem("scriptRef");
  if (!scriptRef) {
    throw new Error("Script reference not found in local storage");
  }

  const previousDatum: CrowdfundGovDatum = fromPlutusDataToJson(
    PlutusData.fromCbor(proposalInfo.utxo.output.plutusData),
  ) as CrowdfundGovDatum;

  const previousCrowdfundStatus: Crowdfund = previousDatum
    .fields[0] as unknown as Crowdfund;
  const newCrowdfundStatus: Proposed = conStr1([
    previousCrowdfundStatus.fields[0],
    previousCrowdfundStatus.fields[1],
    previousCrowdfundStatus.fields[4],
    previousCrowdfundStatus.fields[6],
  ]);
  const newDatum: CrowdfundGovDatum = conStr0([
    newCrowdfundStatus,
    previousDatum.fields[1],
  ]) as unknown as CrowdfundGovDatum;

  const txHex = await txBuilder
    .selectUtxosFrom(utxos)
    .txInCollateral(
      collaterals[0].input.txHash,
      collaterals[0].input.outputIndex,
    )
    .setTotalCollateral("5000000")
    .spendingPlutusScriptV3()
    .txIn(proposalInfo.utxo.input.txHash, proposalInfo.utxo.input.outputIndex)
    .txInInlineDatumPresent()
    .txInRedeemerValue(conStr3([]), "JSON")
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
    .proposal(
      { action: {}, kind: "InfoAction" },
      { anchorDataHash: hashDrepAnchor({}), anchorUrl: "" },
      scripts.rewardAddress(),
      "1000000000",
    )
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
