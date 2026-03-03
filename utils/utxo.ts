import { UTxO } from "@meshsdk/core";
import { toTxUnspentOutput, fromTxUnspentOutput } from "@meshsdk/core-cst";
import { Serialization } from "@cardano-sdk/core";

export const utxosToCborMap = (utxos: UTxO[]): string => {
  const cborWriter = new Serialization.CborWriter();
  cborWriter.writeStartMap(utxos.length);
  for (const utxo of utxos) {
    const cardanoUtxo = toTxUnspentOutput(utxo);
    cborWriter.writeEncodedValue(
      Buffer.from(cardanoUtxo.input().toCbor(), "hex"),
    );
    cborWriter.writeEncodedValue(
      Buffer.from(cardanoUtxo.output().toCbor(), "hex"),
    );
  }
  return cborWriter.encodeAsHex();
};

export const cborMapToUtxos = (cborMaps: string[]): UTxO[] => {
  const utxos: UTxO[] = [];
  for (const cborMap of cborMaps) {
    const cborReader = new Serialization.CborReader(
      Buffer.from(cborMap, "hex"),
    );
    const mapLength = cborReader.readStartMap();
    if (!mapLength) {
      throw new Error("Invalid CBOR map: expected a map of UTxOs");
    }
    for (let i = 0; i < mapLength; i++) {
      const inputCbor = cborReader.readEncodedValue();
      const outputCbor = cborReader.readEncodedValue();
      const utxo = Serialization.TransactionUnspentOutput.fromCore([
        Serialization.TransactionInput.fromCbor(inputCbor).toCore(),
        Serialization.TransactionOutput.fromCbor(outputCbor).toCore(),
      ]);
      utxos.push(fromTxUnspentOutput(utxo));
    }
  }
  return utxos;
};
