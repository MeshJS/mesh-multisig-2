import {
  IFetcher,
  IEvaluator,
  ISubmitter,
  MeshTxBuilder,
  conStr,
  conStr0,
  MeshValue,
} from "@meshsdk/core";
import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import { ProposalInfo } from "./contribute-proposal";
import {
  stakeRegisterDeposit,
  drepRegisterDeposit,
  mockPoolId,
} from "@/tests/test-utils";
import { fromPlutusDataToJson, PlutusData } from "@meshsdk/core-cst";
import { CrowdfundGovDatum } from "@/types/gcf-spend";
import { CrowdFundScript } from "@/utils/scripts";

export const registerStakeProposal = async (
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

  // Register DRep, Stake, Delegate and vote
  const txHex = await txBuilder
    .selectUtxosFrom(utxos)
    .txInCollateral(
      collaterals[0].input.txHash,
      collaterals[0].input.outputIndex,
    )
    .setTotalCollateral("5000000")
    .spendingPlutusScriptV3()
    .txIn(proposalInfo.utxo.input.txHash, proposalInfo.utxo.input.outputIndex)
    .txInRedeemerValue(conStr(2, []), "JSON")
    .txInInlineDatumPresent()
    .spendingTxInReference(scriptRef, 0)
    .txOut(
      proposalInfo.utxo.output.address,
      MeshValue.fromAssets(proposalInfo.utxo.output.amount)
        .negateAsset({
          unit: "lovelace",
          quantity: String(
            BigInt(stakeRegisterDeposit) + BigInt(drepRegisterDeposit),
          ),
        })
        .toAssets(),
    )
    .txOutInlineDatumValue(previousDatum, "JSON")
    .registerStakeCertificate(scripts.rewardAddress())
    .drepRegistrationCertificate(scripts.drepId())
    .certificateScript(scripts.crowdfundStakeScript().cbor, "V3")
    .certificateRedeemerValue(conStr0([]), "JSON", {
      mem: 152103,
      steps: 53714095,
    })
    .voteDelegationCertificate(
      {
        dRepId: scripts.drepId(),
      },
      scripts.rewardAddress(),
    )
    .certificateScript(scripts.crowdfundStakeScript().cbor, "V3")
    .certificateRedeemerValue(conStr0([]), "JSON", {
      mem: 152103,
      steps: 53714095,
    })
    .delegateStakeCertificate(scripts.rewardAddress(), mockPoolId)
    .certificateScript(scripts.crowdfundStakeScript().cbor, "V3")
    .certificateRedeemerValue(conStr0([]), "JSON", {
      mem: 152103,
      steps: 53714095,
    })
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
