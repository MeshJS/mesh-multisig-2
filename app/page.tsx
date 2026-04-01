"use client";

import { useState, useEffect } from "react";
import { AddressType, MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import { useTheme } from "./theme-provider";
import { YaciProvider2 } from "@/tests/test-utils";
import { createProposal } from "@/transactions/create-proposal";
import { infoActionDatum } from "@/utils/proposal";
import { PlutusData } from "@meshsdk/core-cst";
import { MeshTxBuilder, UTxO } from "@meshsdk/core";

const DEMO_MNEMONIC = [
  "horror",
  "hand",
  "pulp",
  "market",
  "slight",
  "photo",
  "frown",
  "pulp",
  "crawl",
  "day",
  "senior",
  "property",
  "calm",
  "inner",
  "reflect",
  "stage",
  "spot",
  "before",
  "charge",
  "artist",
  "together",
  "heavy",
  "quote",
  "soup",
] as const;

type ProposalType = "info" | "treasury";

type Beneficiary = {
  rewardAddress: string;
  amount: string;
};

type ProposalInfo = {
  utxo: UTxO;
  fundedAmount: bigint;
};

const DEFAULT_BENEFICIARY: Beneficiary = { rewardAddress: "", amount: "" };

export default function Home() {
  const { isDark, toggleTheme } = useTheme();

  // Wallet state
  const [isConnecting, setIsConnecting] = useState(false);
  const [wallet, setWallet] = useState<MeshCardanoHeadlessWallet | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletLovelace, setWalletLovelace] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Proposal form state
  const [proposalType, setProposalType] = useState<ProposalType>("info");
  const [deadline, setDeadline] = useState("");
  const [guardrailScriptHash, setGuardrailScriptHash] = useState("");
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([
    { ...DEFAULT_BENEFICIARY },
  ]);

  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [proposalInfo, setProposalInfo] = useState<ProposalInfo[]>([]);
  const [contributeAmounts, setContributeAmounts] = useState<{
    [key: number]: string;
  }>({});

  const provider = new YaciProvider2("http://localhost:8080/api/v1");

  // Load persisted transactions
  useEffect(() => {
    const loadPersistedTransactions = async () => {
      const saved = localStorage.getItem("proposalTxHashes");
      if (saved) {
        const hashes = JSON.parse(saved);

        setTxHashes(hashes);
      }
    };
    loadPersistedTransactions();
  }, []);

  useEffect(() => {
    const fetchTransactionInfo = async () => {
      const fetchWithRetry = async (hash: string, maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const txInfo = (await provider.fetchUTxOs(hash, 0))[0];
            return {
              utxo: txInfo,
              fundedAmount:
                PlutusData.fromCbor(txInfo.output.plutusData!)
                  .asConstrPlutusData()
                  ?.getData()
                  .get(4)
                  ?.asInteger() ?? BigInt(0),
            };
          } catch (error) {
            console.log(
              `Failed to fetch tx info (attempt ${attempt}/${maxRetries}):`,
              error,
            );
            if (attempt < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, 5000));
            } else {
              throw error;
            }
          }
        }
      };
      const proposalInfoList: ProposalInfo[] = [];
      for (const hash of txHashes) {
        try {
          const info = await fetchWithRetry(hash);
          if (!info) {
            throw new Error(`Failed to fetch tx info for ${hash}`);
          }
          proposalInfoList.push(info);
        } catch (error) {
          console.error(
            `Failed to fetch tx info for ${hash} after retries:`,
            error,
          );
        }
      }
      setProposalInfo(proposalInfoList);
    };
    if (txHashes.length > 0) {
      fetchTransactionInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txHashes]);

  const connectDemoWallet = async () => {
    try {
      setIsConnecting(true);
      setWalletError(null);

      const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
        fetcher: provider!,
        networkId: 0,
        walletAddressType: AddressType.Base,
        mnemonic: [...DEMO_MNEMONIC],
      });

      setWallet(wallet);

      const address = await wallet.getChangeAddressBech32();
      const balance = await wallet.getBalanceMesh();
      const lovelace =
        balance.find((a) => a.unit === "lovelace")?.quantity ?? "0";
      setWalletAddress(address);
      setWalletLovelace(lovelace);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to initialize demo wallet.";
      setWalletError(message);
      setWalletAddress(null);
      setWalletLovelace(null);
    } finally {
      setIsConnecting(false);
    }
  };

  const addBeneficiary = () =>
    setBeneficiaries((prev) => [...prev, { ...DEFAULT_BENEFICIARY }]);

  const removeBeneficiary = (index: number) =>
    setBeneficiaries((prev) => prev.filter((_, i) => i !== index));

  const updateBeneficiary = (
    index: number,
    field: keyof Beneficiary,
    value: string,
  ) =>
    setBeneficiaries((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    );

  const handleContribute = async (proposalIndex: number) => {
    const amount = contributeAmounts[proposalIndex];
    if (!amount) {
      setWalletError("Please enter a contribute amount");
      return;
    }
    // TODO: Implement contribution logic with amount
    console.log("Contributing to proposal:", proposalIndex, "Amount:", amount);
  };

  const handleProposalSubmit = async (
    e: React.SyntheticEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if (proposalType === "info") {
      if (!wallet) {
        setWalletError("Please connect your wallet first.");
        return;
      }
      const txHash = await createProposal(
        wallet,
        Date.now() + 1000 * 60 * 60 * 24, // 24 hours from now
        provider,
        provider,
        provider,
        infoActionDatum().hash(),
      );
      if (txHash) {
        // Save the hash and update state to trigger fetch
        const saved = localStorage.getItem("proposalTxHashes");
        const hashes = saved ? JSON.parse(saved) : [];
        const updated = [txHash, ...hashes];
        localStorage.setItem("proposalTxHashes", JSON.stringify(updated));
        setTxHashes(updated);
      }
    } else {
      console.log("Treasury withdrawal proposal submitted", {
        guardrailScriptHash,
        beneficiaries,
      });
    }
  };

  // Shared input class helpers
  const inputClass = isDark
    ? "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
    : "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none";

  const labelClass = isDark
    ? "mb-1 block text-xs font-medium text-zinc-400"
    : "mb-1 block text-xs font-medium text-zinc-500";

  return (
    <div
      className={isDark ? "min-h-screen bg-zinc-950" : "min-h-screen bg-white"}
    >
      <nav
        className={
          isDark
            ? "flex items-center justify-between border-b border-zinc-800 px-6 py-4"
            : "flex items-center justify-between border-b border-zinc-200 px-6 py-4"
        }
      >
        <span
          className={
            isDark
              ? "text-sm font-semibold tracking-wide text-zinc-100"
              : "text-sm font-semibold tracking-wide text-zinc-900"
          }
        >
          Mesh Multisig
        </span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label="Toggle dark mode"
            onClick={toggleTheme}
            className={
              isDark
                ? "relative inline-flex h-8 w-14 items-center rounded-full bg-zinc-100 transition-colors"
                : "relative inline-flex h-8 w-14 items-center rounded-full bg-zinc-700 transition-colors"
            }
          >
            <span
              aria-hidden="true"
              className={
                isDark
                  ? "inline-block h-6 w-6 translate-x-7 rounded-full bg-zinc-900 transition-transform"
                  : "inline-block h-6 w-6 translate-x-1 rounded-full bg-white transition-transform"
              }
            />
          </button>
          <div className="flex flex-col items-end">
            <button
              type="button"
              className={
                isDark
                  ? "rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-300"
                  : "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
              }
              onClick={connectDemoWallet}
              disabled={isConnecting}
            >
              {isConnecting
                ? "Connecting..."
                : walletAddress
                  ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`
                  : "Connect Wallet"}
            </button>
            {walletLovelace !== null ? (
              <span
                className={
                  isDark
                    ? "mt-1 text-xs text-zinc-400"
                    : "mt-1 text-xs text-zinc-500"
                }
              >
                {(Number(walletLovelace) / 1_000_000).toLocaleString(
                  undefined,
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  },
                )}{" "}
                ₳
              </span>
            ) : null}
          </div>
        </div>
      </nav>
      {walletError ? (
        <p className="px-6 py-4 text-sm text-red-500">{walletError}</p>
      ) : null}

      {walletAddress ? (
        <main className="mx-auto px-6 py-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Proposal Transactions Section */}
            {proposalInfo.length > 0 ? (
              <div>
                <p
                  className={
                    isDark
                      ? "text-sm text-zinc-400 mb-4"
                      : "text-sm text-zinc-600 mb-4"
                  }
                >
                  Proposal transactions:
                </p>
                <div className="space-y-4">
                  {proposalInfo.map((info, i) => (
                    <div
                      key={i}
                      className={
                        isDark
                          ? "rounded-md border border-zinc-700 bg-zinc-900 p-3"
                          : "rounded-md border border-zinc-200 bg-zinc-50 p-3"
                      }
                    >
                      <div
                        className={
                          isDark
                            ? "text-xs text-zinc-400 mb-2 font-mono break-all"
                            : "text-xs text-zinc-600 mb-2 font-mono break-all"
                        }
                      >
                        #{i + 1}
                      </div>
                      <div
                        className={
                          isDark
                            ? "text-sm text-zinc-300 mb-3 p-2 bg-zinc-950 rounded"
                            : "text-sm text-zinc-700 mb-3 p-2 bg-white rounded"
                        }
                      >
                        <strong>Funded Amount:</strong> (
                        {(Number(info.fundedAmount) / 1_000_000).toFixed(2)} ₳)
                      </div>
                      <pre
                        className={
                          isDark
                            ? "text-xs bg-zinc-950 p-2 rounded overflow-auto max-h-48 text-zinc-300"
                            : "text-xs bg-white p-2 rounded overflow-auto max-h-48 text-zinc-700"
                        }
                      >
                        {JSON.stringify(info.utxo, null, 2)}
                      </pre>
                      <div className="mt-3 flex gap-2">
                        <input
                          type="number"
                          min="0"
                          placeholder="Amount (lovelace)"
                          value={contributeAmounts[i] || ""}
                          onChange={(e) =>
                            setContributeAmounts((prev) => ({
                              ...prev,
                              [i]: e.target.value,
                            }))
                          }
                          className={
                            isDark
                              ? "flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                              : "flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none"
                          }
                        />
                        <button
                          type="button"
                          onClick={() => handleContribute(i)}
                          className={
                            isDark
                              ? "rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-300"
                              : "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
                          }
                        >
                          Contribute
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Form Section */}
            <div>
              <h2
                className={
                  isDark
                    ? "mb-6 text-lg font-semibold text-zinc-100"
                    : "mb-6 text-lg font-semibold text-zinc-900"
                }
              >
                Create Crowdfund Proposal
              </h2>

              <form onSubmit={handleProposalSubmit} className="space-y-6">
                {/* Action type */}
                <div>
                  <label htmlFor="proposalType" className={labelClass}>
                    Action type
                  </label>
                  <select
                    id="proposalType"
                    value={proposalType}
                    onChange={(e) =>
                      setProposalType(e.target.value as ProposalType)
                    }
                    className={inputClass}
                  >
                    <option value="info">Info Action</option>
                    <option value="treasury">Treasury Withdrawal</option>
                  </select>
                </div>

                {/* Deadline — shared by both types */}
                <div>
                  <label htmlFor="deadline" className={labelClass}>
                    Deadline
                  </label>
                  <input
                    id="deadline"
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className={inputClass}
                  />
                </div>

                {/* Treasury-only fields */}
                {proposalType === "treasury" ? (
                  <>
                    <div>
                      <label htmlFor="guardrailHash" className={labelClass}>
                        Guardrail script hash
                      </label>
                      <input
                        id="guardrailHash"
                        type="text"
                        placeholder="e.g. 438c6bf7…"
                        value={guardrailScriptHash}
                        onChange={(e) => setGuardrailScriptHash(e.target.value)}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className={labelClass}>Beneficiaries</span>
                        <button
                          type="button"
                          onClick={addBeneficiary}
                          className={
                            isDark
                              ? "text-xs font-medium text-zinc-300 hover:text-zinc-100"
                              : "text-xs font-medium text-zinc-600 hover:text-zinc-900"
                          }
                        >
                          + Add beneficiary
                        </button>
                      </div>

                      <div className="space-y-3">
                        {beneficiaries.map((b, i) => (
                          <div key={i} className="flex gap-2">
                            <div className="flex-1">
                              {i === 0 ? (
                                <label className={labelClass}>
                                  Reward address
                                </label>
                              ) : null}
                              <input
                                type="text"
                                placeholder="stake_test1…"
                                value={b.rewardAddress}
                                onChange={(e) =>
                                  updateBeneficiary(
                                    i,
                                    "rewardAddress",
                                    e.target.value,
                                  )
                                }
                                className={inputClass}
                              />
                            </div>
                            <div className="w-40">
                              {i === 0 ? (
                                <label className={labelClass}>
                                  Amount (lovelace)
                                </label>
                              ) : null}
                              <input
                                type="number"
                                min="0"
                                placeholder="1000000"
                                value={b.amount}
                                onChange={(e) =>
                                  updateBeneficiary(i, "amount", e.target.value)
                                }
                                className={inputClass}
                              />
                            </div>
                            {beneficiaries.length > 1 ? (
                              <div className={i === 0 ? "mt-5" : ""}>
                                <button
                                  type="button"
                                  onClick={() => removeBeneficiary(i)}
                                  aria-label="Remove beneficiary"
                                  className={
                                    isDark
                                      ? "rounded px-2 py-2 text-zinc-500 hover:text-red-400"
                                      : "rounded px-2 py-2 text-zinc-400 hover:text-red-500"
                                  }
                                >
                                  ✕
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                <button
                  type="submit"
                  className={
                    isDark
                      ? "rounded-md bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-300"
                      : "rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
                  }
                >
                  Submit proposal
                </button>
              </form>
            </div>
          </div>
        </main>
      ) : null}
    </div>
  );
}
