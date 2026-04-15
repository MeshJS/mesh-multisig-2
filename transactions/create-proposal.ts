import {
  drepRegisterDeposit,
  govDeposit,
  stakeRegisterDeposit,
  totalDeposit,
} from "@/utils/constants";
import { CrowdFundScript } from "@/utils/scripts";
import {
  conStr0,
  conStr1,
  IEvaluator,
  IFetcher,
  ISubmitter,
  MeshTxBuilder,
} from "@meshsdk/core";
import { Address, HexBlob, PoolId } from "@meshsdk/core-cst";
import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";

export const createProposal = async (
  wallet: MeshCardanoHeadlessWallet,
  deadline: number,
  fetcher: IFetcher,
  evaluator: IEvaluator,
  submitter: ISubmitter,
  proposalHash: string,
) => {
  const walletAddress = await wallet.getChangeAddressBech32();
  const utxos = await wallet.getUtxosMesh();
  const initialTxHash = utxos[0].input.txHash;
  const initialTxIndex = utxos[0].input.outputIndex;
  const addressBech32 = (await wallet.getUsedAddresses())[0];
  if (!addressBech32) {
    throw new Error("Wallet address not found");
  }
  const address = Address.fromBytes(HexBlob(addressBech32));
  const paymentKeyHash = address.getProps().paymentPart?.hash;
  if (!paymentKeyHash) {
    throw new Error("Wallet address does not have a payment key hash");
  }
  const scripts = new CrowdFundScript(initialTxHash, initialTxIndex);
  const authTokenScript = scripts.authTokenScript();
  const crowdfundStakeScript = scripts.crowdfundStakeScript();
  const crowdfundScript = scripts.crowdfundScript();
  const shareTokenScript = scripts.shareTokenScript();

  const txBuilder = new MeshTxBuilder({
    fetcher: fetcher,
    evaluator: evaluator,
  });

  // Mint the auth token to the script address
  const txHex = await txBuilder
    .txIn(initialTxHash, initialTxIndex)
    .selectUtxosFrom(utxos)
    .mintPlutusScriptV3()
    .mint("1", scripts.authTokenPolicyId(), "")
    .mintRedeemerValue(conStr0([]), "JSON")
    .mintingScript(authTokenScript.cbor)
    .txOut(crowdfundScript.address, [
      { unit: "lovelace", quantity: "5000000" },
      {
        unit: scripts.authTokenPolicyId(),
        quantity: "1",
      },
    ])
    .txOutInlineDatumValue(
      scripts.crowdfundScript().datum(
        conStr0([
          conStr0([
            conStr1([{ bytes: scripts.stakeHash() }]),
            { bytes: shareTokenScript.hash },
            conStr0([conStr1([{ bytes: crowdfundScript.hash }]), conStr1([])]),
            { int: totalDeposit },
            { int: 0 },
            conStr0([]),
            { int: deadline },
            { int: 0 },
            { int: 0 },
          ]),
          conStr0([
            { bytes: scripts.authTokenPolicyId() },
            { bytes: paymentKeyHash },
            { bytes: proposalHash },
            {
              bytes: PoolId.toKeyHash(
                PoolId(
                  "pool1wvqhvyrgwch4jq9aa84hc8q4kzvyq2z3xr6mpafkqmx9wce39zy",
                ),
              ),
            },
            { int: stakeRegisterDeposit },
            { int: drepRegisterDeposit },
            { int: govDeposit },
          ]),
        ]),
      ),
      "JSON",
    )
    .txInCollateral(utxos[0].input.txHash, utxos[0].input.outputIndex)
    .changeAddress(walletAddress)
    .complete();

  const signedTx = await wallet.signTxReturnFullTx(txHex);
  const txHash = await submitter.submitTx(signedTx);
  console.log("Transaction submitted with hash:", txHash);

  let savedScripts: Record<string, unknown> = {};
  const rawScripts = localStorage.getItem("scripts");
  if (rawScripts) {
    try {
      savedScripts = JSON.parse(rawScripts) as Record<string, unknown>;
    } catch {
      savedScripts = {};
    }
  }
  savedScripts[authTokenScript.hash] = {
    initialTxHashIndex: {
      txHash: initialTxHash,
      txIndex: initialTxIndex,
    },
    authToken: {
      cbor: authTokenScript.cbor,
      hash: authTokenScript.hash,
    },
    crowdfundStake: {
      cbor: crowdfundStakeScript.cbor,
      hash: crowdfundStakeScript.hash,
    },
    crowdfund: {
      cbor: crowdfundScript.cbor,
      hash: crowdfundScript.hash,
    },
    shareToken: {
      cbor: shareTokenScript.cbor,
      hash: shareTokenScript.hash,
    },
  };
  localStorage.setItem("scripts", JSON.stringify(savedScripts));

  return txHash;
};
